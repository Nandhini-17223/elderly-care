/**
 * Approved ABI Parent Care email templates (G1–G5, H1–H5, M1–M9).
 * Split per audience for smaller Edge Function deploy bundles.
 */
export type { EmailContent } from "./templates-common.ts";
export {
  firstName,
  preferenceLabel,
  reasonPlain,
  ON_SCREEN,
  fillOnScreen,
} from "./templates-common.ts";
export {
  type G1Vars,
  type G2Vars,
  type G3Vars,
  type G4Vars,
  type G5Vars,
  templateG1,
  templateG2,
  templateG3,
  templateG4,
  templateG5,
} from "./templates-g.ts";
export {
  type H1Vars,
  type H2Vars,
  type H3Vars,
  type H4Vars,
  type H5Vars,
  templateH1,
  templateH2,
  templateH3,
  templateH4,
  templateH5,
} from "./templates-h.ts";
export {
  type M1Vars,
  type M2Item,
  type M2Vars,
  type M3Vars,
  type M4Vars,
  type M5Vars,
  type M6Vars,
  type M8Vars,
  type M9Vars,
  templateM1,
  templateM2,
  templateM3,
  templateM4,
  templateM5,
  templateM6,
  templateM7,
  templateM8,
  templateM9,
} from "./templates-m.ts";
