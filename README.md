# Kartsick

An original browser kart racer for friends: two characters per kart, manual
arcade driving, couch multiplayer, and invite-link online races.

**In development: the first driving study is playable.** The release
specification and second creative direction are approved. The Butterbell study
is the handling-feedback checkpoint, not the complete six-track multiplayer game.

- [Approved release specification](docs/specification.md)
- [Cast, world, karts, and signature-special proposal](docs/creative-proposal.md)
- [Asset licensing and provenance](ASSETS.md)
- [Driving mechanics and controls](docs/driving-reference.md)
- [Current delivery evidence and remaining gates](docs/driving-study-status.md)

## Run the study

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173>. The study includes an original country loop,
Clutch/Bramble tandem kart, manual driving, three-stage countersteer mini-turbos,
an actual glider crossing, recovery, three laps, results/restart, local best
times, original synthesized audio, and settings/remapping.

Keyboard: WASD or arrows, Space to drift, C to swap, R to recover, Escape to pause.
Controller: left stick, triggers to accelerate/brake, right shoulder to drift,
north face to swap, west face to recover, Menu/Start to pause. With default
bindings, south/east face buttons also accelerate/brake. Pull back to float and
push forward to dive while gliding. Select **How to drive** for the charge
sequence and remapping.

The study pauses on focus loss or controller disconnection. There is no steering
or acceleration assist. It currently contains one local kart, not completed
two-human co-op, split-screen, bots, items, or online rooms.

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

Simulation, content, and protocol are separate TypeScript packages. React owns
menus and occasional lifecycle transitions, not the fixed 60 Hz simulation.
Network protocol validation is present, but a protocol package is not a working
online implementation. No relay service or billable infrastructure is activated.

The complete intended release includes six tracks, eight characters, customizable tandem
karts, actual gliding, eight-kart races, and up to four local or sixteen total
human players. All gameplay content will be unlocked immediately.

Code is [MIT licensed](LICENSE). Original art and audio are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see the asset manifest
for attribution and any third-party exceptions.
