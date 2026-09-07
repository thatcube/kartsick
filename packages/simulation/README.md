# Shared racing engine

The authoritative engine is independent of DOM, Babylon, transport and storage.
Its state is plain bounded data. It implements the approved shared racing
systems on the **actual Butterbell study course**, not substitute tracks.

The public `src/index.ts` is a re-export-only barrel. Shared driving code lives
in `src/physics.ts`; the race implementation imports physics directly rather
than importing its own public barrel. Initialization does not depend on whether
the consumer loads the race, physics or public entry point first.

The working foundation has passed its expansion feedback checkpoint, while
handling and presentation still need substantial refinement. The five additional
courses are in production. The engine now supports nonuniform checkpoints,
shortcut-specific surfaces, moving course hazards, multiple flight zones and
open three-sector descents; a course remains unavailable until its own geometry
is connected. No cup is completed by repeating Butterbell.

Circuit scoring and the local round/results flow are implemented but remain
unavailable to start until all of a circuit's original courses are connected.
Online circuit checkpoint integration is still in progress.

## Integration API

Import from `@kartsick/simulation`:

```ts
const race = createRace({
  courseId: "butterbell",
  mode: "race",             // or "time-trial"
  speedClass: 100,          // 50 | 100 | 150
  mirror: false,
  bots: true,
  difficulty: "normal",     // easy | normal | hard
  seed: 123,               // unsigned 32-bit integer
}, [{
  id: "kart-a",
  name: "Road crew",
  build: DEFAULT_BUILD,    // imported from @kartsick/content
  players: ["human-a", "human-b"],
}]);

const events = stepRace(race, {
  "human-a": { ...NEUTRAL_PLAYER, throttle: 1, steer: .2 },
  "human-b": { ...NEUTRAL_PLAYER, useItem: true },
});
const prediction = copyRace(race);
const decoded = parseRaceState(JSON.parse(receivedSnapshot)); // RaceState | null
const rows = standings(race); // ordered RaceResult[], including current progress
```

`stepRace` mutates its state **once per 1/60 second** and returns only that tick's
events. Do not call it from React rendering. Existing `FixedClock` limits catch-up
to five steps. Pause by not stepping. Never advance a background authority with
a fabricated wall-clock catch-up.

`PlayerInput extends DriverInput`:

| Field | Domain | Meaning |
|---|---|---|
| throttle / brake | 0…1 | Manual analog acceleration / braking |
| steer / pitch | −1…1 | Manual ground or airborne steering / pitch |
| drift / recover / swap | boolean | Existing study controls |
| useItem | boolean | Use a rear-held item on a rising edge |
| throwDirection | −1 or 1 | Backward or forward launch |
| slide | −1, 0, 1 | Rear rider's left/right ground slide attack |
| passItem | boolean | Front-held item to empty rear slot, on an edge |

`normalizePlayerInput` clamps finite analog values and neutralizes invalid
fields. Missing packets are neutral, **not latched throttle**. After 30 missing
ticks an empty kart gets AI; a surviving co-op human gets solo control. Sending
current inputs restores control. `setRacePlayers(race, kartId, [driverId, rearId])`
atomically updates seat identities, rejects duplicate ownership and clears old
button edges. Transport still owns admission, reservations, the 60-second
reconnection window, acknowledgements, epochs and migration commits.

IDs are 1–64 ASCII alphanumeric/underscore/hyphen characters; kart IDs reserve
the `e<number>` effect namespace. Names are 1–32 nonempty characters. There are
at most eight karts and sixteen unique human owners.

### Snapshot and view fields

- `RaceState.version` is `1`; `options`, `tick`, `rng`, `nextId`,
  `firstFinishTick`, `phase`, `karts`, `items`, `pickups`, `results` are required.
- `phase` is `countdown | racing | finishing | finished`. Countdown is 180
  ticks; after the first recorded finish the grace period is exactly 2,700 ticks
  (45 seconds). A 108,000-tick safety ceiling terminates an otherwise endless
  race with explicitly incomplete results.
- Each `RaceKart` has `id/name/build/players`, `state: KartState`, `held`,
  `status`, `statusIds`, `boostId`, `previous`, `missing`, `swapRequests`,
  `startPress`, `startBoost`, `slideDirection`, `bot`, `ai`, `stuckTicks`,
  `finishTick`. These are all part of prediction/migration state.
- **Seat indices are character indices.** `state.driver` selects the front
  character. `players[0]`, `build.characters[0]` and `held[0]` stay together
  through a swap. The rear is `1 - state.driver`. Render one view per kart.
- `held[seat]` is null or `{id,item,charges,ttl,cooldown}`. `ttl === -1` means a
  reuse window has not started; active windows are seconds. Triples have three
  separate uses; Static Sling has two; rapid boost has at most twenty uses in
  six seconds. All uses have a cooldown and require a new button edge.
- `status` contains seconds for `stun`, `grace`, `invincible`, `shrink`,
  `vision`, `ghost`, `autopilot`, `slide`, `slideCooldown`, `boostSteal`.
  `statusIds` carries each active source ID. `boostId` identifies the current
  boost activation, including distinct activations of a reusable held item.
  `vision` is a render overlay, never hidden steering. `shrink` affects actual
  acceleration, maximum speed and collision weight; render the size change.
  `ghost` phases contacts briefly; `autopilot` is an explicit temporary item,
  never a general steering setting.
- `state.mode` is ground/air/glider; `driftCharge` drives spark tiers;
  `swapTime`, `recovery`, `wrongWay`, `offRoad`, `lap`, `nextCheckpoint`,
  `lapTimes`, `elapsed` retain the study meanings.
- `RaceResult` has `id,name,position,finished,disconnected,time,progress,points`.
  A finisher's `time` is the recorded physics elapsed time. Incomplete results
  have `time:null`. Recorded finishes always precede remaining checkpoint
  progress. Ties use stable ASCII ID order. `results` is empty until finalization
  and preserved afterwards. `standings()` supplies live rows beforehand.

`copyRace` deep-copies every mutable nested value. `parseRaceState` validates the
complete schema, finite numeric bounds, enum IDs, ownership, active effect
capacities, reference namespaces, progress shape, and authoritative result
consistency. It returns an independent copy or null; it does **not** repair a
partial snapshot. Do not merge an unvalidated snapshot into live state.

### World effects and events

`race.items: WorldEffect[]` is the world-effects collection, **not held slots**.
Each entry contains:

```
id, item, kind, owner, x, y, z, vx, vy, vz,
radius, ttl, age, arm, charges, target, reflected,
u, lane, direction, hits
```

All times are seconds. `arm` is the visible warning interval: collision and
motion follow the particular effect's telegraph. IDs are monotonic race-local
`e<number>` values. Preserve them for reconciliation. `target` is a kart ID or
an effect ID (a homing decoy), or null. `reflected` marks a nonrecursive cushion
return or static deflection. `hits` is bounded to the eight actual racer IDs.

| kind | Render/behavior contract |
|---|---|
| trap | Low road patch; remains until hit, cleared or expired |
| projectile | Bouncing, limited-turn homing, leader, fire or returning shot |
| bomb | Gravity/fuse state before conversion to blast |
| blast | Fixed blast center, delayed activation and finite radius |
| barrier | Roadwork stencil then a wheeled barrier at its fixed road lane |
| bumper | Owner-attached velvet defense; display exactly `charges` bumpers |
| coil | Owner-attached spring assembly; count remaining discharges |
| decoy | Inflatable kart-shaped target, not a racer or collision-solid kart |
| pulse | Expanding clearing ring with a finite radius and duration |
| weather | Pack-wide shrink or vision warning before the effect resolves |
| theft | Visible delayed borrowing tell |
| dropped | A rival's dislodged front-held item, retaining remaining charges |

`pickups` are twelve original item-box placements on Butterbell, each with a
five-second cooldown; center boxes fill both available character slots. Drops
are bounded world pickups, never an unlimited item queue. Standard rolls are
position-weighted; pair specials depend on the character receiving the item.

`RaceEvent` contains `type,tick,kartId`, with optional
`effectId,targetId,item,value`. Types:

```
start start-boost double-start charge boost launch land recover swap
collision lap finish race-finished pickup item-used spawn expire hit
blocked reflect deflect steal pass slide takeover
```

`value` is spark tier, lap/finish seconds, remaining bumper count, slide side or
AI takeover flag, depending on type. Deduplicate transient delivery using the
committed authority epoch plus tick/type/IDs; a returned projectile keeps its
physical ID while changing ownership. Continuous views should come from the
snapshot, not a replay of past spawn events.

## Implemented interaction rules

`ITEM_INTERACTIONS` exports explicit per-item eligibility for Velvet, Static,
shockwave, decoys and road-only use. It includes all 23 stable item IDs.

- **Skid Patch / triples:** armed road drops. Braking reduces the spin.
  Projectiles or a shockwave clear them. An owner can hit their own armed trap.
- **Ricochet Reel / triples:** finite ricochets from road boundaries and scenery;
  projectile/trap interception, steering avoidance and Velvet are counters.
- **Chaser Chime / triples:** one ahead target, limited turn rate, road/scenery
  collision, and decoy interception. Backward launches are nonhoming.
- **First-Class Parcel:** follows the leading unfinished rival, bypasses ordinary
  decoys/Velvet/Static, then locks a blast position with an escape interval.
  Shockwave or existing invincibility also counters it.
- **Popclock:** actual thrown gravity, settling/scenery collision, contact/fuse
  detonation and a delayed area blast, including self-risk.
- **Zip Can / Zip Three / Zip Flask:** manual ground or airborne thrust;
  boost contact can steal when the rear slot is empty. No invincibility.
- **Parade Power:** timed attack immunity, speed and contact stealing. Falling,
  recovery and ordered checkpoints still apply.
- **Pocket Weather:** delayed pack shrink/slowdown through the shared hit-grace
  path; protected racers resist it.
- **Express Escort:** finite, visibly guided ordinary road physics, with temporary
  protection. It does not teleport or grant checkpoints.
- **Confetti Forecast:** delayed visual interference, cleared by a boost.
- **Borrowing Bell:** delayed transfer of an actual rival-held item and brief
  phasing. Spending the item before arrival counters theft.
- **Ember Choir:** three moving low-bouncing fireballs with interception and a
  finite lifespan, not decorative orbs.
- **Return Ticket:** an outbound leg, finite turning return leg, collision on
  both legs and owner catch/despawn.
- **Clear the Deck:** expanding defense that removes eligible nearby hazards
  and gives rivals a shove, not a chain stun.
- **Roadwork Rumble:** three fixed, nonhoming road lanes; a half-second stencil,
  about four moving seconds, destruction by shots/pulses, and expiry at a gap.
  It cannot be deployed off-road/in flight or hit gliders.
- **Velvet Rebound:** exactly three projectile absorptions over five seconds;
  each returns a marked nonhoming cushion shot that cannot be reflected again.
  Ground traps, bombs, leader attacks, shrink and theft bypass it. Its orbit
  does not deal contact damage.
- **Static Sling:** two separately triggered thrust/forward-cone discharges in
  six seconds. Sides, rear and leader attacks bypass it. In flight it provides
  thrust only; no steering, immunity or mini-turbo charge.
- **Stunt Doubles:** two four-second adjacent valid road-line inflatables.
  Ordinary homing can select their IDs. Straight attacks destroy them. They
  never enter standings, collect boxes, push racers or block recovery.

All damaging hits share grace, so a multi-part attack cannot repeatedly stun
the same target. Active world entities are capped at 128 globally and 24 per
owner. Normal offense reserves eight global/one-per-owner reaction slots, so a
clearing pulse is not disabled by offense saturation. Non-spawning boosts still
work at the entity cap. The event array is capped at 512 per tick; there is no
ever-growing event history. RNG is a single nonzero xorshift32 state.
An obligatory stolen front-item drop at absolute capacity explicitly expires
the victim's oldest world effect (or the global oldest if they own none), rather
than growing the pool or silently retaining the item.

## Reference-verified tandem mechanics

The original public instruction booklet was inspected directly, not inferred
from contradictory generated search summaries:

- [Nintendo instruction booklet, pages 10–13, public scan](https://snolli.fr/dwl/gamelist/docs/Mario%20kart%20double%20dash.pdf)
- [Super Mario Wiki: controls, Rocket Start, Double Dash and item steal](https://www.mariowiki.com/Mario_Kart:_Double_Dash!!)
- [Super Mario Wiki: Slide Attack](https://www.mariowiki.com/Slide_Attack)

Factual implementation summary: front drives and initiates/releases drift; rear
handles items, supplies the two co-op drift countersteers, and performs lateral
slide attacks. The front can pass an item to an empty rear slot. Both request a
swap together; held items stay with characters. Slide/boost/invincible contact
can steal into an empty rear slot, taking a victim's rear item first and dropping
their front item if both held one. Two fresh acceleration presses at green give
the stronger start. Ground slides are disabled during the approved gliding
addition; driver owns pitch/air steering and rear retains items.

Input windows are original tuning: eight ticks for coordinated swaps, eight
ticks after green for a start press, three ticks between the two co-op presses.
No passenger rhythm minigame exists. Legacy standalone study callers retain
their existing three-counter solo drift test behavior; two-human race control
uses the booklet's two rear counters after initial drift sparks.

## Content and physics helpers

`@kartsick/content` exports `CHARACTERS`, `BODIES`, `WHEELS`, `GLIDERS`, `PAINTS`,
`DECALS`, `ITEMS`, all original stable ID constants/types and `DEFAULT_BUILD`.
`validBuild` is a complete-build type guard. `normalizeBuild` defaults only
omitted fields, rejects explicitly invalid IDs/duplicate characters and returns
a fresh build. `combinedStats` (`buildStats` alias) multiplies real part
tradeoffs; character appearances and cosmetics do not change physics.

`tuningForBuild(build, speedClass)` maps those stats into actual acceleration,
speed, road/drift grip, steering, rough-surface maximum, flight speed/lift/turn,
stall/landing envelope and mini-turbo duration. Collision response uses combined
weight. All 192 combinations can complete Butterbell in the targeted tests.

`stepKart(state, input, {course?, tuning?, countersteer?})` preserves two-argument
legacy calls. Supplying `countersteer` opts into the rear-controlled co-op
charge behavior. `createKart(course?)` and `recoverKart(state, course?)` accept
the same course query. `advanceKartProgress` handles ordered collision-driven
crossings without granting skipped gates.

`getCourse("butterbell", mirror)` is exported from content and simulation.
It provides `sampleRoad`, `projectRoad`, `surfaceHeight`, `terrainHeight`,
`isWater`, `isGap`, `hasRail`, `road`, `checkpoints`, `colliders`, dimensions,
length, laps and format. Mirror means **X → −X**, including tangent X, collider
X, yaw sign and lateral sign. Progress `u` is unchanged. The renderer must
reflect the same world rather than reverse track traversal.

`COURSES`, `CUPS`, and `availableSeries` expose the approved full identities and
schedules honestly. `getCourse` rejects the unbuilt five. Time trial creates one
kart, no random boxes and exactly two initial boosts, using identical physics.

### Circuit results

`createSeries("town" | "horizon" | "tour")` starts bounded, versioned circuit
progress. `nextSeriesCourse` returns the actual next course, or null after the
last round. `appendSeriesRound` accepts only a completely validated finished
race on that next course; it rejects duplicate/reordered rounds and time trials.
`parseSeries` restores an independent copy with at most six rounds and eight
distinct kart IDs. It checks the schedule, result positions, point values and
complete/incomplete times without substituting other courses.

`seriesStandings` totals the same `RACE_POINTS` used by individual races:
10, 8, 6, 4, 3, 2, 1, 0. Ties use wins, completed finishes, lower total recorded
time and finally stable ASCII kart ID. Incomplete racers retain their official
progress-ranked points, but a local medal requires finishing every round and
placing in the top three. `seriesMedal` returns the best eligible local medal or
null. Medals do not unlock gameplay content.

## Validation and remaining release gates

Use existing tooling:

```
npx vitest run packages/content packages/simulation
```

Coverage includes all item IDs, actual effects/expiry/counters, signature
bypasses, cooperative ownership/swaps/stealing/counters, speed/part tradeoffs,
all 192 build combinations completing actual Butterbell, mirrored physics and
50/150 bot runs, eight-bot and sixteen-owner races/results, ordered checkpoints,
time-trial allowance, snapshot roundtrips/rejection and capacity guards.

This is shared simulation evidence, not approval of physical-controller
handling, final production visuals/audio, real-network migration/performance,
the five gated track layouts, completed cups/tour or billable relay. Those remain
separate integration/release requirements. No assets, guides or game code were
copied into this package; the reference inspection images were removed.
