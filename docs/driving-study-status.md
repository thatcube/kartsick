# Driving foundation and multiplayer: status and evidence

## Current checkpoint

The specification and second creative direction are approved. A playable
single-kart Butterbell study remains available at `/?study` for controller comparison.
The main entry runs the expanded local and direct-online development build.
This is not the complete Kartsick release or the final production art/audio package.

## Character, item and valley modeling

The eight approved riders now use shaped jaws and muzzles, tailored clothing,
articulated sleeves and gripping hands rather than larger stacks of round
primitives. Back-view details include Clutch's goggle buckle and coverall yoke,
Bramble's folded map cape and hanging scarf, Pompa's offset copper rolls and
exposed hair scrolls, Bront's dorsal scutes, Rivet's swept vest panels, Pipvolt's
folded ears, Bollo's envelope seam and Hunkle's diagonal sash. Their existing
mounts, grip targets, facing and swap/lean animation interfaces are preserved.
The shared eyes were subsequently fitted into shallower sockets after native
close-ups showed excessive projection. Both the whites and colored eye layers
remain visible.

One complete cast measures 71,256 vertices, down from 83,990, with the same
87 post-batch meshes and 210 cached construction materials versus 202 before.
These isolated-cast counts are not the full race cost. Front and actual
driving-camera compositions were inspected for all four pairs on the native
Apple GPU, with an additional High-quality Road Crew close-up and Butterbell
barn view. This is another art checkpoint, not final visual acceptance.

All 23 item IDs have reauthored silhouettes and construction: curved chimes
and rubber reels, wax sachets, pressure vessels, readable clock faces,
wind-up wings, upholstered bumpers and inflatable decoys. Triple variants
still expose three charges; a barrier, bumper or decoy model remains one
authoritative effect rather than duplicating the gameplay count. The delivery
pickup has a rounded shell, recessed three-reel faces, brass window framing,
cast corners, lid catches and a shaped handle. Both stamp faces and the
existing lamp/burst/handle anchors are retained. Pickups remain opaque,
with two batches; roulette, bob/spin/reveal/respawn, projectile behavior and
effect lifetimes are unchanged.

The standalone inventory of all 23 items plus one pickup drops from 58,709
to 49,720 vertices and from 102,120 to 93,428 triangles. Its batches increase
from 49 to 73 and materials from 31 to 46, retaining zero item textures.
One pickup is 7,780 vertices and 15,028 triangles. These are explicit tradeoffs,
not a claim that the added material distinction has no rendering cost.
The catalog, single/double pickup close-ups and actual road-scale pickups
were inspected in the native browser.

Butterbell's valley now has 103 broad-canopy trees in seven irregular woodland
groups, entirely beyond the recovery boundary. They share the existing foliage
textures and eight coarse background batches, and do not enter the near-track
shadow-caster list. An initial coarse silhouette was rejected in close-up
camera compositions and smoothed rather than hidden behind a resource budget.
The course-only triangle ceiling rises from 420,000 to 440,000; its 340-mesh,
400,000-vertex, 65-material and 5-MiB base-texture ceilings remain unchanged.
The native stage before adding karts reports 395,627 vertices and 431,999
triangles, including its shared stage geometry.

The distant cottages have side windows/eaves and foundations fitted to their
rotated hillside footprints. The windmill has windows on all four sides and a
timber viewing gallery inside its existing collision radius. Its sail battens
are visible from both approaches instead of disappearing behind the canvas.
Road shape, terrain physics, item locations, course versions, hazards, recovery
and all original collision cores remain unchanged.

The fixed eight-kart composition reports 856,372 vertices compared with
842,550 before this pass, about 1.6% higher after the environment and character
changes; this bench excludes live pickups and effects. The actual race renderer also completed
18 normal/mirrored/normal course loads with eight retained kart models and
12 pickups: no vertex, texture or mesh accumulation, one fewer Butterbell
material after its first unload, and identical subsequent warmed cycles.
Single/four-view/single transitions restore all rider mesh visibility and
retain the same resources. The existing obstruction fade is still visible
as translucent following karts in crowded split-screen views; that visual
policy was not changed in this pass.

These are fixed renderer compositions and lifecycle checks, not driven races,
controller acceptance or native-GPU 60 FPS certification. The repeatable
catalog, pair and real-race benches have bounded lifetimes and release their
diagnostic scenes without changing saved settings. Matching Playwright cases
are present, but the standalone browser-launch failure described below still
prevents claiming those new cases passed on this host.

## All-course small foliage

Butterbell now has 5,800 small plants: irregular meadow drifts, orchard clover,
daisies, buttercups, seed heads and reeds around the reservoir. This replaces
the previous grass-and-flower scatter rather than layering a second system
over it. Mown racing margins and farmyard paving remain clear.

All six courses share the folded-leaf geometry and deterministic placement
system, with different planting for each setting. Terminal and galleria
greenery uses shallow edge troughs and existing planters; the arcade has
turquoise felt-like leaves and pink flowers. Copperwhistle has fern, clover
and seed-head pockets in bark-shaped beds. Lastlight mixes small alpine
rosettes and grasses with lower-altitude flowers, including stone-lip patches
that remain visible from its elevated roadway.

| Course | Plants | Spatial batches | Groundcover vertices |
|---|---:|---:|---:|
| Butterbell | 5,800 | 36 | 128,224 |
| Afterglow | 1,626 | 24 | 48,291 |
| Escaluna | 2,259 | 31 | 59,536 |
| Tiltglass | 1,370 | 23 | 46,137 |
| Copperwhistle | 1,416 | 18 | 86,911 |
| Lastlight | 4,800 | 113 | 93,086 |

Each course adds one opaque material and no textures. Leaves and their edge
beds share 64-metre spatial batches, with soft upward leaf lighting and
separate shaped normals on the soil and edges. These are low, non-solid
decorations outside the supported driving corridors, not new drivable ledges.
Placement excludes every main/shortcut corridor, swept hazard area, flight
approach/landing, scenery core and unsuitable water/slope support. Course
physics, collision shapes, route versions and recovery behavior are unchanged.

At that checkpoint, the extra Butterbell planting increased the fixed
eight-kart scene from 738,994 to 842,550 reported vertices, approximately 14%. Its course-only
limits were 340 meshes, 400,000 vertices and 420,000 triangles; the existing
65-material and 5-MiB base-texture limits were unchanged. The addition is bounded
and spatially culled, not a claim that more geometry is free.

Captioned driving-camera views were inspected on the shared browser's Apple
GPU for all six courses, with both Balanced and High views of Butterbell.
The actual `RaceScene` also completed 18 normal/mirrored/normal course loads
in one native engine with correct foliage transforms and no accumulating
vertices, textures or materials. Fresh standalone Playwright Chromium launches
failed before opening the test page on the development host; those attempts
are not passing browser tests. The reusable graphics bench has explicit
readiness/lifetime bounds and disposes its scene without changing saved game
settings. This remains a foliage pass, not the broader art rebuild still
needed by the other five worlds or native-GPU 60 FPS acceptance.

## Environment-art pass

The lighting correction improved the picture but did not resolve the sparse,
primitive-looking environment. This pass changes Butterbell's assets and
composition rather than adjusting the light rig again.

The single smooth tree crowns are replaced with seven interlocking branch-led
volumes, folded leaf sprays, painted leaf/bark textures and smaller irregular
apple pairs. The original tree locations and trunk collision cores remain
unchanged. Barns now sit in rounded cobbled yards with planted herb beds,
connected low hedges, striped window awnings, shutters and dairy details.
Grounded mulch circles replace bare orchard bases. Small meadow leaves and
buttercups replace the scattered triangular clippings; their shared, two-sided
geometry uses ground-aligned shading rather than dark intersecting cards.
The grass texture no longer contains the repeating sinusoidal tuft stripes,
and broader harvest-field colors distinguish planted areas.

A compact dairy hamlet adds a distant scale reference beyond the recovery
boundary, with varied orientations, fitted foundations and a connecting lane.
Its ground follows the same rolling-countryside equation as the horizon.
The road, banks, gaps, item locations, hazards, recovery rules and collision
cores are unchanged; the new close planting is low, non-solid vegetation.
Ground overlays receive shadows but do not cast self-shadow stripes, and
raised soil beds have separate heights from the paving beneath them.

At this earlier checkpoint the course alone measured 302 meshes, 269,622
vertices and 328,171 triangles. Its limits were 320 meshes, 280,000 vertices,
345,000 triangles and 65 materials, rather than hiding the additional foliage
behind the old budgets. Ten shared local textures occupy 4.75 MiB before
mipmaps, retaining the 5 MiB base-texture limit. In the fixed eight-kart scene,
reported vertices rise from 608,847 to 738,994 (about 21%). Spatial batching,
shared materials and disposal ownership remain in place. These are resource
counts, not native-GPU 60 FPS certification.

Default Balanced and High previews use the actual engine frame lifecycle and
captioned, repeatable driving-camera positions, including the barn approach.
The world-loading regressions exercise the real course adapter, preserve all
solid cores, check planted/paved clearance and outward/nonzero normals, and
retain individual readable mirror-label pivots. This is another playable art
checkpoint, not final acceptance of the reference-quality target. Rider and
kart animation, finer environmental art and the other five course-specific
overhauls remain unfinished.

## Lighting and grounding correction

The first graphics checkpoint was not visually accepted: the scenery still read
as flat and sparse, with weak grounding and a cutout horizon. This correction
was compared at matching driving-camera positions in both Balanced (the default)
and High, not only in a close-up model viewer.

Butterbell's course adapter was dropping its authored environment, so the main
game and study used fallback lighting. Returning the complete world now retains
its sky, fog and light balance. The same adapter incorrectly stopped all world
animation under reduced motion; harvest rollers now receive race time while the
decorative windmill alone respects reduced motion. The world regressions now
exercise this actual course-loading entry point rather than only the builder.

The sun/fill budget no longer saturates the StandardMaterial diffuse-light
clamp, preserving shading on textured and vertex-colored surfaces. A brighter
pasture palette, controlled exposure and blue sky fill keep shadowed characters
readable. Fog has its own color instead of turning distant scenery saturated
sky blue. The horizon is continuous rolling geometry outside the playable
bounds, joined to the existing ground rather than two flat ridge strips.

Kart contact shadows previously coincided with the rendered road height.
They now clear pavement and follow the local slope, including mirrored and
overlapping-deck routes. Directional shadows use a corrected bias to avoid road
striping, and their focus follows the same mirrored sun direction as the sky
and reflections. These changes preserve driving and collision geometry.

The visual gap is still real: this is a lighting/grounding correction, not
reference-quality environmental production. The broad fields still need
stronger composition and richer original assets; lighting alone cannot supply
that. Software-rendered browser captures are not a native-GPU performance claim.

## First graphics-overhaul checkpoint

Butterbell now has an authored dairy-festival environment: restrained aggregate
asphalt, packed verges, continuous planted fields, sculpted orchard crowns,
gambrel barns with joinery and fitted foundations, detailed silos, lattice
windmill sails, and a bell-topped starting gantry. Seven locally generated
material/lettering textures replace the earlier mostly untextured scenery.
Hidden raw terrain is clipped beneath the existing road and banks, fixing the
grass that previously covered part of the orchard lane without changing physics.

All eight riders have reauthored seated anatomy, facial volumes and outfits.
The tandem mounts are lower and closer together; cockpits are recessed rather
than solid through the riders. Coachwork, wishbones, exhausts, tire carcasses,
tread, hubs and canopy rigging have been refined. The default model's
width/height/length changed from approximately 2.39/2.90/3.61 metres to
2.59/2.35/3.10 metres, retaining the shared tire contact plane and existing
driving/collision parameters.

The shared renderer distinguishes paint, metal, rubber, fabric, skin and wood
through finish-aware materials and batching. Original sky reflections, a cloud
atmosphere, HDR tone mapping, quality-scaled shadows, restrained high-quality
bloom and soft contact shadows provide a consistent lighting baseline. This
uses Babylon StandardMaterial finishes, not a claim of a complete PBR pipeline.
Day, dusk and indoor profiles are available for each world's setting; the
Butterbell environment forwarding defect described above was found and corrected
in the subsequent lighting pass. Mirror mode keeps the sun, reflections and
readable lettering consistent.

Repeatable high-quality composition captures put the default kart at about
18.3% of viewport width and 34.9% of height. Those captures supply poses for
visual comparison; they are not driven races or performance measurements.
Separate browser coverage drives the garage-selected roster, four-player
split/tandem layouts, a complete study glide and next lap, pickup roulette and
Towbell recovery, and normal/mirrored course transitions without accumulating
world resources. Geometry coverage includes nonzero normals and road/bank
clearance; cold browser runs discover shader dependencies before capture.

This is a playable first art-overhaul checkpoint, not final visual approval or
the finished quality of the reference screenshots. Landscape composition,
environment density and finer asset/animation polish still need development.
The other five environments have the shared renderer and new karts, but have
not received Butterbell's dedicated art rebuild. Physical-controller feedback,
native-GPU performance and final art/audio acceptance remain open.

## Previous terrain, items and audio checkpoint

The current feedback pass adds a 1.6-second authoritative item roulette, with
decelerating HUD symbols, a settling cue, and a steady-symbol progress indicator
under reduced motion. The chosen result is reserved at collection and cannot be
used during the spin; character swaps/passing and checkpoint restoration retain
that exact inventory. Mystery items are not stealable until revealed. Fixed
time-trial boosts and identifiable dropped items do not roll.
Ground pickups are now 1.72-metre-wide brass-trimmed enamel delivery cases,
with readable front/back reel stamps, carrying handles and warm indicator lamps.
Paired cases remain distinct, and collection/respawn motion is separate from the
authoritative reveal. The cases use two batched meshes each and original
procedural geometry rather than imported art.

Engine audio now uses an original, seamless combustion-pulse waveform instead
of a sustained oscillator tone. Five virtual gears have shift hysteresis and
bounded RPM changes; throttle load, coasting, inferred heavy braking and gliding
change the timbre and level without affecting driving physics. Roulette has
slowing mechanical ticks and an authoritative settle sting, while Towbell has
timed hook/lift/lower cues. All use the existing volume and pause controls.
Native-browser mix coverage exercises all six arrangements and four simultaneous
item-effect streams at full settings, with finite, nonclipping output and working
suspend/resume/disposal. That does not replace listening on actual speakers or
headphones; subjective engine and mix approval is still outstanding.

Towbell, an original bell-shaped propeller tug, now visibly lifts, carries and
lowers a stranded kart using a source/path stored in the simulation. Recovery
reserves a safe road position within ordered progress, uses metre-based run-ups
before flight gaps, and ignores repeated recovery requests during its 1.8-second
sequence. Controls, item hits and kart contacts cannot interrupt the carry.
Butterbell also has rolling harvest hazards shared by rendering and physics,
raised pasture hills, and a hillside orchard. These are a new playable pass,
not final graphics, handling or audio approval.

The five other courses now have reworked landforms and more visible structure:
airport berms, mailplanes and deck trusses; galleria terraces, conservatory and
promenade undercrofts; arcade machinery wells and illustrated backglass; a
canopy ravine, grounded root supports and a surrounding forest; and enclosing
mountain ridges with exposed strata. Crossing warnings follow the real moving
hazards, including a second airport baggage crossing and a moving galleria
display. Lastlight retains the approved three-sector downhill format; it has
not been converted into a summit climb.

The tightest bends in Afterglow, Escaluna, Tiltglass and Copperwhistle were
reshaped without altering manual steering or adding assists. High-resolution
road samples now have minimum turning radii above 18.8 metres. Baseline-build
corner-speed runs cover all three classes and both orientations, excluding
startup and two seconds after contact; no qualifying corner tick stops.
This supplements, rather than substitutes for, physical-controller feedback.
The current course versions also complete the 108 representative drives and
all 6,912 body/wheel/glider/class/orientation combinations without recovery.
Native-browser world cycling and the full Lastlight descent remain covered.

Terrain bounds now include reachable ridge tops and ravines, so a high mountain
rescue remains valid in serialized snapshots. Protocol 5 prevents older course
geometry from participating in the same online race or restoring an old
checkpoint. Earlier rooms keep their seats but return to readiness.

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

Local Town, Horizon and Belltumble Tour browser runs now complete all twelve
scheduled races through ordinary synthetic-controller input. Their journals
record 344 ordered checkpoints, no recovery inputs or automatic AI takeover,
and saved 30/30/60-point gold medals. They cover cumulative standings, natural
finishes, course transitions, explicit rematch restart and medal persistence
after reload. These are 100-class, normal-orientation, one-kart races with bots
disabled through the regular setup UI; they do not establish full-field circuit
balance or physical-controller compatibility.

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
real cross-network testing, online Horizon/tour and full-field circuit evidence,
audio/art refinement and compressed loading, broader migration/reconnection evidence,
target-occupancy performance, and public deployment. The local core and complete
roster now exist, but that does not establish their final balance, production
quality, physical-controller compatibility or network acceptance.

The course-expansion checkpoint has now been reviewed; final handling and
presentation remain iterative work. Independent networking and tooling continue.
No provider account has been
activated for billing, and no alert is being treated as a spending cap.
