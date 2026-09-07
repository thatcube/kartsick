# Driving foundation and multiplayer: status and evidence

## Current checkpoint

The specification and second creative direction are approved. A playable
single-kart Butterbell study remains available at `/?study` for controller comparison.
The main entry runs the expanded local and direct-online development build.
This is not the complete Kartsick release or the final production art/audio package.

The initial human check used a keyboard and established basic functionality,
not finished quality. Presentation and feel still need substantial work.
**Controllers are the primary target.** That earlier keyboard check was not
controller handling approval. At the later expanded-build controller checkpoint,
the working foundation was accepted for continued development, with explicit
feedback that every aspect still needs more work. Course production is now
proceeding; this is not final handling, visual-quality or device certification.

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

## Expanded local-race build

The main entry includes eight-kart races with bot fill and difficulty selection,
the complete character/part selection, item pickups and effects, solo or shared
tandem controls, and up to four local humans. Each distinct local kart has a
camera and HUD; three karts leave a dedicated map quadrant. A following kart
that obstructs the camera fades in that view only, without changing collisions
or its appearance in the other player's view.

The local flow connects setup, a geometry-changing garage, calibration and
remapping, countdown, racing, pause/reconnection choices, results and rematch.
Time trials disable random pickups and start with a fixed boost inventory.
Completed best runs persist independently versioned records and bounded,
ten-hertz pose ghosts. Ghosts are rendered on rematch, not inserted into the
race field or collision simulation.

New browser coverage drives a real eight-kart race; changes characters,
body, wheels and glider through the garage; assigns four synthetic controllers
to four views and then to a tandem-plus-split layout; consumes actual time-trial
boost inventory in mirror mode; and drives a complete three-lap time trial,
saves the resulting ghost, and renders it on rematch. The retained five study
browser scenarios also pass against the refactored shared renderer.
These are functional observations, not human handling approval or native-GPU
performance certification.

## Authored course expansion

All six original courses are connected to the actual simulation and renderer:
Butterbell, Afterglow, Escaluna, Tiltglass, Copperwhistle and Lastlight.
The five closed courses are
three-lap loops; Lastlight is a roughly 4.5 km continuous descent with two
interior sector gates and one finish. Shortcut support, scenery collisions
and moving hazards use the same course definitions as their visible worlds.

Browser coverage selects and drives registered worlds in normal and mirror
mode, returns to Butterbell repeatedly, and checks that vertices, textures and
materials do not accumulate across course changes. This exposed and corrected
reversed terrain/road winding, which geometry-finiteness checks alone missed.
A complete synthetic-controller Lastlight drive crosses every required gate,
glides, lands, and records exactly three sectors with no recovery or supplied
progress. An existing full Butterbell trial still records and replays its ghost.
The expanded six-course normal/mirror pass and a complete Lastlight descent now
pass in the actual browser. Browser test servers disable hot reload and isolate
their dependency caches, so unrelated preview edits cannot restart a run or
invalidate its lazy shader imports.

Long-course driving also exposed two bot assumptions: fixed parameter-fraction
lookahead became excessive on the mountain, and fixed glide pitch landed beyond
the straight landing zone. Road guidance now uses metres; altitude guidance
solves the shared glider's vertical response for the real landing, then follows
the descending road rather than trying to regain an already-passed landing height.
The galleria's landing was lowered to remain reachable with a fast, low-lift
canopy at 50cc. Height-aware support at overlapping main/shortcut forks prevents
falling through an elevated deck or snapping up from a lower shortcut. These
are intentional geometry/support fixes; manual control response values are unchanged.

All 108 representative course/class/mirror/build driving cases complete their
real ordered gates and finish without recovery. The exhaustive single-kart
time-trial matrix also completes all 6,912 combinations: six courses, three
classes, both orientations and all 192 body/wheel/glider builds. It neither
grants checkpoints nor applies recovery. This exposed high-lift 150cc landings
that needed continued descent guidance and earlier air-turn anticipation.
It does not certify multiplayer item traffic, physical controllers or GPU performance.

Six distinct original synthesized course arrangements are authored, with
course selection wired into local and online race loading, a paddock arrangement,
bar-aligned transitions and Lastlight sector changes. Mocked Web Audio coverage
exercises scheduling, voice bounds, interaction cues and lifecycle disposal.
This is not listening approval or final audio production certification.

## Integrated direct-online racing

The main menu now includes room creation and invite-link/code joining, up to
four local people per browser, explicit two-seat kart selection, shared builds,
readiness and host-controlled starts. The running race uses the real simulation
and renderer, not a signaling-only probe. Local prediction replays bounded
unacknowledged inputs; remote poses interpolate buffered snapshots. Snapshots
carry applied-input acknowledgments, and replicated checkpoints restore the
complete race during authority handoff.

An executable scenario uses two actual Chromium processes and the visible game
UI to create/join a room, drive a guest kart through WebRTC in an eight-kart field,
pause/resume that guest's controls while the host continues, and close the host
page. The surviving browser restores a committed checkpoint and becomes the new
authority without restarting the race. This does not establish cross-network,
forced-relay, all-browser or maximum-human compatibility.

The first eight-kart sample reached 14,694 bytes for an uncompressed full-state
snapshot, before envelope overhead. It is a measurement from one local scenario,
not a sustained bandwidth or relay-cost guarantee. Explicitly negotiated
lossless compression now reduces representative full snapshots and checkpoints
without changing simulation data. See the networking document for measured
payloads and bounds; representative maximum-occupancy real-browser traffic
remains release work.

Protocol version 3 adds accepted terminal results and online cup/tour progression.
Completion references a committed checkpoint and a frozen started roster.
The next course returns to readiness with the same kart-slot points; the room
cannot silently change a running circuit's rules. Accepted finished checkpoints
remain eligible for host recovery beyond the active-race freshness window.
Late arrivals can read saved standings without inventing a finished simulation
or incrementing their local played-race count. Targeted server/transport/session
coverage and existing actual online driving/migration scenarios pass.
A naturally driven online Town circuit also completes Butterbell, Escaluna and
Tiltglass. Its finished state survives signaling reconnection and a host
departure after the five-second active-checkpoint window, then a second departure after a late spectator has
received the checkpoint. That spectator restores the exact finished state,
continues through real readiness lobbies after reservations expire, and earns
the final kart-slot medal. Its local race count increases only for the two
rounds it participated in, not for the earlier scoreboard-only arrival.
The six current transport scenarios also pass, including sixteen synthetic
input owners across eight tandem slots. That is transport occupancy evidence,
not sixteen-person rendered gameplay or remote-network certification.

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
- Production output excludes both read-only diagnostic globals and the browser
  pilots. The development study retains its keyboard/controller diagnostic
  coverage behind Vite's development-only gate.

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

All six courses are playable. Remaining release work includes safe relay activation,
real cross-network testing, complete cup/tour browser evidence,
audio/art refinement and compressed loading, broader migration/reconnection evidence,
target-occupancy performance, and public deployment. The local core and complete
roster now exist, but that does not establish their final balance, production
quality, physical-controller compatibility or network acceptance.

The course-expansion checkpoint has now been reviewed; final handling and
presentation remain iterative work. Independent networking and tooling continue.
No provider account has been
activated for billing, and no alert is being treated as a spending cap.
