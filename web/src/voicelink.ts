// How voice is carried between players, set up for the shortest delay from one player's mouth to
// another's ear (players can be an ocean apart, where every millisecond we add on top of the
// distance is heard as people talking over each other). Used by net.ts for every WebRTC link, and
// by audio.ts for the sound engine. Nothing here is decided over the network: each end tunes its
// own half, and a page without these tweaks still talks to one with them.
//
// Each player's voice goes out in 10 ms packets rather than the usual 20, so it leaves sooner.
// The receiving end asks for this in its description of the link, so we ask for it in theirs as it
// arrives (that's the half the browser lets us change). Error correction stays on, so a lost packet
// is mostly made good from the next, and the encoder never goes quiet between words ("DTX"), which
// can clip the start of a shout.
//
// Incoming voice is already asked to play as soon as it arrives (net.ts, gotVoice); the browser
// still holds it a little longer by itself when the network is uneven, which is what keeps it from
// breaking up, so that is left to it.

const PTIME = 10;

/** The remote end's description of a link, with its Opus voice asked for in short packets. */
export function tuneOpus(sdp: string): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  return sdp.split(`${eol}m=`).map((part, i) => {
    if (i === 0 || !part.startsWith("audio ")) return part;
    const pt = part.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1];
    if (!pt) return part;
    const lines = part.split(eol).filter((l) => !/^a=ptime:/.test(l));
    const fmtp = lines.findIndex((l) => l.startsWith(`a=fmtp:${pt} `));
    const params = new Map<string, string>();
    if (fmtp >= 0) for (const kv of lines[fmtp].slice(`a=fmtp:${pt} `.length).split(";")) {
      const [k, v] = kv.trim().split("=");
      if (k) params.set(k, v ?? "");
    }
    params.set("useinbandfec", "1");
    params.set("usedtx", "0");
    params.set("stereo", "0");
    params.set("minptime", String(PTIME));
    const line = `a=fmtp:${pt} ${[...params].map(([k, v]) => `${k}=${v}`).join(";")}`;
    if (fmtp >= 0) lines[fmtp] = line;
    else lines.splice(lines.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `)) + 1, 0, line);
    const end = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    lines.splice(end, 0, `a=ptime:${PTIME}`);
    return lines.join(eol);
  }).join(`${eol}m=`);
}

/** A peer connection that tunes the voice in each description it's given (handed to Trystero). */
export class VoiceLink extends RTCPeerConnection {
  override setRemoteDescription(d: RTCSessionDescriptionInit) {
    if (d?.sdp && (d.type === "offer" || d.type === "answer")) {
      try { d = { type: d.type, sdp: tuneOpus(d.sdp) }; } catch { /* untouched */ }
    }
    return super.setRemoteDescription(d);
  }
}

/** What the debug panel shows about a link's incoming voice. */
export interface VoiceIn {
  held: number | null;     // ms their voice is held before it's played, lately
  packet: number | null;   // ms of voice in each packet they send
}

const lastJb = new WeakMap<RTCPeerConnection, Map<string, { delay: number; count: number }>>();

/** Read a link's voice numbers from its stats (rep), keeping what's needed to measure "lately". */
export function voiceIn(pc: RTCPeerConnection, rep: Map<string, any>): VoiceIn {
  const v: VoiceIn = { held: null, packet: null };
  for (const r of rep.values()) {
    if (r.type !== "inbound-rtp" || r.kind !== "audio" || typeof r.jitterBufferDelay !== "number") continue;
    const seen = lastJb.get(pc) ?? lastJb.set(pc, new Map()).get(pc)!;
    const was = seen.get(r.id), n = r.jitterBufferEmittedCount ?? 0;
    if (was && n === was.count) continue;   // a voice that has stopped, beside the one now playing
    if (was && n > was.count) v.held = (1000 * (r.jitterBufferDelay - was.delay)) / (n - was.count);
    else if (n > 0) v.held = (1000 * r.jitterBufferDelay) / n;
    seen.set(r.id, { delay: r.jitterBufferDelay, count: n });
    if (r.packetsReceived > 0 && r.totalSamplesReceived > 0) v.packet = (1000 * r.totalSamplesReceived / 48000) / r.packetsReceived;
  }
  return v;
}

/**
 * The sound engine's latency hint: as little delay as the machine allows, except on a phone or
 * small tablet with little memory or few cores, where a busy moment would starve the sound into
 * crackles, which is worse than a few milliseconds' delay.
 */
export function latencyHint(): AudioContextLatencyCategory {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory, cores = navigator.hardwareConcurrency;
  return (mem !== undefined && mem < 4) || (cores !== undefined && cores < 4) ? "balanced" : "interactive";
}
