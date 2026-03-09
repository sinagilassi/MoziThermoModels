// import libs
import { Component, Pressure, Temperature } from "mozithermodb-settings";
// ! MoziThermoModels
import {
  calcActivityCoefficientUsingUnifacModel,
  loadUnifacDataFromJson,
  UnifacComponentGroup,
  UnifacModelGroupData,
  UnifacModelInteractionData
} from "mozithermomodels";
// ! LOCALS
import { UNIFAC_GROUP_PARAMETERS_TS } from "../../../externals/unifac/unifac-group-parameters";
import { UNIFAC_INTERACTION_MATRIX_TS } from "../../../externals/unifac/unifac-interaction-matrix";

// NOTE: ternary mixture
const components: Component[] = [
  { name: "acetone", formula: "C3H6O", state: "l", mole_fraction: 0.2 },
  { name: "n_heptane", formula: "C7H16", state: "l", mole_fraction: 0.5 },
  { name: "n_hexane", formula: "C6H14", state: "l", mole_fraction: 0.3 }
];

// NOTE: load UNIFAC datasets (TS variable source)
const { groupData, interactionData } = loadUnifacDataFromJson(
  UNIFAC_GROUP_PARAMETERS_TS as any,
  UNIFAC_INTERACTION_MATRIX_TS as any
);

// NOTE: component subgroup contributions keyed by component id (Name-Formula)
const componentGroups: UnifacComponentGroup = {
  "acetone-C3H6O": { CH3: 1, CH3CO: 1 },
  "n_heptane-C7H16": { CH3: 2, CH2: 5 },
  "n_hexane-C6H14": { CH3: 2, CH2: 4 }
};

const temperature: Temperature = { value: 307, unit: "K" };
const pressure: Pressure = { value: 1, unit: "bar" };

const [result, other, gEx] = calcActivityCoefficientUsingUnifacModel(
  [...components] as any,
  pressure,
  temperature,
  groupData as UnifacModelGroupData,
  interactionData as UnifacModelInteractionData,
  componentGroups,
  "Name-Formula",
  "Name",
  "-",
  "|"
);

console.log("UNIFAC Ternary Activity Result:", result);
console.log("UNIFAC Ternary Details:", {
  ln_gamma_C: (other as any).ln_gamma_C,
  ln_gamma_R: (other as any).ln_gamma_R,
  activity_coefficients: result.value
});
console.log("UNIFAC Ternary Excess Gibbs (G^E/RT):", gEx.value);
