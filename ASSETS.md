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
| `apps/web/src/render/kart.ts`, `render/characters/`, and `render/parts/` | Reproportioned playable roster and modular kart models; finishing ongoing | Original procedural models for the eight approved characters, eight bodies, six wheel sets, four gliders, paints and decals, with reauthored seated anatomy, facial volumes, recessed cockpits, tire tread, hubs, suspension and canopy rigging. Geometry is recreated at runtime from editable source | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/items.ts` | Item and pickup visuals | Original models for standard items, triple variants and four signature specials; no imported meshes or textures | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/rescue.ts` | Towbell recovery actor | Original bell-shaped propeller tug, winch cable and four-point kart sling; procedural source, with no imported models or character assets | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/world.ts`, `render/butterbell-{art,farm,ground,materials}.ts` and `packages/content/src/index.ts` | Butterbell dairy-festival art-overhaul checkpoint | Original spline layout, banks, sculpted orchard crowns, gambrel farms, fitted foundations, silos, lattice windmill, hay bales and bell gantry. Six tileable material textures and one lettering atlas are generated locally; terrain clipping exposes the existing physical road. Original rolling countryside joins the ground outside playable bounds. No external images, game scenery or models | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/atmosphere.ts`, `render/surface-finishes.ts` and `render/contact-shadow.ts` | Shared original lighting and surface presentation | Procedural cloud-sky shader, six-face sky reflection, finish profiles and radial contact-shadow texture created for this project; no HDR environment downloads or imported sprites | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `packages/content-layouts/{afterglow,escaluna,tiltglass,copperwhistle,lastlight,terrain}.ts`, their matching `apps/web/src/render/worlds/` files, `worlds/tiltglass-copperwhistle-art.ts`, `worlds/terrain-art.ts`, and `render/course-surface.ts` | Playable original course worlds; presentation refinement ongoing | Newly authored airport, shopping galleria, giant arcade table, forest canopy, and continuous mountain descent, with procedural architecture, earth berms, terraces, ravines, ridges, mailplanes, illustrated arcade backglass, shared physical routes, animated hazards and crossing warnings. Forest-edge instances and their ground skirt are original generated scenery, not imported terrain or meshes. No imported game imagery or track layouts | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/render/feedback.ts` | Driving feedback | Original procedural tire-particle texture and bounded fading rubber marks; no imported sprites or effects | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/src/audio.ts` and `audio-engine.ts` | Six-course synthesized score and gameplay audio; listening refinement ongoing | Six distinct original eight-bar course arrangements, a paddock arrangement, sector-aware Lastlight harmony, synthesized melody/bass/chords/percussion, procedural combustion pulses with load/gearing response, and item/interaction sounds. Generated through Web Audio with bounded voices and bar-aligned transitions; no recordings, imported samples, cloned voices, or external services | Musical/sound designs and generated audio: CC BY 4.0; implementation code: MIT |
| `apps/web/src/ui/item-icons.tsx` | Original item icon set | Hand-authored SVG paths for standard items, variants, and four signature specials | Visual designs/generated art: CC BY 4.0; implementation code: MIT |
| `apps/web/public/fonts/AtkinsonHyperlegible-Regular.ttf` and `AtkinsonHyperlegible-Bold.ttf` | Bundled interface fonts | Unmodified Atkinson Hyperlegible, copyright 2020 Braille Institute of America; downloaded from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible). Verified Git blobs: regular `b3cc4200fcf09d600eac74002ab4ea65b404a536`; bold `ca3f613847de62b8da83d2dab500ec391c8fe477` | SIL Open Font License 1.1; exact notice in `apps/web/public/licenses/atkinson-hyperlegible.txt` |

The SVG is its own editable source. Study models, textures, and sounds are
reproducible from their TypeScript source with `npm ci` and `npm run build`;
they do not require a paid asset tool or a manually maintained binary export.
The reusable construction helpers are in `apps/web/src/render/geometry.ts`.
The complete release still needs its broader art/audio production and compressed
asset export/loading pipeline.

The bundled fonts retain their own license, rather than the game's art license.
There is no downloaded third-party game art. Supporting software is listed in
[THIRD_PARTY.md](THIRD_PARTY.md); it retains its own licenses.

The second cast proposal replaces the first study. Its named reference anchors
are design commentary, not an affiliation, permission claim, or declaration that
recognizable derivative designs have been legally cleared. Noncommercial use
does not change the attribution or permission requirements.

Future assets must retain editable sources, reproducible export instructions,
creator/source information, applicable notices, and a clear source-to-runtime
mapping. Reference games are mechanical and aesthetic research only, never
sources of reusable models, music, textures, voices, track layouts, or branding.
