# Kartsick networking: implemented runtime and operation

This describes the current implementation, not a proposal. Room signaling and
browser-to-authority WebRTC run locally without cloud provisioning. A Worker
adapter uses the same room state machine with SQLite-backed Durable Objects and
hibernatable WebSockets. The Worker has been bundled and exercised in local
workerd; it has **not** been deployed or verified against a Cloudflare account.

**Relay remains disabled.** There is no TURN binding, credential endpoint,
provider secret, relay fallback, or billable service activation in this code.
Direct connectivity is not equivalent to a complete multiplayer release:
cross-device/cross-network and forced-relay acceptance remain unverified.

The main application is now wired to this transport. `online-race.ts` maps fixed
room seats to the real race engine, publishes snapshots at twenty per simulation
second, acknowledges applied inputs, bounds prediction to twelve ticks, interpolates
remote poses and restores verified checkpoints. `use-online-room.ts` and the lobby
connect invitation, seating, shared builds, readiness and lifecycle operations.
`tests/browser/online-game.spec.ts` exercises actual rendered gameplay and host
handoff in two Chromium processes, separately from the transport-only probes.

The application uses `KartsickNetwork<RaceState, RaceEvent[]>` with strict
`decodeRaceEventBatch` validation and at most one bounded, same-tick reliable event
batch per simulation step. Finished-state snapshots are retried until
`getSnapshotAcks()` confirms receipt, and the final checkpoint is published without
advancing physics. Equal-tick snapshots with newer transport sequences remain
valid for those retries. Compression leaves event batches, receipt acknowledgments
and final-state/checkpoint contents unchanged.

Protocol 5 carries simulation-state version 2. Held items include an authoritative
roulette countdown; recovery includes the original pose and safe carry ceiling.
Receiving or restoring a snapshot does not reroll inventory or restart recovery.
The new `item-ready` event is a presentation cue, not permission to choose a
different outcome. Protocol 5 also separates the revised road geometry and
terrain bounds from earlier clients: matching message fields do not make
different physical courses compatible. Persisted protocol-2/3/4 rooms retain
seats but return to an unready lobby instead of restoring incompatible old
simulation checkpoints. Physical course revisions must update the network
version as well as course record versions when old checkpoints are not compatible.

After checkpoint restoration, browsers use the room's shared server-scheduled
resume time rather than each browser's local restoration time. In-game traffic
diagnostics accumulate sampled data-channel counters across all peers and
reconnections; the host's displayed RTT is the highest current peer RTT.
These counters exclude transport overhead and bytes between the last sample and
a closed connection. They are not exact network egress or relay billing figures.

## Run locally

From the repository root, after installing the locked dependencies:

```sh
npm run dev
```

The existing Vite origin serves both the application and:

- `POST /rooms` with JSON `{"version":5}` → `201 {version:5, code}`.
- `GET /rooms/ABCDEFGH` upgraded to a WebSocket.
- Invitations use `/?room=ABCDEFGH`; the eight-character code can also be entered
  directly. There is no account, password, matchmaking, or profile service.

`apps/web/vite.config.ts` installs the local signaling plugin. Its default
allowlist is exactly the configured port on `http://127.0.0.1` and
`http://localhost`. Do not expose that development server as a public service.
The plugin also serves a blank `/__network-test` document **only in Vite dev**;
Playwright imports the real network module into this document without loading
unfinished game UI. Neither that route nor the browser probes is a production
asset or Worker route.

`vite preview` serves static files only; it does **not** implement rooms.
Restarting Vite loses local rooms. The Worker adapter provides short-lived
persistence across object hibernation; neither adapter stores race state.

## Packages and actual endpoints

- `packages/protocol`: legacy version-one single-driver parser plus separate
  version-five room, complete-player-input, snapshot, checkpoint, event, and
  bounded-fragment schemas. The legacy parser/tests remain compatible.
- `apps/signaling/src/room.ts`: adapter-independent room state machine.
- `apps/signaling/src/local.ts`: real Node HTTP/`ws` adapter and Vite integration.
- `apps/signaling/src/worker.ts`: Worker ingress, persisted admission limiter,
  and hibernatable room Durable Object.
- `apps/web/src/network`: `RoomConnection`, `KartsickNetwork<T, E>`, and
  `InputQueue`. No dependency on React, renderer, or a running simulation.

Signaling carries room commands/state, SDP, trickle ICE, clock responses, and
checkpoint **references**. It never carries movement, inputs, race snapshots,
checkpoint state, or race event bodies. The authority is a browser, not the
signaling process.

## Room rules implemented on the server

- Up to **16 humans total**, including spectators and disconnected reservations;
  **4 local humans per authenticated browser page**, and **8 kart slots**.
  A browser process may have several pages; there is no device fingerprinting.
- Each browser and each of its local humans gets a server-generated identifier.
  Commands do not get to supply their sender identity. Seat changes and input
  ownership are checked against the authenticated membership.
- Every kart has two distinct character slots and a validated `KartBuild`.
  Characters can repeat on different karts. Seat `side: 0 | 1` identifies a
  fixed character slot, **not a permanent driver/rear-rider role**; simulation
  owns role swapping. One or two humans may occupy a kart.
- Player names, seats, build changes, readiness, room configuration, launch,
  return-to-lobby and rematch are real acknowledged operations. The host owns
  room configuration/launch/return; a kart's occupants own its build (the host
  configures vacant karts).
- Changing seating/builds/configuration clears readiness. Starting requires at
  least one seated human and all seated humans connected and ready. Unseated
  humans are spectators, not readiness blockers.
- Late arrivals and arrivals after an expired reservation spectate until the
  next lobby. They cannot take seats or add local humans during a race.
- Disconnect retains the same player IDs and seats for exactly 60 seconds.
  Resuming authenticates with a random 256-bit credential, rotated on every
  successful resume. Only its SHA-256 hash is persisted server-side. The browser
  stores the credential in session storage, never the invitation URL.
- The lobby host is elected separately from race authority. A disconnected
  host is replaced by a connected member without transferring that member's
  player identities or seats.
- Rooms expire after four hours, or ten minutes after becoming disconnected and
  inactive. Readiness, reservations, migration deadlines and expiration are
  persisted by the Worker. There is no continuous race tick in a Durable Object.

`Participant.connected`, the room's seats, and reservation deadlines give the
simulation integration the information needed for temporary AI/solo takeover.
The networking module does not simulate that takeover or generate finishes.

### Terminal results and online circuits

The room's `round` freezes the started course, round identity and kart roster.
After actual simulation completion, the authority sends
`finish {epoch, roundId, courseId, checkpointId, tick, results}` only when the
terminal checkpoint is committed. Signaling validates the authority, epoch,
round, course, checkpoint, exact roster and strict result rows before entering
`results`. This is an attestation by the trusted authority, not anti-cheat
consensus or an independent server simulation.

`lastRound` retains the accepted results and checkpoint ID/tick/digest; `series`
retains the exact Town, Horizon or tour schedule and cumulative points. Terminal
snapshots must match the committed state's digest. Neither results retries nor
departures advance physics, rewrite the finished roster or refresh its tick.
Only an accepted finished checkpoint escapes the five-second active-checkpoint
freshness limit. A migration using it returns to `results`, not a new race.

A late results-only arrival displays the metadata without constructing a fake
finished simulation or awarding a played race. The authority can send that
arrival the retained checkpoint, making it a real restoration candidate. If no
holder survives, the accepted scoreboard remains with an explicit restoration
limitation rather than fabricated state.

The host's `next-course {epoch, roundId}` enters a readiness lobby with preserved
kart slots, builds, seats and points. Circuit configuration stays fixed until
the host explicitly ends it or sets up a rematch. New participants may take a
slot for the next course; standings belong to that slot. All courses must be
available, and a completed circuit has no next course. Metadata is bounded
below the signaling envelope limit. The server persists these results and
references, never the complete race state.

## Browser API and simulation integration

```ts
import { KartsickNetwork } from "./network";
import { parseRaceState, type RaceState } from "@kartsick/simulation";

const network = await KartsickNetwork.create<RaceState>({
  names: ["Racer", "Couch friend"], // 1–4 names; default is an automatic name
  decodeState: parseRaceState,
  restoreCheckpoint(checkpoint) {
    // Restore the whole simulation, including RNG/items/effect IDs, race progress,
    // and checkpoint.reference.acks. Do not fabricate missing race results.
    race = checkpoint.state;
    appliedInputs = new Map(checkpoint.reference.acks.map(a => [a.playerId, a.sequence]));
  },
});
// Joining instead:
// await KartsickNetwork.join<RaceState>(codeOrInviteUrl, theSameOptions);
```

`race` and `appliedInputs` above are owned by the application. The network module
does not mutate them. **A decoder is mandatory.** It must validate the complete
state and either return its typed result, return `null`, or throw. Null/undefined
results are rejected. The current simulation's `parseRaceState` can be supplied
directly. A checksum is not a replacement for schema validation.

### Lobby and invitation operations

The `network.connection` object exposes:

| API | Meaning |
|---|---|
| `code`, `inviteUrl`, `room`, `participantId` | Current invitation and authenticated room view |
| `updatePlayers(names)` | Update 1–4 local humans in the lobby; existing indexes retain IDs |
| `seat(playerId, {kart, side})` / `seat(playerId, null)` | Claim/release one of your own character slots |
| `ready(playerId, boolean)` | Ready/unready a seated local human |
| `setBuild(kart, build)` | Set validated characters/parts/cosmetics |
| `configure(config)` | Full validated lobby config, host only |
| `start()` | Server-selected seed, new epoch, start scheduled three seconds ahead |
| `finishRound(command)` | Authority attestation of the current round against its committed terminal checkpoint |
| `nextCourse(epoch, roundId)` | Host advances the exact circuit into a readiness lobby, preserving points |
| `returnToLobby()` / `rematch()` | Same room and seats, cleared readiness and explicit circuit/results reset |
| `syncClock()`, `serverNow()`, `clock` | Request/response midpoint wall-clock estimate and measured signaling RTT |
| `setCapability({visible, capable})` | Explicit availability update |
| `reconnect()` | Reopen signaling with the rotating credential |
| `resumePersistenceError` | Storage warning, also replayed to new network subscribers; in-page reconnect remains available |
| `leave()` | Release membership/credential; unlike an accidental disconnect |

All mutation methods return promises rejected with a `NetworkError` containing
an actionable `code` and bounded message. Joining samples the server clock.
Use `room.startAt - connection.serverNow()` for the launch display; refresh the
clock before readiness/start when appropriate. This is a measured midpoint
estimate, not a promise of submillisecond synchronization. Race ticks and
authoritative snapshots, not browser wall clocks, decide race progress.

### Race transport operations

- `network.subscribe(listener)` returns an unsubscribe function and immediately
  reports current room/epoch. Events include `room`, `epoch`, `signaling`,
  `peer`, `quality`, `inputs`, `snapshot`, `event`, `checkpoint`, `resync`, and
  `error`.
- `sendInputs([{playerId, tick, input}, ...])` accepts up to four owned local
  players. `input` contains the existing driver fields plus `useItem`,
  `throwDirection: -1 | 1`, `slide: -1 | 0 | 1`, and `passItem`.
  The transport assigns input sequence numbers. Authority-local inputs enter
  the same receive queue without a loopback socket.
- `drainInputs()` gives the authority validated, deduplicated frames. Consume
  them in the fixed simulation loop; do not turn one frame into an extra physics
  tick. Missing-input timeout and neutral/AI takeover remain simulation duties.
- `pendingInputs(playerId?)` returns a copied prediction history. Each player
  keeps at most 120 frames; packets repeat the newest four unacknowledged frames
  per local human. The authority's pending input queue is likewise bounded.
- `broadcastSnapshot(state, tick, appliedAcks)` is authority-only and returns
  `{sequence, sent, dropped}`. Supply **applied**, not merely received, input
  acknowledgments. Publish at a measured 20–30 Hz budget, not on every render.
- `snapshot` events carry the validated state, epoch, snapshot sequence, tick,
  and applied-input acknowledgments. Reconcile local prediction from these.
  The transport clears acknowledged prediction history. A spectator also
  acknowledges receipt of snapshots without claiming input ownership.
- `getSnapshotAcks()` returns a copy of the latest snapshot sequence acknowledged
  by each browser. This is receipt acknowledgment, not proof it has rendered.
- `broadcastEvent(event)` sends reliable authority events. Supply a separate
  `decodeEvent` option to enable this API; without one, application events are
  rejected. Essential durable outcomes belong in `RaceState` as well.
- `commitCheckpoint(state, tick, appliedAcks)` validates/hashes and sends the
  complete checkpoint over the reliable data channel. Call about once per
  second (server maximum: twice per second). Its promise means publication,
  **not replication commitment**; watch `room.checkpoint`/`checkpoint` events.
- `resync` tells the authority that a new/reconnected peer needs fresh state;
  respond with the current snapshot, not an invented result.
- `isAuthority` is false on signaling loss, paused/migrating/lobby phases, or a
  hidden document. It can remain true in `results` for immutable terminal-state
  delivery, but only `racing` permits simulation steps or new checkpoints.
- `retryConnections()` requests a fresh signaling/peer attempt after an explicit
  failure. Automatic negotiation attempts are bounded, not an endless loop.
- `dispose()` closes owned peers, channels, timers and signaling, retaining the
  60-second reservation. `leave()` additionally releases membership.

The React integration owns menus, local seat mapping, course loading before
readiness, simulation/prediction/reconciliation, presentation, and results.
Pause authoritative ticking immediately on signaling loss or a non-racing
epoch/phase event. Clients must stop applying old-epoch state and request a fresh
snapshot. Do not equate a lobby fallback with a completed race.

## WebRTC topology, ordering and bounds

The authority initiates one `RTCPeerConnection` per other connected browser.
Clients connect **only** to that authority, never a full mesh. The server rejects
signaling between two non-authority browsers. Attempts have random IDs, scoped
to the server authority epoch; obsolete offers/answers/ICE are ignored.

- `movement-v2`: `ordered: false`, `maxRetransmits: 0`; disposable inputs,
  snapshots and snapshot receipt acknowledgments.
- `control-v2`: ordered and reliable; application events, checkpoint state and
  resync requests.
- Trickle ICE, queued pre-description candidates, offer/answer timeout/retry,
  hot disconnects and fresh negotiation after epoch changes are implemented.
  Default offer timeout is eight seconds with at most three authority attempts.
- Default STUN is `stun:stun.cloudflare.com:3478`. Supply `stunUrls: []` for
  loopback/LAN-only testing. Configuration accepts STUN URLs only and rejects
  TURN URLs/credentials.
- Every complete message is versioned and epoch-fenced. Input, snapshot and event
  sequences reject duplicates/stale data, including unsigned sequence wrap.
- Maximum complete race packet: **256 KiB**. Maximum individual SCTP message:
  **64 KiB**. Larger packets use 32-KiB binary chunks encoded in bounded JSON
  envelopes. Reassembly applies only a complete validated packet; lost fragments
  discard a snapshot rather than partially applying it.
- Each peer retains at most two unfinished movement and two reliable assemblies;
  movement assemblies expire in two seconds, reliable assemblies in fifteen.
- Movement backpressure drops disposable packets above a 512-KiB queued budget.
  Reliable traffic has a 512-KiB/64-fragment pending budget; exhaustion surfaces
  an error and initiates same-lobby recovery rather than silently dropping events.
- No hidden movement fallback runs over the signaling WebSocket.

Periodic WebRTC stats expose measured RTT, data-channel bytes and direct/unknown
route classification, without collecting raw candidate addresses. These numbers
are not yet representative remote-network latency or relay-egress measurements.

## Negotiated lossless state compression

Snapshots and complete checkpoints now support **`zlib-v1`**, using the pinned
`pako` 2.1.0 implementation. This is independent-message compression of the
existing complete JSON bytes, **not** numeric rounding, a partial-state patch,
or a delta/dictionary chain. Losing one snapshot does not make the next snapshot
undecodable. RNG, item/effect IDs, full-precision JSON numbers, applied input
acknowledgments and checkpoint SHA-256 verification are unchanged.

No caller changes are required:

- `broadcastSnapshot` still returns `{sequence, sent, dropped}` synchronously.
- `commitCheckpoint` keeps its existing asynchronous publication/commit contract.
- Inputs, receipt acknowledgments, resync requests and generic reliable `E`
  events remain ordinary version-four JSON. Application `RaceEvent[]` batches
  are neither rewritten nor implicitly compressed.
- Compression, envelope preparation and fragmentation are cached once per
  selected codec for a broadcast, not repeated for every peer. The existing
  state-validation roundtrip is retained.
- Small payloads (under 1 KiB) and payloads that would not shrink after
  base64/envelope overhead stay plain, even with compression-capable peers.

### Optional compression, explicit agreement

The authority optionally opens one extra **reliable, ordered**
`kartsick-codec-v1` data channel. Its versioned offer names `zlib-v1` and carries
a fresh nonce plus the current authority epoch. The receiver accepts that exact
codec/nonce/epoch before the sender enables compression. Receiving is enabled
before acceptance is sent, so movement/control traffic may safely overtake the
probe's final response.

The initiator closes the probe after receiving acceptance. The receiver waits
for that close or its bounded timeout; previously accepted in-flight compressed
packets remain decodable for that peer. All permission is cleared on peer
disposal/epoch replacement. The negotiation timeout is three seconds **after the
probe opens**, not while ICE is still establishing the connection.

Peers without compression support close unknown channel labels. That closes
only this optional probe: the sender continues plain snapshots/checkpoints,
without sending unknown capability packets to the game-message parser. A
same-protocol authority that never opens a probe also remains usable.
Protocol-version-2/3 clients cannot join a version-4 room. Unsupported/malformed/
timed-out probes and optional-channel creation failures fall back quietly to
plain traffic; they do not restart otherwise working game channels.

Compression is never sent speculatively. The receiver rejects compressed
envelopes that were not accepted on this particular peer connection. The
ordinary application/event schema still needs to be understood by both peers;
codec negotiation does not silently translate different application protocols.

### Framing, decompression bounds and integrity

The self-versioned envelope has exactly five fields:
`kartsickCompression: 1`, `codec: "zlib-v1"`, `epoch`, `bytes` (exact original
UTF-8 length) and canonical-base64 `data`. Both the envelope and the original
decoded packet must fit the existing **256-KiB** message cap. Large envelopes
use the **existing** 32-KiB chunk/64-KiB SCTP-message fragment protocol; there is
no second reassembly queue or unbounded decompression stream.

The decoder deliberately uses pako's pinned **low-level** zlib interface,
not its high-level allocating/concatenating inflater:

1. Reject overlarge strings/UTF-8 and invalid declared lengths before creating
   an encoded input/output array. Decode only bounded canonical base64.
2. Allocate exactly the validated declared output length, at most 256 KiB.
3. Decode one zlib stream with `windowBits: 15`: bounded 32-KiB history and
   fixed Huffman tables. Gzip and preset dictionaries are not accepted.
4. If the output buffer fills, permit only a **one-byte** sentinel buffer to
   finish reading the end marker/checksum. Any extra output byte is an error.
5. Require `Z_STREAM_END`, exact produced length, full input consumption and
   a valid Adler-32 checksum. Trailing bytes, concatenated streams, corrupt
   checksums and truncation—including a valid JSON prefix followed by missing
   or excess compressed data—are rejected before the application decoder runs.
6. Decode UTF-8 strictly, then run the normal full packet/application-state
   decoder. Checkpoints additionally retain their existing SHA-256 validation.

Bounds tests use independent Node zlib stored/fixed/dynamic streams, truncated
streams at every byte boundary, and 8-/16-MiB amplification fixtures. An
instrumented 16-MiB expansion attempt cannot allocate an output array over
256 KiB; aggregate observed typed-array allocations remain under the output cap
plus 70,000 bytes. An oversized declared length allocates no output array at all.
These guarantees require the low-level buffer/end-counter checks: do not replace
them with `inflate()`/`unzlibSync()` followed by a post-allocation length check.

Backpressure still uses actual selected wire bytes against the existing
512-KiB movement/reliable budgets and 64 pending reliable fragments. Reliable
queued checkpoints/events cannot overtake each other when the control channel
opens before movement. No state or compressed payload moves over signaling.

### Measured traffic and cost

Measured on **Apple M4 Max, macOS/Darwin, Node v26.7.0**, September 7, 2026.
The test advances the actual engine at 60 Hz with eight varied kart builds and
sixteen independent synthetic input owners. It samples 90 evolving snapshots
at 20 Hz after warm-up, then uses real `grantItem`/`stepRace` effects for the
busy scenario (up to **64 live effects**). The checkpoint measurements use those
complete busy race states and sixteen applied-input acknowledgments.

Every sample is checked for byte-identical JSON roundtrip and accepted by the
real `parseRaceState`; checkpoint hashes are recomputed. Ten warm-up samples
per scenario are excluded from timings.

| Message | Mean plain bytes | Mean compressed bytes | Reduction | Encode p50 / p95, ms | Decode p50 / p95, ms |
|---|---:|---:|---:|---:|---:|
| Active eight-kart snapshot | 16,242 | 4,608 | 71.63% | 0.209 / 0.267 | 0.223 / 0.345 |
| Busy item snapshot | 35,653 | 11,475 | 67.82% | 0.441 / 0.507 | 0.481 / 0.617 |
| Complete busy checkpoint | 35,763 | 11,573 | 67.64% | 0.561 / 0.685 | 0.628 / 0.789 |

For comparison, the same cached pipeline without compression measured:

| Message | Plain encode p50 / p95, ms | Plain decode p50 / p95, ms |
|---|---:|---:|
| Active snapshot | 0.021 / 0.034 | 0.124 / 0.165 |
| Busy snapshot | 0.046 / 0.060 | 0.252 / 0.357 |
| Complete busy checkpoint | 0.128 / 0.167 | 0.357 / 0.447 |

Bytes are the sum of UTF-8 data-channel application messages, including
base64/envelope/fragment overhead—not UDP/DTLS/SCTP headers, retransmissions,
one-time capability probes or relay billing. Encode timing includes JSON
serialization and selected wire preparation; decode includes reassembly,
decompression, JSON parsing and full schema validation/deep-copy. Checkpoint
timings also include SHA-256 generation/verification. Existing application
simulation/rendering and the host's preceding state-validation roundtrip are
not included. Timings are **Node measurements, not browser/M1 acceptance**.

Reproduce without opening a browser:

```sh
npm test -- apps/web/src/network/compression-race.test.ts --disableConsoleIntercept
```

The compression change has **34 targeted Vitest tests** (63 with the existing
29 protocol/server tests), including mixed plain/compressed hub wiring,
corruption/bounds, fragmentation/drop independence, negotiation timeout/cleanup,
epoch fencing, synchronous return values, once-per-codec encoding and reliable
checkpoint/event ordering. Hub wiring tests explicitly use mock channels.
**No browser was launched for this change**: real two-browser gameplay and
host-migration validation is handed back to the integration owner.

### Dependency and license

`apps/web/package.json` declares runtime `pako: 2.1.0` (no transitive runtime
dependencies) and development typings `@types/pako: 2.0.4`; the lockfile pins
both. Pako is licensed **MIT AND Zlib**. Complete notices are retained in
`compression-license.ts` and in the production bundle through the read-only
`KartsickNetwork.compressionLicense` text, available for a credits view.
Production bundling was checked for both full notices; relying only on source
comments would not suffice because the current minifier removes them.

The zlib implementation is unmodified. Kartsick's bounds/framing and minimal
low-level declarations are separate helpers. Dependency upgrades must rerun the
stream-completion, amplification and allocation-bound regressions. No signaling,
cloud service, relay activation, billing configuration or budget guarantee
changes are part of compression.

## Authority loss and visibility

The server commits a checkpoint reference after the authority plus at least one
other browser acknowledge the same ID/digest (or the authority alone when it is
the only connected browser). It records which browsers have the committed copy.
The actual state, RNG, items/effect IDs and input acknowledgments remain in those
browsers. Replication is evidence of a functioning connection, not strong
competitive anti-cheat.

On authority loss/backgrounding, a connected, visible, capable holder can be
selected only when its committed checkpoint is at most five seconds old. The
server increments the epoch and enters `migrating`; the selected browser must
verify the checksum, run the application's restore callback and acknowledge
that specific checkpoint before racing resumes. The deadline is twelve seconds.
Transport sequence/acknowledgment state is initialized from the committed copy.
The former authority cannot publish against the new epoch.

If the current authority is merely hidden and no suitable holder exists, the
room explicitly pauses. A visible authority can resume it. If an authority is
lost without a fresh checkpoint, restoration fails, or migration times out,
everyone returns to **the same lobby**, with an explanation and cleared
readiness. There are no synthesized finishes or replacement results.

## Ingress protections and privacy

Signaling commands are strict schemas with unknown fields rejected. Limits:
24 KiB per signaling message; 1 KiB per creation body; at most 24 simultaneous
room sockets including unauthenticated joins; five seconds to authenticate a
socket; token bucket of 80 room messages with 20/second refill. Binary,
malformed, oversized and excessive messages close safely with meaningful errors.
Slow local websocket consumers are closed after a bounded close handshake.
Rate budgets persist across Durable Object hibernation.

Local admission allows ten immediate creations, replenishing one per six
seconds, at most 256 rooms, and bounded upgrade attempts. Worker admission
persists limits of ten creations/minute, 120/hour and 240 connection attempts/
minute globally, without IP buckets. These are abuse/admission controls, **not
monetary caps**. Free service can refuse room creation or connections at capacity.

Exact origins are checked on HTTP creation and websocket upgrades. Credentials
are not accepted in websocket query strings. SDP/candidate addresses are
forwarded only to the selected peer and are not retained in room persistence.
There are no IP histories, chat logs, advertising IDs or account data.

Direct WebRTC can reveal network addresses to invited peers. Explain this in
the room UI. A browser authority is appropriate for friends, not a claim of
tamper-proof competitive fairness.

## Worker runtime/deployment contract

`apps/signaling/wrangler.jsonc` specifies the exact bindings:

| Binding | Runtime |
|---|---|
| `ROOMS` | `RoomObject`, created using `new_sqlite_classes` |
| `ADMISSION` | `Admission`, also a SQLite-backed Durable Object |
| `ASSETS` | Vite `dist/` static assets |
| `PUBLIC_ORIGIN` | Exact application origin, currently `https://kartsick.brando.page` |

The Worker serves static assets and `/rooms` on the **same custom domain**.
This checked-in adapter uses Worker static assets rather than claiming a Pages
deployment will automatically forward websocket traffic. `workers.dev`,
preview URLs and application observability are disabled. There are no API keys
or paid bindings in the configuration. Production requires HTTPS/WSS.

Room state is a single private SQLite row. Accepted WebSockets carry only a
random connection handle in their hibernation attachment; reconstruction binds
the live sockets back to saved membership/rate state. Alarms service reservations,
migration deadlines, unauthenticated joins and room expiration, not a race tick.
Expired room rows are deleted. Provider free-tier quotas can interrupt signaling;
an unrecoverable object/account failure does not manufacture a successful race.

Non-deploying validation:

```sh
npm run build
WRANGLER_SEND_METRICS=false npm run worker:check --workspace @kartsick/signaling
```

Local Worker runtime, without cloud deployment:

```sh
npm exec --workspace @kartsick/signaling -- wrangler dev --local \
  --ip 127.0.0.1 --port 8788 \
  --local-upstream 127.0.0.1:8788 --upstream-protocol http \
  --var PUBLIC_ORIGIN:http://127.0.0.1:8788 \
  --persist-to .worker-check/state
```

Stop that owned process when finished. Use a project-local runtime directory
for test-browser scratch data; do not reuse a user's browser/debugging endpoint.
The production build must exist before the asset-backed Worker starts.
The local-upstream flags preserve local Origin/Host instead of Wrangler
rewriting them to the configured production custom domain.

**No deployment or billing enrollment has been performed.** Before any real
deployment, the operator must verify the target account is on **Workers Free**
and SQLite DO Free, the domain is controlled and not conflicting with another
site, and all bindings remain nonbillable/free-tier. Wrangler configuration
does not itself prove an account's billing plan. On an already-paid account,
do not interpret this configuration as an enforceable spending cap.

The hard goal remains $0 and the ceiling remains **$5 total/month across all
services**. Alerts, analytics delays, admission limits, short credentials and
revocation are not enforceable relay caps. Do not activate TURN until the
separate enforceable arrangement is approved. Required working relay remains
part of full release acceptance, not something these direct tests establish.

## Verification and explicit gaps

The current protocol/series/online-session/compression selection passes **132
Vitest tests**. Both real-game browser scenarios also pass with protocol 3 and
compression enabled: remote driving and live host recovery, plus four couch
controllers mixed with a remote human. Full workspace typechecking and the
production application build and non-deploying Worker dry-run pass. These are
local results, not remote-network or physical-controller
evidence. The six current transport scenarios pass as well, including sixteen
synthetic input owners, storage-blocked reconnect and failed restoration.

`tests/browser/online-circuits.spec.ts` drives a complete real Town circuit
through ordinary controller inputs. After Butterbell, it waits beyond the
active-checkpoint freshness window, interrupts and resumes guest signaling,
confirms renewed checkpoint possession, loses the host, admits a scoreboard-only
spectator, then loses the replacement host. The late checkpoint holder restores
the identical terminal state, waits for actual reservation expiry, drives
Escaluna and Tiltglass, retains 30 kart-slot points, saves a gold medal, and
explicitly resets via rematch. Its local counter records only its two played
rounds. No finish ticks, checkpoints, progress or substitute schedules are
injected. This one-kart tandem/circuit case does not establish full-occupancy
rendered circuits, online Horizon/tour completion or physical-controller acceptance.

Terminal regression coverage also freezes input acknowledgments when a
multi-step render frame finishes partway through its callbacks, commits an
authority-held pending checkpoint when the last guest leaves, and renews
checkpoint possession after signaling reconnect or epoch change. A sole guest
without the proposal cannot accidentally commit it. A stale failed
acknowledgment request cannot erase a newer connection generation's acknowledgment.

```sh
npm run typecheck --workspace @kartsick/signaling
npm test -- packages/protocol/src packages/simulation/src/series.test.ts \
  apps/web/src/network apps/web/src/online-race.test.ts
mkdir -p .network-browser-runtime
TMPDIR="$PWD/.network-browser-runtime" npm run test:browser -- \
  tests/browser/network.spec.ts --output=test-results/network-transport
```

The current targeted suite verifies:

- Server occupancy/seats/readiness/configuration, random token rotation and
  60-second resume, late spectators, host election, stale epochs, checkpoint
  commitment/handoff, visibility pause, failure fallback, expiration, malformed
  and oversized input, rate budgets including hibernation reconstruction.
- Real Node HTTP/WebSocket origin and payload enforcement.
- Complete current eight-kart `RaceState` serialization through its real decoder.
- Bounded input queues, fragment loss/reordering, malformed payload rejection.
- **Two separate owned Chromium processes**, using the existing Playwright
  browser fixture plus the same bounded BrowserServer lifecycle for the second:
  actual `RTCPeerConnection` negotiation, owned movement and item input,
  snapshots/receipt acknowledgments, reliable events, stale epoch/invalid-state/
  spoofed-seat rejection, reconnect, large fragmented snapshots/checkpoints,
  successful migration with restored input acknowledgments, and failed restore
  returning to the same lobby.
- Synthetic maximum occupancy: 16 local humans in four browser contexts, four
  per context, eight occupied tandem karts, with actual star data-channel input
  and 16-player acknowledgment exchange. This is not sixteen physical devices.
- A withheld-offer negotiation test exercises actual RTC connection attempts and
  bounded retries, then exposes direct failure and the disabled-relay diagnosis.
  It does not pretend to be a forced-relay or remote-NAT test.
- A non-deploying Worker bundle check and an actual local workerd smoke run:
  SQLite-backed room creation, two websocket memberships, foreign-origin
  rejection, disconnect/resume and credential rotation.

Browser owner records contain the exact owned PID/profile and browser version
in the dedicated `test-results/network-transport` artifacts, separate from local-game
smoke evidence. Coordinate ownership of port 4174 before starting this suite.
Both browser processes and their profiles are closed
in `finally`; no user browser is launched or reused. Keep those private artifact
paths out of published evidence.

Still unverified: real remote NAT/firewall compatibility; a real Cloudflare
account/domain deployment and cloud hibernation; physical controller flows;
cross-device/network races and timing under representative latency/jitter/loss;
sixteen independent devices; forced TURN and measured relay egress. Application
simulation/prediction/result rendering must be integrated and separately
validated. The isolated transport harness is not evidence that the whole
online game or the approved release is complete.
