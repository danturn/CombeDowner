// How the network treats a multiplayer room, for the telemetry: whether this player could reach the
// relays that find other players, whether anyone was found, how many link-ups failed, whether links
// went direct or through the TURN relay, and what the network lets through for a link at all (plain
// UDP, the TURN relay over UDP, or only over TCP or TLS). Sent at 20 seconds and at 2 minutes into a
// room, under the room's scrambled code, so two players who couldn't see each other in "the same"
// room show up side by side on the dashboard. Only when telemetry is on.
//
// Nothing goes over the peer network: the route test links to nobody, it only asks what routes exist.
import { TURN, type Net } from "./net";
import * as Telemetry from "./telemetry";

const STUN = "stun:stun.l.google.com:19302";
const LOOK_MS = 6000;

/** The kinds of route this network offers a link: host, srflx (plain UDP out), relay-udp, relay-tcp, relay-tls. */
async function routes(): Promise<string[]> {
  // and why a server wouldn't give one (a TURN relay refusing to hand out an address, say)
  const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN }, ...(TURN ?? [])] });
  const seen = new Set<string>();
  pc.onicecandidateerror = (e) => {
    const err = e as RTCPeerConnectionIceErrorEvent;
    seen.add(`error-${err.errorCode}@${(err.url ?? "").replace(/^(turns?|stun):/, "$1-").split(":")[0]}`);
  };
  pc.onicecandidate = (e) => {
    const c = e.candidate as (RTCIceCandidate & { relayProtocol?: string }) | null;
    if (c?.type) seen.add(c.type === "relay" ? `relay-${c.relayProtocol ?? c.protocol ?? "?"}` : c.type);
  };
  try {
    pc.createDataChannel("probe");
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((done) => {
      const t = setTimeout(done, LOOK_MS);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); done(); } };
    });
  } finally { pc.close(); }
  return [...seen].sort();
}

export function watchNet(net: Net, code: string) {
  if (code === "SOLO" || net.kind !== "p2p" || !Telemetry.enabled()) return;
  const found = routes().catch(() => ["failed"]);
  const report = async (at: number) => {
    try {
      const r = net.relays(), links = await net.linkStats().catch(() => []);
      Telemetry.netReport(code, {
        at, relaysUp: r?.up ?? null, relays: r?.all ?? null, players: net.peers().length, joinFails: net.joinFails,
        direct: links.filter((l) => l.route === "direct").length, viaTurn: links.filter((l) => l.route === "relay").length,
        routes: (await found).join(" "),
      });
    } catch { /* never reaches the game */ }
  };
  setTimeout(() => void report(20), 20000);
  setTimeout(() => void report(120), 120000);
}
