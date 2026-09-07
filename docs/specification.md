# Kartsick: approved release specification

**Status: approved for implementation.** Concrete cast/world/kart/special-item
concepts require creative approval before final asset production. The first
polished driving slice requires handling and camera feedback before expansion
to all six tracks. These checkpoints do not reduce the release scope.

This is the public, sanitized specification for `thatcube/kartsick`. It preserves
the approved product requirements and implementation defaults without private
execution instructions, machine paths, or conversation metadata.

## 1. Product and originality

Build a genuinely enjoyable, original 3D browser kart racer inspired by the
handling, party chaos, and tandem play of Mario Kart: Double Dash. Do not copy
protected characters, tracks, music, art, voices, or branding. Renaming a
near-copy does not establish originality.

The visual target is colorful, beautiful GameCube-inspired 3D with expressive
animation and selective modern enhancements, not voxel/block art or a crude
retro substitute. The eight mascots should be cursed and off-model in an
approachable classic-console way: no gross-out, slime, or grotesque monsters.

Friends race entirely in a browser, with responsive online play and
controller-operated essential flows. Publish at **kartsick.brando.page**, subject
to DNS access. Public development deployment is authorized without a separate
release ceremony. The product name is Kartsick; Kartastrophe is excluded.

## 2. Complete release scope

| Area | Approved scope |
|---|---|
| Tracks | Six original courses: farmland, neon skyway, shopping mall, pinball, autumn treetops, and continuous mountain descent |
| Characters | Eight original characters, grouped into four default pairs |
| Specials | One shared signature special per default pair; mixing pairs changes the available specials |
| Parts | Eight bodies, six wheel sets, four customizable gliders, palettes and decals |
| Builds | Any character pairing can use any parts; character-themed presets; real, balanced handling tradeoffs, not upgrades |
| Races | Eight karts, up to sixteen human participants |
| Couch play | Up to four local humans per browser, in shared tandem karts or split-screen, also mixed with online play |
| Modes | Quick race, two three-course cups, all-six-course tour, solo time trials with local ghosts |
| Speed classes | Classic-style slow/normal/fast classes corresponding to 50/100/150, plus mirror mode |
| Bots | Fill vacant kart positions by default; easy room toggle and selectable difficulty |
| Progression | All gameplay content immediately unlocked; local medals, times, ghosts, settings, and custom builds |

Each kart contains two distinct characters. Characters may repeat across
different karts, allowing sixteen character slots with an eight-character cast.
One human may control and swap both characters, or two humans may share the kart.
Solo-controlled and co-op karts can mix.

One view is rendered per local kart, not per character. One local keyboard player
may mix with controllers within the four-human local limit.

### Items

Implement sixteen standard effects with original names, models, sounds,
telegraphs, and presentation:

| Group | Effects |
|---|---|
| Traps and attacks | Dropped slip trap; bouncing projectile; homing projectile; leader-seeking projectile; bomb |
| Boosts | Single boost; triple boost; rapid-reuse boost |
| Power and comeback | Temporary invincibility; pack-wide shrinking/slowdown; temporary autopilot comeback |
| Disruption and utility | Vision interference; ghost-style item theft; fireball burst; returning projectile; defensive shockwave |
| Additional variants | Triple traps; triple bouncing projectiles; triple homing projectiles |

Four pair-specific signature specials are additional to this standard set.
Define clear telegraphs, counterplay, collisions, network authority, cooldowns,
and balancing for every item. Position-weighted standard item probabilities
favor comeback opportunities. Time trials disable random items and use a fixed
boost allowance.

### Racing rules

Five loop courses use three laps. The mountain descent uses three progress
sectors and one finish. After the first finish, display a 45-second finish
countdown. Preserve recorded finishes; at timeout rank remaining racers by
authoritative checkpoint progress and clearly label disconnected/incomplete
results.

Every course needs its own name, route, assets, shortcuts, readable hazards,
checkpoints, and safe recovery points. Validate shortcuts and ordered checkpoint
progress to prevent accidental laps and obvious route exploits. Bots obey the
same movement and item rules unless a specific visible assist is approved.

### Explicit exclusions

No mobile/touch launch support, battle arenas, public matchmaking, accounts,
cross-device cloud saves, public leaderboards, voice/text chat, loot purchases,
engine-upgrade grind, anti-gravity, underwater driving, or jump-trick boosts.
No general auto-acceleration or steering assists. The temporary autopilot
comeback item is an item mechanic, not a driving accessibility setting.

## 3. Architecture

Use TypeScript, Vite, Babylon.js for 3D, and React for DOM menus/settings/HUD.
Keep React out of the simulation/render loop. WebGL2 is the baseline; optional
WebGPU can be evaluated without becoming a launch requirement.

Use typed package boundaries between simulation, protocol, content definitions,
browser application, and signaling Worker. Content is data-driven, not one
monolithic scene script. Version protocol messages and persisted saves.

### Simulation and rendering

- Fixed 60 Hz arcade simulation with bounded catch-up and render interpolation.
- Tunable acceleration, braking, steering, traction, drifting, countersteering,
  mini-turbos, boosts, collisions, recovery, and camera response.
- Actual glider deployment, airborne steering/pitch, and landing transitions.
- Shared simulation has no browser, renderer, UI, or transport dependency.
- Seeded race randomness and explicit inputs/events; do not claim floating-point
  physics is automatically deterministic across environments.
- Keep simulation worker-capable. A stalled menu/render frame must not trigger
  unbounded catch-up.
- Begin with a 20-30 Hz state-snapshot budget and measure actual traffic.

### Online model

One selected browser owns authoritative race state. Clients predict their own
driving and reconcile against acknowledged authoritative state. Each browser
connection may own multiple local players with explicit seat/input ownership.

Use WebRTC data channels: disposable unordered movement updates and reliable
control/events. Include versioning, sequence numbers, acknowledgements, bounded
queues, and late/missing/duplicate-message handling. Clients connect to the
authority, not a full mesh. Prefer measured connectivity/capability for host
selection. Preserve a path to dedicated-server authority without promising a
costless migration.

Use Cloudflare Workers and SQLite-backed Durable Objects for room lifecycle,
seats, signaling, and short-lived TURN credentials. Signaling objects must not
run a continuous race tick. Try direct WebRTC, then TURN when needed. Surface
connection failures and connection quality truthfully.

The first networked slice must prove the chosen architecture. Explain evidence
of any material incompatibility before changing a user-visible requirement.

### Project tooling

Use project-local Vitest for simulation/protocol coverage and Playwright for
browser integration and synthetic multi-client coverage. Do not install global
test tools.

Each launched test browser must have an explicit owner, recorded PID/session
handle and temporary profile path, and bounded lifetime. Close only owned
browsers/contexts and clean owned temporary profiles in `finally` or equivalent,
including failure/cancellation. Do not reuse another session's debugging
endpoint, kill browsers by name, or change automatic updates/code signing.

## 4. Driving and tandem ownership

Driving feel comes before content expansion. Build a tuning course and iterate
on acceleration, braking, turning radius, drift initiation, countersteering,
mini-turbos, collisions, camera, and feedback. Ground handling should resemble
Double Dash with modern improvements, not a substituted driving model.

Verify exact reference rules before implementing driver/rear-rider ownership,
item interactions, slide attacks, cooperative boost mechanics, and coordinated
swapping. Do not invent a passenger rhythm minigame or unrelated balance system.

During flight, the driver owns flight controls and the rear rider owns items.
Ground slide attacks do not imply midair lateral attacks.

## 5. Player experience and resilience

Deliver launch, input activation, settings, character/part selection, room
invitation, readiness, synchronized start, racing, results, and rematch.

Joining uses a link or short code. No accounts, passwords, or setup wizard.
Use saved or automatically generated editable nicknames so typing is optional.
Essential flows work with controllers. Validation, secrets, and abuse limits
must not add friction to ordinary players.

Support Xbox, PlayStation, Switch Pro, standard-compatible third-party gamepads,
and adapters exposed as normal browser gamepads. Proprietary unsupported
GameCube-adapter handling is not required. Include analog driving, controller
menus, remapping, calibration, clear prompts, hot-plug handling, and keyboard
fallback. Rumble is optional and capability-based.

Browser audio/fullscreen may need user activation. Explain limitations without
blocking basic racing or claiming unavailable haptics. Include master/music/
effects volume, readable text, reduced motion, camera-shake controls, and
non-color-only feedback.

| Event | Required behavior |
|---|---|
| Late join | Enter the room, spectate the current race, race next round |
| Room occupancy | At most sixteen humans, including spectators/waiting players; at most eight active karts |
| Individual disconnect | AI temporarily drives an empty kart, or the remaining co-op human receives solo control |
| Reconnect | Reserve the same seat for 60 seconds; restore without another code; afterward allow spectating and next-round entry |
| Controller removal | Never latch stale throttle; offer compatible reconnection or keyboard fallback; use temporary online takeover |
| Standalone window blur | Pause the local race |
| Host loss | Brief pause and automatic authority transfer; failure returns everyone to the same lobby with an explanation, not fabricated results |
| Background host | Prefer a visible capable peer; if none is suitable, explicitly pause instead of running a broken simulation |

Migration uses authority epochs, latest committed checkpoint, item/random
state, and input acknowledgements to prevent split-brain authority and duplicate
item effects.

Store versioned local profiles/builds, medals, records, ghosts, and settings.
Bound record/ghost storage and surface persistence failures rather than silently
losing progress. Cross-device synchronization is out of scope.

## 6. Art, audio, and performance direction

Creative approval covers the roster, four signature specials, kart designs, and
six track identities before final assets. Produce original models, textures,
HUD, effects, music, and character sounds with free local tools. Compatible free
supporting assets are allowed with provenance and attribution. No paid packs,
subscriptions, generation services, ripped assets, or borrowed game recordings.

Keep editable sources and reproducible exports. Use compressed textures/meshes,
instancing, LODs, appropriate collision meshes, and shared resources across
split-screen views. Load selected-track and required shared content before a
race; preload subsequent content without blocking controls. Respect static-host
per-file limits.

Audio needs a coherent menu/race direction, distinct course moods, readable
vehicle/item/UI effects, and original vocalizations or nonverbal character
reactions.

Target 60 FPS at 1080p single-view on M1-class Macs and recent integrated-graphics
Windows laptops. Establish concrete hardware/browser versions before making
performance claims. Scale resolution/effects for split-screen and quality
presets while preserving readability and response.

## 7. Infrastructure, privacy, and spending

**Goal: $0 incremental infrastructure cost; hard ceiling: $5 total per month.**
This is a total across services, not $5 each.

Cloudflare Pages can host static content. Keep Workers and SQLite Durable
Objects on free tiers unless a separate change is approved. Workers Paid has a
$5 monthly minimum; reviewed evidence does not establish it is needed here.
No separate minimum TURN subscription charge was documented.

Reviewed official documentation says Cloudflare TURN/SFU share a monthly
1,000 GB allowance per account, then $0.05/GB. Calendar-versus-billing-cycle reset
boundaries remain undocumented in the reviewed material. Confirm actual account
eligibility, activation/payment requirements, and enforceable controls before
enabling billable relay.

**Relay activation is blocked until the budget can be safely honored.** Budget
alerts do not stop or cap usage. TURN operational analytics usually lag about
30 seconds; billing usage updates daily and charges in arrears. Short credentials,
issuance cutoffs, and revocation reduce exposure but do not guarantee the ceiling.
Do not activate open-ended billing or represent an alert as a hard cap.

If Cloudflare cannot safely honor the ceiling, explain the concrete limitation.
Xirsys documents a hard-capped 500 MB/month free Developer tier with testing-region
limits after its trial; that could support bounded testing but is not an
equivalent production replacement. Do not silently substitute a tiny or
geographically unsuitable allowance for the full connectivity requirement.

Independent local/offline work, static previews, and nonbillable setup may
continue while this gate is unresolved. Required working relay remains part of
the complete multiplayer release.

Measure actual relay egress at eight karts and sixteen remote humans. An earlier
illustrative estimate of roughly 0.3-1 GB per fully relayed eight-human room-hour
is neither acceptance evidence nor a forecast for sixteen participants.

Use server-side secrets, short-lived per-session relay credentials, payload
limits, rate limits, expiring rooms, explicit room/seat ownership, and host
controls. No long-lived provider credentials in the browser.

Disclose briefly that direct WebRTC may reveal network addresses to room peers.
Do not relay all traffic solely to conceal addresses. Diagnostics are minimal
and bounded, without raw player IP histories, chat, personal profiles,
advertising, or tracking. Browser-hosted authority is suitable for friends, not
strong competitive anti-cheat; validate inputs and ownership without building a
heavyweight anti-cheat system.

## 8. Delivery checkpoints

| Milestone | Required outcome and gate |
|---|---|
| Creative direction | Approved specification; proposed roster, world, karts, specials, and free asset pipeline; creative approval before production art |
| Driving foundation | One polished driving slice with kart, camera, controls, drifting, gliding, and feedback; handling approval before all-six-track expansion |
| Networked slice | Two actual browsers through invitations, direct and forced relay, authority, prediction, and results; real cross-device/cross-network evidence |
| Core systems | Tandem rules, items, bots, race rules, recovery, occupancy, and failures working together |
| Content and UX | All approved courses, cast, parts, modes, audio, menus, accessibility, and rematches without placeholder-only substitutes |
| Hardening and delivery | Performance, compatibility, network adversity, enforceable cost safety, deployment, and operating documentation |

The checkpoints are inside one full implementation, not permission to call a
primitive demo the game. Continue independent tooling/networking work while
waiting for creative or handling feedback. Do not finalize an unapproved roster
or expand all six courses before handling review.

Work in an isolated feature branch, commit/push coherent changes, and integrate
completed work without modifying another checkout. Pull-request ceremony is not
required unless requested or required by repository policy.

## 9. Release acceptance

- Identify actual reference hardware and browser versions. Report frame-time
  distributions rather than an average alone for the stable 60 FPS target.
- Measure representative eight-kart scenes, including four-player split-screen
  quality scaling, readability, and input response.
- Local steering never waits for a host reply. Measure prediction, correction,
  and actual latency profiles.
- Complete essential flows with a controller and cover keyboard fallback,
  calibration/remapping, and hot-plug behavior.
- Complete a race and rematch at target occupancy across real browsers/devices.
- Prove direct and forced TURN connections, measure egress, and expose meaningful
  connection/quota failures.
- Evaluate response, corrections, and item consistency under representative
  latency/jitter/loss. Candidate profiles: 40/80/150 ms RTT and 0/1/3 percent loss.
- Verify disconnects, backgrounding, host migration, reconnection, and tandem
  ownership transitions.
- Keep checkpoint progress, finishes, items, and random outcomes authoritative.
- Maintain simulation/protocol and browser integration coverage.
- Ship no long-lived secrets, unresolved licensing, or unapproved billable setup.
- Match repository, brand, hostname, documentation, and deployment to Kartsick.
- Deliver all six tracks, eight characters, eight bodies, six wheel sets, four
  gliders, sixteen standard effects plus variants, four specials, all modes,
  gliding, and recovery together. No "coming soon" controls or placeholders
  standing in for the agreed release.

Use synthetic maximum-occupancy coverage as well as independent real browsers
and a real remote connection. Physical controllers, other hardware, and other
networks may need human participation. Synthetic inputs and CPU throttling are
not evidence for untested devices. Record gaps honestly.

## 10. Licensing

Code: MIT. Original art/audio: CC BY 4.0. Retain third-party licenses and maintain
the attribution manifest. Never publish credentials, private execution
instructions, local absolute paths, or conversation metadata.

## 11. Research references

Pricing and provider behavior must be rechecked before service activation.

- [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Object WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Realtime pricing](https://developers.cloudflare.com/realtime/sfu/pricing/)
- [Realtime monthly account allowance](https://developers.cloudflare.com/realtime/sfu/limits/)
- [Realtime overview](https://developers.cloudflare.com/realtime/)
- [TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)
- [TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
- [TURN analytics](https://developers.cloudflare.com/realtime/turn/analytics/)
- [Budget alerts are not hard caps](https://developers.cloudflare.com/billing/manage/budget-alerts/)
- [Billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/)
- [Xirsys pricing](https://xirsys.com/pricing)
- [Xirsys FAQ](https://xirsys.com/faq)
- [WebRTC data channels: RFC 8831](https://www.rfc-editor.org/rfc/rfc8831.html)
- [Reference tandem mechanics](https://www.mariowiki.com/Mario_Kart:_Double_Dash!!)

Reference games inform analysis only; they are not cleared production assets.
