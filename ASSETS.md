# Assets and attribution

Code and technical documentation use the repository's MIT license. Original
visual art, character designs, music, and sound use
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Third-party material, if introduced, retains its own compatible license and
must be added to this manifest before distribution.

Original-asset attribution: **Kartsick contributors, 2026**. Link to
<https://github.com/thatcube/kartsick> and the CC BY 4.0 license, and indicate
changes when distributing adaptations. This is a copyright license, not an
endorsement or a trademark clearance claim.

| Source | Status | Creation and provenance | License |
|---|---|---|---|
| `docs/concepts/cast-lineup-v2.svg` | Approved direction; concept art, not finished 3D assets | New, hand-authored vector paths created for this repository; reference characters are named as design influences but not pictured. No imported images, game assets, external fonts, or paid generation | CC BY 4.0 for the original artwork; no rights in third-party characters or marks are granted |
| Character, kart, world, and special-item designs in `docs/creative-proposal.md` | Approved creative direction | Original written concepts created from the approved brief; not derived from a prior implementation | CC BY 4.0 |
| `apps/web/src/render/kart.ts` | First driving-study models | Original procedural Clutch, Bramble, Boiler Bug, Picnic wheels, and Mapwing models, with rigging and material definitions. Recreated at runtime from editable source | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/world.ts` and `packages/content/src/index.ts` | Butterbell study environment | Original spline layout, terrain, barn, windmill, trees, signs, road texture, and scenic geometry. Textures are generated locally, without external images | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/audio.ts` | Study audio, not the complete soundtrack | Original note sequences, synthesized instruments, engine and interaction tones. Generated through Web Audio; no recordings, samples, cloned voices, or external services | Musical/sound designs and generated audio: CC BY 4.0; implementation code: MIT |

The SVG is its own editable source. Study models, textures, and sounds are
reproducible from their TypeScript source with `npm ci` and `npm run build`;
they do not require a paid asset tool or a manually maintained binary export.
The reusable construction helpers are in `apps/web/src/render/geometry.ts`.
The complete release still needs its broader art/audio production and compressed
asset export/loading pipeline.

No downloaded font files or third-party art have been added. The interface uses
the browser's locally available system fonts. Supporting software is listed in
[THIRD_PARTY.md](THIRD_PARTY.md); it retains its own licenses.

The second cast proposal replaces the first study. Its named reference anchors
are design commentary, not an affiliation, permission claim, or declaration that
recognizable derivative designs have been legally cleared. Noncommercial use
does not change the attribution or permission requirements.

Future assets must retain editable sources, reproducible export instructions,
creator/source information, applicable notices, and a clear source-to-runtime
mapping. Reference games are mechanical and aesthetic research only, never
sources of reusable models, music, textures, voices, track layouts, or branding.
