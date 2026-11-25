import { AugmentId, DevelopmentPath } from "@openfront/engine-api/game/GameTypes";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, type TemplateResult } from "lit";

const PATH_ICON_FILES: Record<DevelopmentPath, string> = {
  [DevelopmentPath.Military]: "images/crownfall/path-military.svg",
  [DevelopmentPath.Political]: "images/crownfall/path-political.svg",
  [DevelopmentPath.Scientific]: "images/crownfall/path-scientific.svg",
};

const AUGMENT_ICON_FILES: Record<AugmentId, string> = {
  [AugmentId.TotalMobilisation]: "images/crownfall/aug-total-mobilisation.svg",
  [AugmentId.IndustrialPowerhouse]:
    "images/crownfall/aug-industrial-powerhouse.svg",
  [AugmentId.PeoplesFirst]: "images/crownfall/aug-peoples-first.svg",
  [AugmentId.WarProfiteers]: "images/crownfall/aug-war-profiteers.svg",
  [AugmentId.FortressNation]: "images/crownfall/aug-fortress-nation.svg",
  [AugmentId.TechnologicalRace]: "images/crownfall/aug-technological-race.svg",
  [AugmentId.RapidExpansion]: "images/crownfall/aug-rapid-expansion.svg",
  [AugmentId.GoldenDiplomacy]: "images/crownfall/aug-golden-diplomacy.svg",
  [AugmentId.AerospaceCommand]: "images/crownfall/aug-aerospace-command.svg",
  [AugmentId.BlitzLogistics]: "images/crownfall/aug-blitz-logistics.svg",
  [AugmentId.CivicRenaissance]: "images/crownfall/aug-civic-renaissance.svg",
  [AugmentId.IronDiscipline]: "images/crownfall/aug-iron-discipline.svg",
};

export function renderPathEmblem(path: DevelopmentPath): TemplateResult {
  const src = assetUrl(PATH_ICON_FILES[path]);
  return html`
    <img
      src=${src}
      alt=${path}
      class="cf-emblem-svg"
      draggable="false"
    />
  `;
}

export function renderAugmentEmblem(id: AugmentId): TemplateResult {
  const src = assetUrl(AUGMENT_ICON_FILES[id]);
  return html`
    <img
      src=${src}
      alt=${id}
      class="cf-emblem-svg"
      draggable="false"
    />
  `;
}
