# Kartsick

An original browser kart racer for friends: two characters per kart, manual
arcade driving, couch multiplayer, and invite-link online races.

**In development: local and direct-online eight-kart racing are playable.** The release
specification and creative direction are approved. This is not yet the complete
six-track online release. The working driving foundation has been reviewed;
handling/presentation refinement and relay cost safety remain unfinished.

- [Approved release specification](docs/specification.md)
- [Cast, world, karts, and signature-special proposal](docs/creative-proposal.md)
- [Asset licensing and provenance](ASSETS.md)
- [Driving mechanics and controls](docs/driving-reference.md)
- [Current delivery evidence and remaining gates](docs/driving-study-status.md)

## Play the development build

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173>. The main game includes Butterbell races against
bots, standard items and signature specials, all eight characters and
customizable parts, manual driving and countersteer mini-turbos, gliding,
three-lap results and rematches, and solo time trials with saved racing ghosts.

**Controller is the primary target:** left stick, triggers to accelerate/brake, right shoulder to drift,
north face to swap, left shoulder to use items, Select/View to pass items,
right-stick click to recover, and Menu/Start to pause. With default
bindings, the lower face buttons also accelerate/brake, using Nintendo's
positions on recognized Switch controllers. Pull back to float and push forward
to dive while gliding. **Controls** includes bindings and per-player calibration.

Keyboard fallback: WASD or arrows, Space to drift, C to swap, R to recover,
E to use an item, Q to pass, Left Shift for a backward throw, and Escape to pause.
The rear rider uses Z/X for ground slide attacks. If the browser requires a click to unlock audio, select
**Enable sound**; controller driving is not blocked.

Add up to four local players with controllers; one keyboard player can join them.
Assign two people to the same kart for tandem play. Each local kart gets one
camera, so four humans can use one, two, three or four views depending on seating.
The three-kart layout uses its spare quadrant for the course map.
Parts change both geometry and handling; there are no progression locks.

Choose **Online race** to create a room or enter an invitation. Each browser can
bring four local players; choose fixed character seats, connect your controllers,
and ready up. The host starts the race. Movement uses browser-to-browser WebRTC,
with bounded local prediction, remote interpolation and replicated host recovery.
Pausing your online controls does not pause everyone else: unattended karts get
temporary AI. Direct connectivity depends on the participating networks.

Local races pause on focus loss or controller removal. Saves are versioned and
bounded, with separate profile records and a six-ghost cache. Unreadable saves
are not automatically overwritten. Study settings migrate without importing
incomparable study times.

The retained single-kart study is at <http://127.0.0.1:4173/?study>. The earlier
keyboard feedback established functionality, not controller handling approval.
The subsequent controller checkpoint accepted the working basis for expansion,
while explicitly leaving substantial refinement in every area.
The other five courses, cups and tour remain in production, not locked behind
medals. No public deployment or working relay is claimed.

## Development commands

```sh
npm run typecheck
npm test
npx playwright install chromium --only-shell
npm run test:browser
npm run build
```

Browser tests own their browser processes and temporary profiles, use a separate
local server on port 4174, and close their resources after each worker. Install
the browser only if its matching executable is missing. Generated output goes
to `dist/`; the largest current file is below the static host's per-file limit.
An independent test invocation can choose a different free port with
`KARTSICK_TEST_PORT=4175`; use a separate Playwright `--output` directory as well
so ownership records and artifacts do not overwrite another run.

Simulation, content, and protocol are separate TypeScript packages. React owns
menus and occasional lifecycle transitions, not the fixed 60 Hz simulation.
The signaling service and versioned network validation are connected to the real
browser race loop. See [networking](docs/networking.md) for local operation and
remaining network evidence. No relay service or billable infrastructure is activated.

The complete intended release includes six tracks, eight characters, customizable tandem
karts, actual gliding, eight-kart races, and up to four local or sixteen total
human players. All gameplay content will be unlocked immediately.

Code is [MIT licensed](LICENSE). Original art and audio are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see the asset manifest
for attribution and any third-party exceptions.
