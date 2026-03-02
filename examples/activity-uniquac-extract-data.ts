// ! MoziThermoModels
import { buildBinaryMixtureData, buildComponentData, calcActivityCoefficient } from "../src";
import type { RawThermoRecord } from "../src";

const components = [
    { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
    { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
];

function buildMatrixRows(
    prefix: string,
    aName: string,
    bName: string,
    values: [number, number, number, number]
) {
    const [v11, v12, v21, v22] = values;
    return [
        [
            { name: "Mixture", symbol: "-", value: `${aName}|${bName}`, unit: "N/A" },
            { name: "Name", symbol: "-", value: aName, unit: "N/A" },
            { name: "Formula", symbol: "-", value: aName === "ethanol" ? "C2H5OH" : "H2O", unit: "N/A" },
            { name: "State", symbol: "-", value: "l", unit: "N/A" },
            { name: `${prefix}_i_j_1`, symbol: `${prefix}_i_j_1`, value: v11, unit: "1" },
            { name: `${prefix}_i_j_2`, symbol: `${prefix}_i_j_2`, value: v12, unit: "1" }
        ],
        [
            { name: "Mixture", symbol: "-", value: `${aName}|${bName}`, unit: "N/A" },
            { name: "Name", symbol: "-", value: bName, unit: "N/A" },
            { name: "Formula", symbol: "-", value: bName === "ethanol" ? "C2H5OH" : "H2O", unit: "N/A" },
            { name: "State", symbol: "-", value: "l", unit: "N/A" },
            { name: `${prefix}_i_j_1`, symbol: `${prefix}_i_j_1`, value: v21, unit: "1" },
            { name: `${prefix}_i_j_2`, symbol: `${prefix}_i_j_2`, value: v22, unit: "1" }
        ]
    ];
}

// SECTION: dummy UNIQUAC data
const tauRows = buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]);
const tauData = buildBinaryMixtureData(components as any, tauRows as any) as Record<string, Record<string, unknown>>;

// SECTION: component-wise UNIQUAC vectors as raw component records
const ethanolData: RawThermoRecord[] = [
    { name: "Name", symbol: "Name", value: "ethanol", unit: "N/A" },
    { name: "Formula", symbol: "Formula", value: "C2H5OH", unit: "N/A" },
    { name: "State", symbol: "State", value: "l", unit: "N/A" },
    { name: "UNIQUAC r_i", symbol: "r_i", value: 2.1055, unit: "1" },
    { name: "UNIQUAC q_i", symbol: "q_i", value: 1.972, unit: "1" }
];

const waterData: RawThermoRecord[] = [
    { name: "Name", symbol: "Name", value: "water", unit: "N/A" },
    { name: "Formula", symbol: "Formula", value: "H2O", unit: "N/A" },
    { name: "State", symbol: "State", value: "l", unit: "N/A" },
    { name: "UNIQUAC r_i", symbol: "r_i", value: 0.92, unit: "1" },
    { name: "UNIQUAC q_i", symbol: "q_i", value: 1.4, unit: "1" }
];

const ethanolComponentData = buildComponentData(
    components[0] as any,
    ethanolData,
    ["Name-State"],
    true,
    "Name-State"
) as Record<string, Record<string, unknown>>;

const waterComponentData = buildComponentData(
    components[1] as any,
    waterData,
    ["Name-State"],
    true,
    "Name-State"
) as Record<string, Record<string, unknown>>;

const componentData = { ...ethanolComponentData, ...waterComponentData };

const dataSource: Record<string, Record<string, unknown>> = {};
for (const mixtureId of Object.keys(tauData)) {
    dataSource[mixtureId] = {
        tau: tauData[mixtureId].tau ?? tauData[mixtureId].tau_ij
    };
}
Object.assign(dataSource, componentData);

const modelSource = {
    dataSource,
    equationSource: {}
};

console.log("Data source:", dataSource);
console.log("ModelSource mixture keys:", Object.keys(modelSource.dataSource));
console.log("Sample node:", modelSource.dataSource["ethanol|water"] ?? modelSource.dataSource["water|ethanol"]);
console.log("Component data keys:", Object.keys(componentData));

// SECTION: tau/r_i/q_i extraction happens inside calcActivityCoefficient -> maybeExtractActivityParams(...)
const [result, other] = calcActivityCoefficient(
    components,
    { value: 1, unit: "bar" },
    { value: 298.15, unit: "K" },
    modelSource as any,
    "UNIQUAC",
    "Name-State",
    "Name",
    "-",
    "|"
);

console.log("Activity result:", result);
console.log("Extracted tau_ij_comp:", (other as any).tau_ij_comp);
console.log("Returned r_i_comp:", (other as any).r_i_comp);
console.log("Returned q_i_comp:", (other as any).q_i_comp);
