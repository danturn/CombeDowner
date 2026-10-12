// Networking: a tiny message bus with two transports.
//
// - Trystero (WebRTC, peer to peer). Browsers find each other through public Nostr relays, then
//   talk directly. There is no game server and nothing to pay for.
//   The same links carry voice chat (see voice.ts).
// - BroadcastChannel, which links tabs in the same browser. Used for solo practice and for
//   testing multiplayer on one machine (add ?net=local to the URL). It can't carry audio.
import { joinRoom, selfId as trysteroId } from "trystero";
import type { Room, MessageAction } from "trystero";

export const MESSAGE_TYPES = ["hello", "st", "shot", "hit", "ev", "sb", "rs", "ch", "chit", "kt", "khit", "pick", "pk", "kick", "conv", "vin", "vout", "vs", "vh", "tf", "bd", "bhit",
  "mw", "mob", "mhit", "muse", "mev", "mhurt", "mfx", "call", "ver"] as const;   // the m- ones are for the mines (mines/game.ts)
export type MessageType = (typeof MESSAGE_TYPES)[number];
type Handler = (data: any, from: string) => void;

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
}

const APP_ID = "combedowner-fps-v1";

// When this page was built. Players on different versions can still share a room, but the game
// changes several times a day and an old page misses fixes (voice chat among them), so whoever
// meets someone on a newer version is told to refresh, and they're told someone is behind. Each
// build also writes version.json, which online games check every couple of minutes.
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
  private checkT = 0;
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
      if (d > BUILD + 60000) this.outdated("Someone here has a newer version of the game. Refresh the page to update, then rejoin.");
      else if (d < BUILD - 60000) this.behind();
    };
    this.room.onPeerJoin = (id) => {
      this.present.add(id);
      this.send("ver", BUILD, id);
      setTimeout(() => { if (!this.closed && this.present.has(id) && !versions.has(id)) this.behind(); }, 10000);
      this.onJoin(id);
    };
    // and while you play, notice when a newer version goes live
    this.checkT = window.setInterval(() => {
      fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((v) => {
        if (typeof v?.build === "number" && v.build > BUILD + 60000) this.outdated("A newer version of the game is out. Refresh the page when you're ready.");
      }).catch(() => {});
    }, 120000);
    this.room.onPeerLeave = (id) => { this.present.delete(id); this.streams.delete(id); this.onLeave(id); };
    this.room.onPeerStream = (stream, id) => { this.streams.set(id, stream); this.streamFn(stream, id); };
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
  leave() { this.closed = true; clearInterval(this.checkT); this.room.leave(); }
  private outdated(msg: string) {
    if (this.toldOld || this.closed) return;
    this.toldOld = true;
    this.onError(msg);
  }
  private behind() {
    if (this.toldBehind || this.toldOld || this.closed) return;
    this.toldBehind = true;
    this.onError("Someone here is on an older version of the game, so things may go wrong for them (voice chat too). Ask them to refresh the page.");
  }
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
