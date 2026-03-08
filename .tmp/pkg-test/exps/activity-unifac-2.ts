// import libs
import { Component, Temperature, Pressure } from "mozithermodb-settings";
// ! MoziThermoModels
import { calcActivityCoefficientUsingUnifacModel } from "mozithermomodels";
import { loadUnifacDataFromJson, UnifacModelGroupData, UnifacModelInteractionData, UnifacComponentGroup } from "mozithermomodels";
// ! LOCALS
// NOTE: Unifac data
import { UNIFAC_GROUP_PARAMETERS_TS } from "../../../externals/unifac/unifac-group-parameters";
import { UNIFAC_INTERACTION_MATRIX_TS } from "../../../externals/unifac/unifac-interaction-matrix";

// NOTE: Component
const components: Component[] = [
    { name: "acetone", formula: "C3H6O", state: "l", mole_fraction: 0.047 },
    { name: "n_heptane", formula: "C7H16", state: "l", mole_fraction: 0.953 }
];

// NOTE: Load UNIFAC data
const { groupData, interactionData } = loadUnifacDataFromJson(
    UNIFAC_GROUP_PARAMETERS_TS as any,
    UNIFAC_INTERACTION_MATRIX_TS as any
);

// NOTE: Component group data
const componentGroups: UnifacComponentGroup = {
    "acetone-C3H6O": { CH3: 1, CH3CO: 1 },
    "n_heptane-C7H16": { CH3: 2, CH2: 3 }
};

// NOTE: Calculate activity coefficients and excess Gibbs energy using UNIFAC model
// ! temperature
const temperature: Temperature = { value: 307, unit: "K" };
// ! pressure (not used in UNIFAC but included for completeness)
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

console.log("UNIFAC Activity Result:", result);
console.log("UNIFAC Details:", {
    ln_gamma_C: (other as any).ln_gamma_C,
    ln_gamma_R: (other as any).ln_gamma_R,
    activity_coefficients: result.value
});
console.log("UNIFAC Excess Gibbs (G^E/RT):", gEx.value);
