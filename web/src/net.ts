// Networking: a tiny message bus with two transports.
//
// - Trystero (WebRTC, peer to peer). Browsers find each other through public Nostr relays, then
//   talk directly. There is no game server and nothing to pay for.
// - BroadcastChannel, which links tabs in the same browser. Used for solo practice and for
//   testing multiplayer on one machine (add ?net=local to the URL).
import { joinRoom, selfId as trysteroId } from "trystero";
import type { Room, MessageAction } from "trystero";

export const MESSAGE_TYPES = ["hello", "st", "shot", "hit", "ev", "sb", "rs", "ch", "chit"] as const;
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
  leave(): void;
}

const APP_ID = "combedowner-fps-v1";

class TrysteroNet implements Net {
  readonly selfId = trysteroId;
  readonly kind = "p2p" as const;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onError: (msg: string) => void = () => {};
  private room: Room;
  private actions = new Map<MessageType, MessageAction<any>>();
  private handlers = new Map<MessageType, Handler[]>();
  private present = new Set<string>();

  constructor(code: string) {
    this.room = joinRoom({ appId: APP_ID }, code, {
      onJoinError: (d) => this.onError(`Couldn't connect to a player (${d.error}). Their network may block direct connections.`),
    });
    for (const t of MESSAGE_TYPES) {
      const a = this.room.makeAction<any>(t);
      a.onMessage = (data, ctx) => this.handlers.get(t)?.forEach((fn) => fn(data, ctx.peerId));
      this.actions.set(t, a);
    }
    this.room.onPeerJoin = (id) => { this.present.add(id); this.onJoin(id); };
    this.room.onPeerLeave = (id) => { this.present.delete(id); this.onLeave(id); };
  }
  peers() { return [...this.present]; }
  send(type: MessageType, data: unknown, to?: string) {
    if (!this.present.size) return;
    this.actions.get(type)!.send(data as any, to ? { target: to } : undefined).catch(() => {});
  }
  on(type: MessageType, fn: Handler) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)!).push(fn); }
  leave() { this.room.leave(); }
}

class LocalNet implements Net {
  readonly selfId = Math.random().toString(36).slice(2, 12);
  readonly kind = "local" as const;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onError: (msg: string) => void = () => {};
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
export function cleanCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
