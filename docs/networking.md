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

## Run locally

From the repository root, after installing the locked dependencies:

```sh
npm run dev
```

The existing Vite origin serves both the application and:

- `POST /rooms` with JSON `{"version":2}` → `201 {version:2, code}`.
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
  version-two room, complete-player-input, snapshot, checkpoint, event, and
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
| `returnToLobby()` / `rematch()` | Same room and seats, cleared readiness, no fabricated finishes |
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
  hidden document. Gate authoritative simulation and state publication on it.
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

Latest local verification: **29 Vitest tests and 6 Playwright tests passed**,
using Chromium **153.0.8010.12**. Full workspace typechecking, the production
application build, and the Worker dry-run also succeeded. These are local
transport/build results, not remote-network or physical-controller evidence.

```sh
npm run typecheck --workspace @kartsick/signaling
npm test -- packages/protocol/src/protocol.test.ts \
  packages/protocol/src/rooms.test.ts packages/protocol/src/local-signaling.test.ts
mkdir -p .network-browser-runtime
TMPDIR="$PWD/.network-browser-runtime" npm run test:browser -- tests/browser/network.spec.ts
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
in local test artifacts. Both browser processes and their profiles are closed
in `finally`; no user browser is launched or reused. Keep those private artifact
paths out of published evidence.

Still unverified: real remote NAT/firewall compatibility; a real Cloudflare
account/domain deployment and cloud hibernation; physical controller flows;
cross-device/network races and timing under representative latency/jitter/loss;
sixteen independent devices; forced TURN and measured relay egress. Application
simulation/prediction/result rendering must be integrated and separately
validated. The isolated transport harness is not evidence that the whole
online game or the approved release is complete.
