import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ItemId } from "@kartsick/content";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import { ItemArt, itemNode } from "./item-art";

const INK = "#30394f", CREAM = "#f5f2e8", MINT = "#5bd1c4", ORANGE = "#ff8051";
const GOLD = "#ffd46b", BRASS = "#cf9a4f", PLUM = "#694665", LILAC = "#b49acf", BLUE = "#3445a8";

function arc(x: number, y: number, z: number, rx: number, ry: number, start = 0, end = Math.PI * 2, steps = 24): Triple[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (end - start) * i / steps;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry, z];
  });
}

function badge(a: ItemArt, position: Triple, size: number, color = CREAM): void {
  a.block("pressed courier envelope", position, [size, size * .65, .018], color);
  const [x, y, z] = position;
  a.tube("envelope folded flap", [[x - size * .39, y + size * .23, z + .015], [x, y - size * .08, z + .018],
    [x + size * .39, y + size * .23, z + .015]], size * .045, INK);
}

function slip(a: ItemArt): void {
  a.puff("creased waxed skid cloth", [0, -.16, 0], [.84, .085, .67], GOLD, "fabric", .54);
  a.tube("cloth bound diagonal hem", [[-.34, -.117, -.24], [-.36, -.107, .19], [-.19, -.095, .28], [.31, -.12, .24]], .015, CREAM, "fabric");
  a.puff("turned-up patch corner", [.30, -.12, -.23], [.19, .11, .14], GOLD, "fabric", .7).rotation.z = -.28;
  a.profile("squeezed polishing wax sachet", [
    [-.14, .20, .17], [-.10, .27, .205], [-.03, .265, .20], [.06, .19, .145, -.015],
    [.13, .08, .06, -.045], [.16, .095, .055, -.035],
  ], ORANGE);
  a.block("folded sachet closure", [-.035, .165, 0], [.24, .047, .10], CREAM);
  for (const x of [-.095, -.035, .025]) a.block("wax pouch crimp impression", [x, .167, .053], [.012, .025, .01], BRASS);
  badge(a, [0, -.025, .201], .18);
}

function bounce(a: ItemArt): void {
  const reel = a.profile("turned rubber ricochet reel", [
    [-.29, .19, .19], [-.27, .265, .265], [-.22, .29, .29], [-.16, .255, .255],
    [-.13, .225, .225], [.13, .225, .225], [.16, .255, .255], [.22, .29, .29], [.27, .265, .265], [.29, .19, .19],
  ], MINT, "rubber");
  reel.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    a.ring("ivory reel impact lip", [0, 0, side * .238], .52, .042, CREAM).rotation.x = Math.PI / 2;
    a.puff("recessed reel hub", [0, 0, side * .286], [.29, .29, .035], INK, "rubber", 1, 16, 8);
    a.puff("enamel axle cap", [0, 0, side * .308], [.135, .135, .03], GOLD, "paint", 1, 16, 8);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const lug = a.block("three-way reel spoke", [Math.sin(angle) * .178, Math.cos(angle) * .178, side * .28], [.068, .126, .025], CREAM);
      lug.rotation.z = -angle;
    }
  }
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    const grip = a.block("reel waist traction rib", [Math.cos(angle) * .225, Math.sin(angle) * .225, 0], [.052, .034, .28], INK, "rubber");
    grip.rotation.z = angle - Math.PI / 2;
  }
}

function homing(a: ItemArt): void {
  const body = a.profile("flared chaser chime fuselage", [
    [-.31, .145, .145], [-.285, .18, .18], [-.24, .17, .17], [-.16, .115, .115],
    [-.02, .13, .13], [.09, .125, .125], [.24, .065, .065], [.40, .006, .006],
  ], ORANGE);
  body.rotation.x = Math.PI / 2;
  a.ring("chime rolled brass mouth", [0, 0, -.285], .34, .031, BRASS, "metal").rotation.x = Math.PI / 2;
  a.puff("dark chime throat", [0, 0, -.314], [.23, .23, .017], PLUM, "paint", 1, 16, 8);
  a.puff("chime suspended clapper", [0, -.018, -.337], [.078, .078, .06], GOLD, "metal", 1, 12, 6);
  for (const side of [-1, 1]) {
    const fin = a.puff("swept enamel chaser fin", [side * .235, .03, -.23], [.29, .056, .27], CREAM, "paint", .73, 16, 8);
    fin.rotation.y = side * .54;
    a.block("tail brass mounting cleat", [side * .12, .04, -.17], [.055, .057, .14], BRASS, "metal").rotation.y = side * .35;
  }
  a.ring("compass tracking gimbal", [0, .042, -.025], .45, .029, GOLD, "metal").rotation.x = .42;
  a.puff("mint compass lens", [0, .131, .058], [.12, .062, .13], MINT, "paint", 1, 16, 8);
  a.block("forward compass needle", [0, .167, .081], [.026, .018, .11], CREAM).rotation.y = -.22;
}

function boost(a: ItemArt, rapid: boolean): void {
  const color = rapid ? ORANGE : MINT;
  a.profile(rapid ? "ribbed zip flask pressure vessel" : "rounded zip can shoulder", [
    [-.34, .105, .09], [-.31, .18, .15], [-.25, .20, .17], [.08, .20, .17],
    [.17, .18, .15], [.225, .11, .09], [.26, .085, .075],
  ], color);
  a.ring("can rubber standing foot", [0, -.294, 0], .33, .055, INK, "rubber");
  a.ring("rolled ivory shoulder seam", [0, .182, 0], .305, .035, CREAM);
  if (rapid) {
    for (let i = 0; i < 5; i++) {
      const ring = a.ring("separate flask compression fold", [0, -.215 + i * .07, 0], .397, .032, INK, "rubber", 24);
      ring.scaling.z = .84;
    }
    a.tube("flask squeeze lever", [[-.15, .21, -.01], [-.15, .34, -.03], [0, .355, -.06], [.14, .31, -.02]], .027, CREAM);
  } else {
    a.block("cream embossed can label", [0, -.035, .171], [.225, .245, .024], CREAM, "paint", .28);
    a.block("label lower zip stroke", [-.017, -.053, .191], [.025, .113, .015], ORANGE).rotation.z = -.71;
    a.block("label horizontal zip stroke", [-.009, -.013, .191], [.087, .025, .015], ORANGE);
    a.block("label upper zip stroke", [-.003, .028, .191], [.025, .116, .015], ORANGE).rotation.z = -.8;
  }
  a.profile("fluted nozzle collar", [[.23, .087, .075], [.28, .087, .075], [.29, .064, .06]], INK, "rubber", 16);
  a.tube("curved delivery nozzle", [[0, .27, 0], [0, .34, .012], [0, .373, .055], [0, .37, .15]], [.055, .054, .047, .043], CREAM);
  a.puff("nozzle recessed opening", [0, .37, .173], [.061, .061, .013], INK, "rubber", 1, 12, 6);
  if (rapid) for (const y of [-.045, .052]) a.tube("double flask thrust mark", [[-.062, y, .19], [0, y + .05, .197], [.062, y, .19]], .015, GOLD);
}

function leader(a: ItemArt): void {
  a.block("first-class armored enamel parcel", [0, -.015, 0], [.46, .49, .46], BLUE, "paint", .35, .2);
  a.block("parcel raised lid", [0, .203, 0], [.475, .085, .475], CREAM, "paint", .28, .17);
  for (const side of [-1, 1]) a.block("parcel brass binding", [side * .155, -.025, .239], [.039, .38, .025], BRASS, "metal");
  badge(a, [0, .018, .239], .22, GOLD);
  for (let i = 0; i < 3; i++) {
    const angle = i / 3 * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
    a.tube("splayed tracking landing vane", [[x * .16, .09, z * .16], [x * .30, .012, z * .30],
      [x * .335, -.13, z * .335], [x * .29, -.30, z * .29]], [.045, .052, .039, .012], CREAM);
  }
  a.ring("first-class brass signal halo", [0, .323, 0], .52, .035, GOLD, "metal");
  a.glow(a.puff("warm priority lamp", [0, .272, 0], [.14, .18, .14], ORANGE, "paint", .82, 16, 8), ORANGE);
}

function bomb(a: ItemArt): void {
  a.profile("cast ceramic popclock bell", [[-.30, .15, .15], [-.28, .23, .23], [-.22, .285, .265],
    [-.08, .29, .27], [.08, .25, .23], [.19, .175, .15], [.23, .10, .09]], ORANGE);
  a.ring("bomb rolled dark base", [0, -.24, 0], .535, .045, INK);
  a.ring("clock polished bezel", [0, -.015, .266], .31, .031, BRASS, "metal").rotation.x = Math.PI / 2;
  a.puff("domed ivory timer dial", [0, -.015, .269], [.277, .277, .035], CREAM, "paint", 1, 20, 8);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    a.block("timer quarter-hour index", [Math.sin(angle) * .098, -.015 + Math.cos(angle) * .098, .291], [.013, .035, .011], INK).rotation.z = -angle;
  }
  a.tube("popclock legible clock hands", [[-.045, -.055, .30], [0, -.015, .304], [.014, .067, .30]], .012, INK);
  a.puff("timer brass pivot", [0, -.015, .307], [.035, .035, .014], BRASS, "metal", 1, 12, 6);
  a.block("fuse ferrule", [0, .247, 0], [.15, .074, .14], BRASS, "metal");
  a.tube("bent woven clock fuse", [[0, .26, 0], [.014, .33, 0], [.066, .377, 0], [.12, .38, .01]], .024, INK);
  a.glow(a.puff("warm burning fuse tip", [.137, .381, .012], [.082, .082, .082], GOLD, "paint", 1, 12, 6), GOLD);
}

function rosette(a: ItemArt): void {
  for (const side of [-1, 1]) {
    const ribbon = a.puff("parade folded ribbon tail", [side * .125, -.27, -.035], [.145, .30, .063], side < 0 ? MINT : ORANGE, "fabric", .7, 16, 8);
    ribbon.rotation.z = side * .28;
  }
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const petal = a.puff("scalloped porcelain parade petal", [Math.sin(angle) * .20, Math.cos(angle) * .20, 0], [.145, .275, .115], i % 2 ? CREAM : GOLD, "paint", .85, 16, 8);
    petal.rotation.z = -angle;
  }
  a.ring("brass parade medallion rim", [0, 0, .072], .34, .036, BRASS, "metal").rotation.x = Math.PI / 2;
  a.puff("mint parade medallion", [0, 0, .081], [.32, .32, .083], MINT, "paint", 1, 20, 8);
  a.block("porcelain parade gleam", [0, 0, .13], [.12, .12, .025], CREAM, "paint", .15).rotation.z = Math.PI / 4;
}

function shrink(a: ItemArt): void {
  a.tube("forged pocket-weather caliper", [[-.24, .22, .07], [-.30, .28, 0], [-.32, .19, 0], [-.32, -.16, 0],
    [-.26, -.24, 0], [.26, -.24, 0], [.32, -.16, 0], [.32, .19, 0], [.30, .28, 0], [.24, .22, .07]], .047, LILAC, "metal", 10);
  a.block("caliper brass measuring slide", [0, -.236, .025], [.25, .11, .12], BRASS, "metal");
  for (let i = -2; i <= 2; i++) a.block("caliper engraved scale", [i * .053, -.215, .089], [.012, i === 0 ? .037 : .02, .007], INK);
  for (const side of [-1, 1]) {
    a.tube("bold inward measuring arrow", [[side * .22, -.07, .10], [side * .12, 0, .10], [side * .22, .07, .10]], .025, GOLD);
    a.block("soft caliper jaw", [side * .248, .217, .075], [.091, .071, .095], CREAM);
  }
  a.block("measured miniature delivery parcel", [0, -.018, .005], [.105, .13, .11], MINT, "paint", .24, .16);
  a.puff("small pocket-weather cloud", [0, .155, -.005], [.27, .10, .08], CREAM, "paint", .75, 16, 8);
}

function bird(a: ItemArt): void {
  a.puff("streamlined wind-up escort body", [0, .015, 0], [.29, .29, .60], ORANGE, "paint", .95, 24, 12);
  a.puff("enamel escort breastplate", [0, -.014, .179], [.22, .185, .18], BLUE);
  a.tube("tapered brass escort beak", [[0, .065, .235], [0, .065, .32], [0, .045, .43]], [.077, .052, .005], GOLD, "metal", 12);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const feather = a.puff("layered swept escort wing", [side * (.235 + i * .045), .017 - i * .025, -.03 - i * .06], [.27, .045, .16], i === 0 ? CREAM : GOLD, "paint", .8, 16, 8);
      feather.rotation.y = side * .5;
    }
    a.puff("separate navigation eye", [side * .127, .084, .163], [.048, .066, .074], INK, "paint", 1, 12, 6);
    a.puff("navigation eye glint", [side * .143, .101, .183], [.014, .018, .02], CREAM, "paint", 1, 8, 6);
  }
  a.block("wind-up key stem", [0, .193, -.13], [.043, .16, .045], BRASS, "metal");
  for (const side of [-1, 1]) a.ring("double-lobed wind-up key", [side * .062, .264, -.13], .116, .026, BRASS, "metal", 24).rotation.x = Math.PI / 2;
}

function vision(a: ItemArt): void {
  a.puff("curved confetti visor rubber frame", [0, 0, 0], [.75, .34, .16], PLUM, "rubber", .6, 24, 10);
  a.puff("thick lavender visor surround", [0, .004, .041], [.704, .299, .12], LILAC, "paint", .63, 24, 10);
  a.puff("opaque pearlescent curved forecast lens", [0, .004, .091], [.604, .225, .063], "#d1e5d7", "paint", .63, 24, 10);
  for (let i = 0; i < 5; i++) {
    const confetti = a.block("raised confetti lens marks", [-.22 + i * .108, i % 2 ? .035 : -.026, .125], [.065, .038, .009], [MINT, ORANGE, CREAM, PLUM, GOLD][i]);
    confetti.rotation.z = (i % 2 ? 1 : -1) * .45;
  }
  a.tube("visible elastic visor strap", [[-.35, 0, 0], [-.33, 0, -.14], [-.25, 0, -.26], [.25, 0, -.26], [.33, 0, -.14], [.35, 0, 0]], .024, INK, "rubber");
  for (const side of [-1, 1]) a.block("visor hinge", [side * .341, 0, .035], [.051, .12, .042], GOLD);
}

function thief(a: ItemArt): void {
  a.profile("draped borrowing-bell handkerchief", [[-.25, .265, .165], [-.20, .255, .165], [-.13, .185, .145, -.025],
    [.02, .23, .19], [.16, .18, .155], [.27, .095, .09], [.31, .025, .025]], "#d6e5e9", "fabric");
  for (const side of [-1, 1]) {
    a.tube("reaching handkerchief corner", [[side * .18, -.07, 0], [side * .27, -.065, .025], [side * .35, -.003, .08], [side * .31, .055, .17]], [.061, .054, .035, .009], "#d6e5e9", "fabric");
    a.puff("stitched borrowing eye", [side * .068, .117, .176], [.054, .042, .022], INK, "fabric", .64, 12, 6);
    a.tube("embroidered bell hem", [[side * .025, -.245, .168], [side * .13, -.214, .17], [side * .24, -.25, .12]], .012, PLUM, "fabric");
  }
  a.tube("crooked borrowed smile", [[-.034, .022, .198], [.008, .006, .199], [.052, .03, .192]], .01, PLUM, "fabric");
  a.ring("stolen brass keyring", [.286, .067, .22], .18, .023, GOLD, "metal", 24).rotation.x = Math.PI / 2;
  a.block("stolen key tooth", [.27, -.065, .22], [.035, .11, .03], BRASS, "metal").rotation.z = -.23;
}

function fire(a: ItemArt): void {
  for (let i = -1; i <= 1; i++) {
    a.tube("curled ember choir tongue", [[i * .12, -.22, -.015], [i * .15, -.08, 0], [i * .16, .04, -.005],
      [i * .12 + .07, .17 + (i === 0 ? .13 : 0), -.01], [i * .12 + .025, .30 + (i === 0 ? .12 : 0), -.04]],
    [.083, .112, .093, .047, .004], i === 0 ? GOLD : ORANGE, "paint", 12);
  }
  a.glow(a.puff("bright porcelain ember core", [0, -.065, .097], [.18, .25, .075], CREAM, "paint", 1, 16, 8), CREAM);
}

function returning(a: ItemArt): void {
  const bend: Triple[] = [[-.335, .075, .225], [-.30, .038, -.012], [-.23, 0, -.18], [-.12, -.01, -.27], [0, -.01, -.295],
    [.12, -.01, -.27], [.23, 0, -.18], [.30, .038, -.012], [.335, .075, .225]];
  a.tube("cast brass return-ticket fork", bend, [.036, .061, .073, .074, .075, .074, .073, .061, .036], BRASS, "metal", 12);
  for (const side of [-1, 1]) {
    a.puff("mint fork soft return tip", [side * .335, .075, .20], [.134, .125, .22], MINT, "rubber", .68, 16, 8);
    a.block("fork tip porcelain ticket band", [side * .335, .129, .185], [.115, .017, .073], CREAM);
  }
  a.block("inlaid return ticket", [0, .065, -.262], [.14, .025, .096], CREAM);
  a.tube("return ticket arrow", [[-.035, .083, -.27], [0, .084, -.238], [.035, .083, -.27]], .009, INK);
}

function shockwave(a: ItemArt): void {
  for (let i = 0; i < 3; i++) a.ring("concentric defensive tuning ring", [0, i * .052 - .06, 0], .31 + i * .24, .033, i % 2 ? MINT : CREAM, "paint", 32);
  a.profile("spun blue defensive service bell", [[-.14, .12, .12], [-.12, .155, .155], [-.075, .16, .16], [-.025, .145, .145],
    [.045, .10, .10], [.08, .06, .06]], BLUE);
  a.ring("service bell brass lip", [0, -.10, 0], .30, .028, BRASS, "metal");
  a.puff("bell raised striker", [0, .112, 0], [.12, .065, .12], GOLD, "metal", 1, 16, 8);
  a.glow(a.puff("small bell pulse indicator", [0, .156, 0], [.071, .043, .071], CREAM, "paint", 1, 12, 6), CREAM);
}

function barrier(a: ItemArt): void {
  a.block("rolled roadwork board edge", [0, .075, 0], [.87, .32, .16], INK, "rubber", .22, .17);
  for (const side of [-1, 1]) {
    a.block("enamel construction board face", [0, .075, side * .08], [.825, .274, .022], GOLD);
    for (let i = -2; i <= 2; i++) a.block("bold diagonal construction warning stripe", [i * .147, .075, side * .096], [.075, .241, .013], INK).rotation.z = -.32;
    for (const x of [-.374, .374]) a.puff("board domed mounting bolt", [x, .075, side * .106], [.035, .035, .017], CREAM, "metal", 1, 8, 6);
  }
  for (const side of [-1, 1]) {
    a.tube("folding metal A-frame strut", [[side * .30, -.265, -.19], [side * .30, .09, -.027], [side * .30, .12, 0], [side * .30, .09, .027], [side * .30, -.265, .19]], .028, "#91a7a8", "metal");
    a.tube("folding brace crossbar", [[side * .30, -.18, -.13], [side * .30, -.18, .13]], .015, BRASS, "metal");
    for (const z of [-.17, .17]) {
      a.puff("tiny roadwork rubber roller", [side * .325, -.263, z], [.082, .17, .17], INK, "rubber", 1, 16, 8);
      a.puff("roller bright axle", [side * .37, -.263, z], [.02, .075, .075], BRASS, "metal", 1, 12, 6);
    }
  }
  a.block("beacon protected plinth", [0, .255, 0], [.165, .06, .13], INK, "rubber");
  a.glow(a.puff("domed amber roadwork beacon", [0, .319, 0], [.115, .113, .10], ORANGE, "paint", .9, 16, 8), ORANGE);
}

function cushion(a: ItemArt): void {
  a.puff("plum upholstered cushion back", [0, 0, -.023], [.665, .525, .37], PLUM, "fabric", .63, 24, 12);
  a.puff("tailored velvet rebound face", [0, 0, .028], [.69, .55, .38], LILAC, "fabric", .62, 24, 12);
  for (const side of [-1, 1]) {
    const hem = arc(0, 0, side * .125, .315, .244, 0, Math.PI * 2, 32);
    a.tube("ivory cushion bound piping", hem, .013, CREAM, "fabric");
    for (const top of [-1, 1]) a.tube("deep cushion tailored tuck", [[side * .19, top * .14, .18], [side * .107, top * .079, .206], [side * .041, top * .03, .211]], [.007, .012, .014], PLUM, "fabric");
    a.tube("bold rear return chevron", [[side * .07, -.095, -.203], [side * .18, 0, -.204], [side * .07, .095, -.203]], .02, CREAM, "fabric");
  }
  a.puff("tufted cushion button recess", [0, 0, .218], [.105, .105, .022], PLUM, "fabric", 1, 16, 8);
  a.puff("custard cloth-covered tuft button", [0, 0, .231], [.065, .065, .022], GOLD, "paint", 1, 16, 8);
  for (const side of [-1, 1]) a.block("button stitch", [side * .013, 0, .245], [.008, .025, .006], CREAM);
}

function staticSling(a: ItemArt): void {
  a.block("static sling rubber cradle", [0, -.167, -.035], [.66, .14, .61], INK, "rubber", .26, .16);
  for (const side of [-1, 1]) a.block("coil saddle mounting rail", [side * .213, -.073, -.015], [.09, .12, .54], BRASS, "metal");
  const coil: Triple[] = [];
  for (let i = 0; i <= 72; i++) {
    const angle = i / 72 * Math.PI * 8;
    coil.push([Math.cos(angle) * .181, Math.sin(angle) * .181, -.28 + i / 72 * .54]);
  }
  a.tube("four-turn insulated forward thrust coil", coil, .027, MINT);
  a.ring("ceramic forward field rim", [0, 0, .30], .46, .05, CREAM).rotation.x = Math.PI / 2;
  for (const start of [0, Math.PI]) a.tube("striped field outline", arc(0, 0, .328, .23, .23, start, start + .55, 5), .025, INK);
  for (const side of [-1, 1]) {
    a.block("countable charge-cell ceramic casing", [side * .235, .138, -.17], [.147, .255, .23], CREAM);
    a.glow(a.block("separately countable amber charge segment", [side * .235, .139, -.045], [.095, .17, .022], GOLD), GOLD);
    a.block("charge-cell brass contact", [side * .235, .278, -.17], [.085, .023, .13], BRASS, "metal");
  }
}

function inflatable(a: ItemArt): void {
  a.puff("inflatable kart pontoon shell", [0, -.17, 0], [.82, .29, .86], "#b4dbe7", "paint", .65, 24, 12);
  a.puff("dark inset inflatable cockpit", [0, -.036, -.035], [.48, .042, .57], PLUM, "rubber", .64, 20, 8);
  a.puff("front balloon rider body", [0, .045, .126], [.30, .36, .23], "#e7d59d", "paint", .83, 20, 10);
  a.puff("front balloon rider head", [0, .213, .137], [.31, .25, .235], "#e7d59d", "paint", .84, 20, 10);
  a.puff("lopsided rear balloon rider", [0, .08, -.235], [.32, .49, .24], "#d9b9d9", "paint", .74, 20, 10).rotation.z = .18;
  for (const side of [-1, 1]) {
    a.tube("heat-sealed balloon shoulder", [[side * .07, .08, .135], [side * .155, .018, .19], [side * .15, -.025, .23]], .037, "#e7d59d");
    a.puff("printed decoy eye", [side * .057, .23, .249], [.033, .024, .012], INK, "paint", 1, 12, 6);
    for (const z of [-.25, .26]) {
      a.puff("printed rubber balloon wheel", [side * .367, -.24, z], [.15, .25, .25], PLUM, "rubber", .8, 16, 8);
      a.puff("wheel painted circular hub", [side * .444, -.24, z], [.011, .102, .102], CREAM, "paint", 1, 12, 6);
    }
    for (let i = 0; i < 3; i++) a.block("printed mint inflatable flank stripe", [side * .402, -.155, -.19 + i * .17], [.018, .13, .053], MINT).rotation.x = -.25;
  }
  for (let i = 0; i < 3; i++) a.block("conspicuous striped decoy back", [-.015, -.02 + i * .079, -.359], [.23, .038, .024], PLUM);
  a.tube("oversized unmistakable inflation valve", [[.272, -.045, -.14], [.33, .013, -.14], [.368, .069, -.14]], [.066, .06, .052], ORANGE, "rubber", 12);
  a.puff("inflation valve captive plug", [.381, .093, -.14], [.15, .063, .14], INK, "rubber", .65, 16, 8).rotation.z = -.55;
  const seam = arc(0, 0, 0, .378, .385, 0, Math.PI * 2, 32).map(([x, y]) => [x, -.057, y] as Triple);
  a.tube("inflatable continuous heat-sealed seam", seam, .012, CREAM);
}

function shape(a: ItemArt, id: ItemId): void {
  switch (id) {
    case "slip": slip(a); break;
    case "bounce": bounce(a); break;
    case "homing": homing(a); break;
    case "leader": leader(a); break;
    case "bomb": bomb(a); break;
    case "boost": boost(a, false); break;
    case "rapid-boost": boost(a, true); break;
    case "triple-slip": case "triple-bounce": case "triple-homing": case "triple-boost": {
      const single = id.slice(7) as "slip" | "bounce" | "homing" | "boost";
      for (let i = 0; i < 3; i++) {
        const angle = i / 3 * Math.PI * 2;
        const part = itemNode(a.art, `countable ${single} ${i + 1}`, a.root, [Math.cos(angle) * .28, i === 0 ? .12 : -.07, Math.sin(angle) * .28]);
        part.metadata = { kind: "item-charge", itemId: single, charge: i + 1 };
        part.scaling.setAll(.57);
        shape(new ItemArt(a.art, part), single);
      }
      break;
    }
    case "invincible": rosette(a); break;
    case "shrink": shrink(a); break;
    case "autopilot": bird(a); break;
    case "vision": vision(a); break;
    case "theft": thief(a); break;
    case "fire": fire(a); break;
    case "returning": returning(a); break;
    case "shockwave": shockwave(a); break;
    case "roadwork": barrier(a); break;
    case "velvet": cushion(a); break;
    case "static": staticSling(a); break;
    case "doubles": inflatable(a); break;
  }
}

/**
 * Original, unanimated 0.5–1 m item/effect source. Origin is the effect center, +Z forward.
 * Roadwork/velvet/doubles each represent ONE authoritative barrier/bumper/decoy.
 * Triple IDs show three charges. Dispose recursively without shared Atelier materials.
 */
export function makeItemVisual(art: Atelier, id: ItemId): TransformNode {
  const root = itemNode(art, `item:${id}`);
  root.metadata = { kind: "item", itemId: id };
  shape(new ItemArt(art, root), id);
  art.batchModel(root, new Set(), true);
  return root;
}

/**
 * Original delivery-reel case, approximately 1.72 × 1.54 × 1.41 m (W/H/D).
 * Both faces have recessed reels and a raised courier stamp; no transparent layers.
 * Bob/spin/pop/respawn stay on the root. `pickup:lamps` owns the one emissive batch;
 * `pickup:burst` and `pickup:handle` remain geometry-free attachment anchors.
 * Dispose recursively without disposing the shared Atelier materials.
 */
export function makePickupBox(art: Atelier): TransformNode {
  const root = itemNode(art, "Belltumble item parcel"), a = new ItemArt(art, root);
  root.metadata = { kind: "pickup", visual: "delivery-reel", forward: "+Z", stampFaces: 2, reelWindows: 3 };
  const lamps = itemNode(art, "pickup:lamps", root), light = new ItemArt(art, lamps);
  lamps.metadata = { kind: "pickup-highlight", animation: "mesh-visibility" };
  itemNode(art, "pickup:burst", root).metadata = { kind: "pickup-attachment" };
  itemNode(art, "pickup:handle", root, [0, .83, 0]).metadata = { kind: "pickup-attachment" };
  const enamel = "#287f83", lid = "#42a9a5", shadow = "#204b56", edge = "#f2cc83", paper = "#fff0cf";

  a.block("deep rolled lagoon enamel shell", [0, -.017, 0], [1.62, 1.13, 1.08], enamel, "paint", .25, .16);
  a.block("recessed dark lid gasket", [0, .414, 0], [1.595, .045, 1.075], shadow, "paint", .3);
  a.block("raised domed lagoon lid", [0, .50, 0], [1.59, .17, 1.06], lid, "paint", .4, .2);
  for (const side of [-1, 1]) {
    a.block("broad brass lid binding", [side * .49, .589, 0], [.12, .037, .99], BRASS, "paint", .2);
    a.block("brass bottom skid", [side * .49, -.585, 0], [.16, .041, .93], BRASS);
    for (const end of [-1, 1]) for (const top of [-1, 1]) {
      a.block("cast rounded parcel corner protector", [side * .71, top * .48, end * .49], [.27, .24, .24], BRASS, "paint", .38, .19);
      a.puff("corner protector domed rivet", [side * .72, top * .48, end * .616], [.052, .052, .022], edge, "paint", 1, 12, 6);
    }
    a.puff("reel side spindle cast boss", [side * .818, 0, 0], [.076, .38, .38], BRASS, "paint", .88, 20, 8);
    a.puff("reel spindle inset enamel well", [side * .854, 0, 0], [.012, .25, .25], shadow, "paint", 1, 16, 8);
    a.block("porcelain spindle winding key", [side * .854, 0, 0], [.012, .157, .055], paper);
    a.block("handle brass mounting foot", [side * .265, .607, 0], [.195, .078, .21], BRASS);
  }

  for (const end of [-1, 1]) {
    const z = (value: number) => end * value;
    a.block("deep shadowed three-reel cavity", [0, -.014, z(.553)], [1.30, .86, .035], shadow, "paint", .17);
    // Rails stand ahead of the bed; curved reel tickets remain behind the lip.
    for (const side of [-1, 1]) {
      a.block("rounded vertical brass window rail", [side * .662, .018, z(.606)], [.108, .858, .135], BRASS, "paint", .36, .18);
      a.block("window rail narrow reflected edge", [side * .671, .027, z(.679)], [.025, .61, .012], edge);
    }
    for (const side of [-1, 1]) a.block("cast horizontal brass window rail", [0, side * .40 + .018, z(.606)], [1.30, .107, .135], BRASS, "paint", .3, .18);
    for (const column of [-1, 0, 1]) {
      const x = column * .437, width = column === 0 ? .46 : .27;
      a.puff("curved porcelain delivery reel", [x, .061, z(.594)], [width, .605, .142], paper, "paint", .63, 20, 10);
      for (const y of [-.177, .299]) a.block("ticket stamped edge rule", [x, y, z(.650)], [width * .66, .021, .01], BRASS);
      if (column !== 0) {
        a.block("bold inset reel pip", [x, .06, z(.669)], [.116, .116, .016], enamel, "paint", .25).rotation.z = Math.PI / 4;
        a.block("reel paper perforation", [x, -.095, z(.661)], [.055, .017, .008], BRASS);
      }
      a.puff("amber indicator socket", [column * .31, -.329, z(.633)], [.163, .093, .029], BRASS, "paint", .64, 12, 6);
      light.glow(light.puff("small warm delivery-ready lamp", [column * .31, -.329, z(.651)], [.098, .042, .013], "#ffd793", "paint", 1, 12, 6), "#ffd793");
    }
    a.block("raised courier stamp dark undercut", [0, .074, z(.659)], [.378, .284, .027], shadow);
    a.block("embossed enamel envelope stamp", [0, .085, z(.680)], [.341, .236, .023], enamel);
    a.tube("bold folded envelope flap", [[-.139, .168, z(.695)], [0, .061, z(.695)], [.139, .168, z(.695)]], .01, paper);
    a.puff("copper courier wax seal", [0, -.090, z(.674)], [.112, .108, .028], ORANGE, "paint", .84, 16, 8);
    a.block("wax seal stamped dash", [0, -.09, z(.692)], [.047, .015, .008], paper);
    a.block("lid front clasp dark inset", [0, .493, z(.535)], [.20, .107, .027], shadow);
    a.block("working brass lid catch", [0, .476, z(.558)], [.131, .148, .036], BRASS);
    a.block("lid catch keyhole", [0, .458, z(.580)], [.031, .048, .009], shadow);
    for (const side of [-1, 1]) a.block("raised rear lid hinge", [side * .45, .448, z(.549)], [.16, .101, .029], BRASS);
  }
  a.tube("arched brass courier handle", [[-.265, .61, 0], [-.265, .763, 0], [-.237, .833, 0], [-.185, .879, 0],
    [0, .886, 0], [.185, .879, 0], [.237, .833, 0], [.265, .763, 0], [.265, .61, 0]], .043, BRASS, "paint", 10);
  a.block("stitched dark handle grip", [0, .885, 0], [.35, .10, .12], shadow, "paint", .36, .18);
  for (const side of [-1, 1]) a.block("handle grip ivory saddle stitch", [0, .902, side * .063], [.22, .01, .008], paper);
  art.batchModel(root, new Set(), true);
  return root;
}
