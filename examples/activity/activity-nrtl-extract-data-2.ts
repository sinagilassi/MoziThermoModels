// ! MoziThermoModels
import { buildBinaryMixtureData, calcActivityCoefficient } from "../../src";

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

// SECTION: dummy NRTL matrix data (coefficient form)
// tau_ij = a_ij + b_ij/T + c_ij*ln(T) + d_ij*T
// Here b=c=d=0, so tau_ij = a_ij
const aRows = buildMatrixRows("a", "ethanol", "water", [0, 1.2, 0.8, 0]);
const bRows = buildMatrixRows("b", "ethanol", "water", [0, 0, 0, 0]);
const cRows = buildMatrixRows("c", "ethanol", "water", [0, 0, 0, 0]);
const dRows = buildMatrixRows("d", "ethanol", "water", [0, 0, 0, 0]);
const alphaRows = buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]);

const aData = buildBinaryMixtureData(components as any, aRows as any) as Record<string, Record<string, unknown>>;
const bData = buildBinaryMixtureData(components as any, bRows as any) as Record<string, Record<string, unknown>>;
const cData = buildBinaryMixtureData(components as any, cRows as any) as Record<string, Record<string, unknown>>;
const dData = buildBinaryMixtureData(components as any, dRows as any) as Record<string, Record<string, unknown>>;
const alphaData = buildBinaryMixtureData(components as any, alphaRows as any) as Record<string, Record<string, unknown>>;

// SECTION: merge into one modelSource (mixture node contains coefficient + alpha MoziMatrixData)
const dataSource: Record<string, Record<string, unknown>> = {};
for (const mixtureId of Object.keys(aData)) {
    dataSource[mixtureId] = {
        a: aData[mixtureId].a ?? aData[mixtureId].a_ij,
        b: bData[mixtureId].b ?? bData[mixtureId].b_ij,
        c: cData[mixtureId].c ?? cData[mixtureId].c_ij,
        d: dData[mixtureId].d ?? dData[mixtureId].d_ij,
        alpha: alphaData[mixtureId].alpha ?? alphaData[mixtureId].alpha_ij
    };
}

const modelSource = {
    dataSource,
    equationSource: {}
};

console.log("ModelSource mixture keys:", Object.keys(modelSource.dataSource));
console.log("Sample node:", modelSource.dataSource["ethanol|water"] ?? modelSource.dataSource["water|ethanol"]);

// SECTION: extraction happens inside calcActivityCoefficient -> maybeExtractActivityParams(...)
const [result, other] = calcActivityCoefficient(
    components,
    { value: 1, unit: "bar" },
    { value: 298.15, unit: "K" },
    modelSource as any,
    "NRTL",
    "Name",
    "Name",
    "-",
    "|"
);

console.log("Activity result:", result);
console.log("Computed tau_ij_comp (from a/b/c/d):", (other as any).tau_ij_comp);
console.log("Extracted alpha_ij_comp:", (other as any).alpha_ij_comp);
