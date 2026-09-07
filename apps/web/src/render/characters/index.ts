import type { CharacterId } from "@kartsick/content";
import { Atelier } from "../geometry";
import { clutch, bramble } from "./road-crew";
import { pompa, bront } from "./court-disorder";
import { rivet, pipvolt } from "./live-wires";
import { bollo, hunkle } from "./mismatched-muscle";
import type { RiderModel } from "./rig";

const makers: Record<CharacterId, (art: Atelier) => RiderModel> = {
  clutch, bramble, pompa, bront, rivet, pipvolt, bollo, hunkle,
};

/** Original editable character sources, authored from the approved cast study. */
export function makeCharacter(art: Atelier, id: CharacterId): RiderModel {
  return makers[id](art);
}
