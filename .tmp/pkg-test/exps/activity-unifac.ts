// ! MoziThermoModels
import { calcActivityCoefficientUsingUnifacModel, loadUnifacDataFromJson } from "mozithermomodels";
// ! LOCALS
// NOTE: Unifac data
import groupParametersJson from "../../../externals/unifac/unifac-group-parameters.json";
import interactionMatrixJson from "../../../externals/unifac/unifac-interaction-matrix.json";

const components = [
    { name: "acetone", formula: "C3H6O", state: "l", mole_fraction: 0.047 },
    { name: "n_heptane", formula: "C7H16", state: "l", mole_fraction: 0.953 }
] as const;

const { groupData, interactionData } = loadUnifacDataFromJson(
    groupParametersJson as any,
    interactionMatrixJson as any
);

const [result, other, gEx] = calcActivityCoefficientUsingUnifacModel(
    [...components] as any,
    { value: 1, unit: "bar" },
    { value: 307, unit: "K" },
    groupData as any,
    interactionData as any,
    {
        "acetone-C3H6O": { CH3: 1, CH3CO: 1 },
        "n_heptane-C7H16": { CH3: 2, CH2: 3 }
    },
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
