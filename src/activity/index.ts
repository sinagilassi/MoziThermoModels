export * from "./nrtl";
export * from "./uniquac";
export * from "./unifac1";
export * from "./unifac";
export * from "./activitycore";
export * from "./activity_methods";
export { generalExcessMolarGibbsFreeEnergy } from "./_shared";

import { calcTauIj as calcTauIjCompat } from "./main";

export {
  calcDgIjUsingNrtlModel,
  calcTauIjWithDgIjUsingNrtlModel,
  calcDUijUsingUniquacModel,
  calcTauIjWithDUijUsingUniquacModel,
  calcTauIjByCoefficients,
  calc_tau_ij_by_coefficients,
  calc_dg_ij_using_nrtl_model,
  calc_tau_ij_with_dg_ij_using_nrtl_model,
  calc_dU_ij_using_uniquac_model,
  calc_tau_ij_with_dU_ij_using_uniquac_model
} from "./main";

export { calcTauIjCompat as calcTauIj };
export const calc_tau_ij = calcTauIjCompat;
