# First driving study: status and evidence

## Current checkpoint

The specification and second creative direction are approved. A playable
single-kart Butterbell study is available for human controller feedback. This
is not the complete Kartsick release, a completed online vertical slice, or the
final production art/audio package.

The initial human check used a keyboard and established basic functionality,
not finished quality. Presentation and feel still need substantial work.
**Controllers are the primary target.** That quick check is not controller
handling approval and does not open the all-six-track expansion gate.

The study includes manual acceleration/braking/reverse, three-stage
countersteer drifting, mini-turbos, rail contact, recovery, driver swapping,
glider launch/pitch/landing, ordered checkpoints, three laps, results/restart,
local records, quality/audio/motion settings, calibration, and input remapping.

The second study pass keeps analog steering, grip, acceleration, and drift
thresholds unchanged. It brings the camera closer without speed-dependent
translation lag, follows travel direction more gently during a slide, and keeps
the view above terrain. Rider hands now reach the steering wheel or rear grips;
wheel profiles and sculpted normals are smoother. Orchard rows, nearer barns,
hay bales, verge flowers, and approach/landing signs strengthen the first course.

Visible road banks and physical support now share one surface definition.
The reservoir has matching ground depth and water contact. Barns, silos, trunks,
hay bales, and the windmill tower have coarse collision shapes with height
checks; this is not yet a complete collision treatment for all scenery.
Skid marks and tire particles have fixed capacities and respect reduced motion.
An original eight-bar arrangement replaces the short audio loop, with
load-sensitive engine sound and separate impact/landing effects.

Study version 2 retires incomparable version-1 times while preserving settings.
Some browsers require a click for audio even after a gamepad button has started
the race. The study now explains that condition and provides **Enable sound**
without preventing controller driving.

## Recorded automated coverage

Coverage is executable in the repository rather than an assertion about
unavailable hardware:

- Simulation tests cover stationary input, acceleration/coasting, braking/reverse,
  drift charge edges, boost release, tagged glider launch, pitch/airspeed tradeoffs,
  failed-crossing recovery, swap edges, checkpoint order, reverse crossing,
  three-lap completion, and bounded fixed-step catch-up. Additional coverage
  exercises continuous banks, scenery impacts/overlaps, and flight over trunks.
- A test-only driver completes the full three-lap study through the same manual
  simulation without recovery, launching and landing on each lap. This is not a
  player steering assist and is not shipped in the game.
- Protocol tests reject unsupported versions, excessive/invalid input values,
  out-of-range seat indices, extra fields, and invalid sequences. Relay activation
  remains explicitly blocked.
- Local-save tests cover missing/corrupt data, invalid calibration, course-version
  changes, quota failure, and propagation of unexpected errors.
- A headless engine test builds and batches the procedural kart/character rig,
  checks vertex data, and exercises glider deployment.
- Both riders retain distinct front/rear grip poses through swapping.
- Browser tests cover actual WebGL rendering, keyboard acceleration/coasting,
  swapping, pause/resume, focus loss, saved quality/motion settings, key remapping,
  and a synthetic standard-gamepad start/drive/disconnect/reconnect sequence.
  A deliberately blocked first audio activation exercises the nonblocking
  permission notice and clicked retry; it is not browser-family certification.
- A browser course-driver test follows the normal analog input path through an
  entire lap, captures the deployed glider during the crossing, lands, and passes
  the ordered lap gate without recovery. This is synthetic input, not a claim
  about physical-controller feel.
- Synthetic analog drift coverage exercises three charge strokes, actual tire
  particles/marks, their fixed budgets, reduced-motion removal, and camera
  distance at speed. The browser-native test pilot keeps updating ordinary
  gamepad inputs during screenshot capture; it never writes simulation state
  and is not part of the production bundle.

Current development environment: Apple M4 Max, macOS 26.6.2, Node.js 26.7.0.
Automated browser engine: Chromium Headless Shell 153.0.8010.12, via the
project's Playwright 1.63.0 installation. Browser fixture output records exact
owned PIDs/profiles privately in ignored test results; these are not published
as machine paths.

**No 60 FPS reference-device claim is made.** The developer machine is not the
target M1/integrated-Windows baseline, and headless rendering is not evidence
for real-GPU gameplay. The HUD exposes rolling p95 frame time, FPS, and actual
render resolution for investigation. Read-only diagnostics also expose camera
position, mesh/vertex counts, and bounded feedback counts. A recorded headless
renderer identifies ANGLE/Vulkan **SwiftShader**, so its software-rendered
frame times are not represented as hardware-accelerated controller performance.
Single-kart headless/browser observations
do not establish eight-kart or split-screen performance.

## Human feedback and remaining evidence

The first requested feedback is from an actual controller: steering weight,
drift initiation and countersteer timing, turning radius, camera, speed
impression, and glide control/landing. Physical Xbox, PlayStation, Switch Pro,
and adapter coverage is still open. Synthetic gamepad tests are not substituted
for that evidence.

Only the first study is implemented. Remaining release work includes real
browser-hosted networking and prediction/reconciliation, signaling and safe
relay activation, real cross-network testing, full two-human tandem mechanics,
four-player local/split-screen, all item effects/specials, bots, all modes/ghosts,
the complete six-course/eight-character/part selection, migration/reconnection,
target-occupancy performance, and the public deployment.

Do not expand all six tracks before handling approval. Independent networking
and tooling can proceed while feedback is pending. No provider account has been
activated for billing, and no alert is being treated as a spending cap.
