// Networking: a tiny message bus with two transports.
//
// - Trystero (WebRTC, peer to peer). Browsers find each other through public Nostr relays, then
//   talk directly. There is no game server and nothing to pay for.
//   The same links carry voice chat (see voice.ts).
// - BroadcastChannel, which links tabs in the same browser. Used for solo practice and for
//   testing multiplayer on one machine (add ?net=local to the URL). It can't carry audio.
import { getRelaySockets, joinRoom, selfId as trysteroId } from "trystero";
import type { Room, MessageAction } from "trystero";

export const MESSAGE_TYPES = ["hello", "st", "shot", "hit", "ev", "sb", "rs", "ch", "chit", "kt", "khit", "pick", "pk", "kick", "conv", "vin", "vout", "vs", "vh", "tf", "tfw", "tfx", "tfp", "vk", "bd", "bhit", "cn", "cnu", "trh",
  "mw", "mob", "mhit", "muse", "mev", "mhurt", "mfx", "call", "ver", "mk", "qe", "ow",
  "dk", "dg"] as const;   // the m- ones are for the mines (mines/game.ts), the d- ones the deli (deli/game.ts)
export type MessageType = (typeof MESSAGE_TYPES)[number];
type Handler = (data: any, from: string) => void;

/** How a link to another player is doing, for the debug panel (debug.ts). Counts are running totals. */
export interface LinkStats {
  id: string;
  state: string;                                   // the browser's word for the link: connected, connecting, failed...
  route: "direct" | "relay" | "tab" | "?";         // straight between you, or through the TURN relay
  via: string;                                     // how: e.g. "udp, host/srflx"
  rtt: number | null;                              // the browser's round trip, ms
  ping: number | null;                             // a message there and back, ms
  jitter: number | null;                           // in their voice, ms
  lost: number | null; got: number | null;         // their voice packets lost and received
  bytesIn: number; bytesOut: number;
}

export interface Net {
  readonly selfId: string;
  readonly kind: "p2p" | "local";
  peers(): string[];
  send(type: MessageType, data: unknown, to?: string): void;
  on(type: MessageType, fn: Handler): void;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onError: (msg: string) => void;
  /** Whether this transport carries audio. Only WebRTC rooms do, so voice chat needs one. */
  readonly media: boolean;
  /** Send a stream (the mic) to everyone, or to one player who just joined. */
  addStream(stream: MediaStream, to?: string): void;
  onStream: (stream: MediaStream, from: string) => void;
  leave(): void;
  /** For the debug panel: how each link is doing. */
  linkStats(): Promise<LinkStats[]>;
  /** For the debug panel: how many of the relays used to find other players are connected (WebRTC rooms only). */
  relays(): { up: number; all: number } | null;
}

const APP_ID = "combedowner-fps-v1";

// When the game on this page last changed (vite.config.ts). Players on different versions can still share a room, but the game
// changes several times a day and an old page misses fixes (voice chat among them), so whoever
// meets someone on a newer version is told to refresh, and they're told someone is behind. A new
// version going live mid-game says nothing: it only matters once someone on it joins your room.
declare const __BUILD__: number;
const BUILD = __BUILD__;

// A TURN relay, for when two players' networks won't let them link up directly (mobile data, some
// work, school and hotel wi-fi). Without one, those players simply can't see each other. Set at
// build time: VITE_TURN_URLS (comma separated, e.g. "turn:host:80,turns:host:443?transport=tcp"),
// VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL. The deploy workflow fills them from repo secrets.
const TURN_URLS = (import.meta.env.VITE_TURN_URLS ?? "").split(",").map((u: string) => u.trim()).filter(Boolean);
const TURN = TURN_URLS.length
  ? [{ urls: TURN_URLS, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
  : undefined;

class TrysteroNet implements Net {
  readonly selfId = trysteroId;
  readonly kind = "p2p" as const;
  readonly media = true;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  private room: Room;
  private actions = new Map<MessageType, MessageAction<any>>();
  private handlers = new Map<MessageType, Handler[]>();
  private present = new Set<string>();
  private closed = false;
  private toldOld = false;
  private toldBehind = false;
  // Everyone already in a room sends you their mic the moment you connect, which is before your game
  // (and its voice chat) has started. So keep each player's stream, and hand them all over once
  // something is listening.
  private streams = new Map<string, MediaStream>();
  private streamFn: (stream: MediaStream, from: string) => void = () => {};
  get onStream() { return this.streamFn; }
  set onStream(fn: (stream: MediaStream, from: string) => void) {
    this.streamFn = fn;
    for (const [id, stream] of this.streams) fn(stream, id);
  }

  // Joining, you meet the room (and swap versions) while still on the "Looking for…" screen,
  // before the game is there to show anything. So keep any warning until something is.
  private errors: string[] = [];
  private errorFn: ((msg: string) => void) | null = null;
  get onError() { return (msg: string) => { if (this.errorFn) this.errorFn(msg); else this.errors.push(msg); }; }
  set onError(fn: (msg: string) => void) {
    this.errorFn = fn;
    for (const msg of this.errors.splice(0)) fn(msg);
  }

  constructor(code: string) {
    this.room = joinRoom({ appId: APP_ID, turnConfig: TURN }, code, {
      // Trystero tries several times and reports every failed try, even when a later one gets
      // through. So only say so if that player still isn't here after a few more seconds.
      onJoinError: (d) => {
        if (d.peerId && this.present.has(d.peerId)) return;
        setTimeout(() => {
          if (this.closed || (d.peerId && this.present.has(d.peerId))) return;
          this.onError("Couldn't connect to a player. Their network may block direct connections.");
        }, 10000);
      },
    });
    for (const t of MESSAGE_TYPES) {
      const a = this.room.makeAction<any>(t);
      a.onMessage = (data, ctx) => this.handlers.get(t)?.forEach((fn) => fn(data, ctx.peerId));
      this.actions.set(t, a);
    }
    // Swap build times with everyone who arrives. Pages from before this check don't know "ver" and
    // never answer, so silence counts as an old page too.
    const versions = new Map<string, number>();
    this.actions.get("ver")!.onMessage = (d, ctx) => {
      if (typeof d !== "number") return;
      versions.set(ctx.peerId, d);
      if (d > BUILD + 60000) this.outdated("Someone here has a newer version of the game.");
      else if (d < BUILD - 60000) this.behind();
    };
    this.room.onPeerJoin = (id) => {
      this.present.add(id);
      this.send("ver", BUILD, id);
      setTimeout(() => { if (!this.closed && this.present.has(id) && !versions.has(id)) this.behind(); }, 10000);
      this.onJoin(id);
    };
    this.room.onPeerLeave = (id) => { this.present.delete(id); this.streams.delete(id); this.onLeave(id); };
    this.room.onPeerStream = (stream, id) => {
      this.streams.set(id, stream);
      // play voice as it arrives instead of holding it back to smooth out the network (browsers without this setting ignore it)
      try {
        for (const r of this.room.getPeers()[id]?.getReceivers() ?? []) if (r.track.kind === "audio") (r as { jitterBufferTarget?: number | null }).jitterBufferTarget = 0;
      } catch { /* not supported */ }
      this.streamFn(stream, id);
    };
  }
  peers() { return [...this.present]; }
  send(type: MessageType, data: unknown, to?: string) {
    if (!this.present.size) return;
    this.actions.get(type)!.send(data as any, to ? { target: to } : undefined).catch(() => {});
  }
  on(type: MessageType, fn: Handler) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)!).push(fn); }
  addStream(stream: MediaStream, to?: string) {
    for (const p of this.room.addStream(stream, to ? { target: to } : undefined)) p.catch(() => {});
  }
  leave() { this.closed = true; this.room.leave(); versionNotice(null); }
  relays() {
    const all = Object.values(getRelaySockets() ?? {}) as WebSocket[];
    return { up: all.filter((w) => w.readyState === WebSocket.OPEN).length, all: all.length };
  }
  async linkStats() {
    const pcs = this.room.getPeers();
    return Promise.all(this.peers().map(async (id): Promise<LinkStats> => {
      const pc = pcs[id];
      const s: LinkStats = { id, state: pc?.connectionState ?? "gone", route: "?", via: "", rtt: null, ping: null, jitter: null, lost: null, got: null, bytesIn: 0, bytesOut: 0 };
      const ping = Promise.race([
        this.room.ping(id).then((t) => { s.ping = t; }).catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      if (pc) {
        try {
          const rep = await pc.getStats();
          const all = new Map<string, any>();
          rep.forEach((r: any) => all.set(r.id, r));
          // the pair of addresses the link is actually using
          let pair: any;
          for (const r of all.values()) if (r.type === "transport" && r.selectedCandidatePairId) pair = all.get(r.selectedCandidatePairId);
          for (const r of all.values()) if (!pair && r.type === "candidate-pair" && (r.selected || (r.nominated && r.state === "succeeded"))) pair = r;
          if (pair) {
            const lo = all.get(pair.localCandidateId), re = all.get(pair.remoteCandidateId);
            s.route = lo?.candidateType === "relay" || re?.candidateType === "relay" ? "relay" : "direct";
            s.via = `${lo?.relayProtocol ?? lo?.protocol ?? "?"}, ${lo?.candidateType ?? "?"}/${re?.candidateType ?? "?"}`;
            if (typeof pair.currentRoundTripTime === "number") s.rtt = pair.currentRoundTripTime * 1000;
            s.bytesIn = pair.bytesReceived ?? 0; s.bytesOut = pair.bytesSent ?? 0;
          }
          for (const r of all.values()) {
            if (r.type !== "inbound-rtp" || r.kind !== "audio") continue;
            s.lost = (s.lost ?? 0) + (r.packetsLost ?? 0);
            s.got = (s.got ?? 0) + (r.packetsReceived ?? 0);
            if (typeof r.jitter === "number") s.jitter = r.jitter * 1000;
          }
        } catch { /* no numbers this time */ }
      }
      await ping;
      return s;
    }));
  }
  private outdated(msg: string) {
    if (this.toldOld || this.closed) return;
    this.toldOld = true;
    versionNotice(msg, true);
  }
  private behind() {
    if (this.toldBehind || this.toldOld || this.closed) return;
    this.toldBehind = true;
    versionNotice("Someone here is on an older version, so voice chat may not work for them. Ask them to refresh.");
  }
}

// Version warnings get a quiet badge of their own at the top of the screen rather than a toast, so
// "Mic on" and the like can't wipe them. It stays until it's tapped: on a newer version that
// refreshes the page, otherwise it just goes away. null takes it down.
function versionNotice(text: string | null, refresh = false) {
  document.getElementById("vnotice")?.remove();
  if (!text) return;
  const el = document.createElement("div");
  el.id = "vnotice";
  el.textContent = `${text} ${refresh ? "(tap to refresh)" : "(tap to hide)"}`;
  el.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000;max-width:min(90vw,520px);"
    + "padding:5px 10px;font:12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.6);border-radius:6px;cursor:pointer;text-align:center";
  el.onclick = () => (refresh ? location.reload() : el.remove());
  document.body.append(el);
}

class LocalNet implements Net {
  readonly selfId = Math.random().toString(36).slice(2, 12);
  readonly kind = "local" as const;
  readonly media = false;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onError: (msg: string) => void = () => {};
  onStream: (stream: MediaStream, from: string) => void = () => {};
  private ch: BroadcastChannel;
  private handlers = new Map<string, Handler[]>();
  private seen = new Map<string, number>();
  private timer: number;
  private closed = false;

  constructor(code: string) {
    this.ch = new BroadcastChannel(`${APP_ID}:${code}`);
    this.ch.onmessage = (e) => {
      const { t, d, from, to } = e.data;
      if (from === this.selfId || (to && to !== this.selfId)) return;
      if (t === "_bye") { if (this.seen.delete(from)) this.onLeave(from); return; }
      const isNew = !this.seen.has(from);
      this.seen.set(from, performance.now());
      if (isNew) { this.post("_ping", null, from); this.onJoin(from); }
      if (t[0] !== "_") this.handlers.get(t)?.forEach((fn) => fn(d, from));
    };
    this.post("_ping", null);
    this.timer = window.setInterval(() => {
      this.post("_ping", null);
      const now = performance.now();
      for (const [id, at] of this.seen) if (now - at > 4000) { this.seen.delete(id); this.onLeave(id); }
    }, 1000);
    addEventListener("pagehide", () => this.post("_bye", null));
  }
  private post(t: string, d: unknown, to?: string) { if (!this.closed) this.ch.postMessage({ t, d, from: this.selfId, to }); }
  peers() { return [...this.seen.keys()]; }
  send(type: MessageType, data: unknown, to?: string) { this.post(type, data, to); }
  addStream() {}
  on(type: MessageType, fn: Handler) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)!).push(fn); }
  leave() { this.post("_bye", null); this.closed = true; clearInterval(this.timer); this.ch.close(); }
  relays() { return null; }
  async linkStats() {
    return this.peers().map((id): LinkStats => ({ id, state: "connected", route: "tab", via: "", rtt: null, ping: null, jitter: null, lost: null, got: null, bytesIn: 0, bytesOut: 0 }));
  }
}

export function connect(code: string, local: boolean): Net {
  return local ? new LocalNet(code) : new TrysteroNet(code);
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode(): string {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  return [...a].map((v) => CODE_CHARS[v % CODE_CHARS.length]).join("");
}
/** Room codes and names: letters and digits only, any case, so they're easy to read out to a friend. */
export function cleanCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
