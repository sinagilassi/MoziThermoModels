// import libs
import { RawThermoRecord } from "mozithermodb";
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
): RawThermoRecord[][] {
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

function mergeMatrixRows(...matrices: RawThermoRecord[][][]): RawThermoRecord[][] {
    if (matrices.length === 0) return [];

    const metadataNames = new Set(["Mixture", "Name", "Formula", "State"]);
    const rowCount = matrices[0].length;

    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const mergedRow = [...matrices[0][rowIndex]];
        for (let i = 1; i < matrices.length; i += 1) {
            mergedRow.push(...matrices[i][rowIndex].filter((record) => !metadataNames.has(record.name)));
        }
        return mergedRow;
    });
}

// SECTION: dummy NRTL matrix data (coefficient form)
// tau_ij = a_ij + b_ij/T + c_ij*ln(T) + d_ij*T
// Here b=c=d=0, so tau_ij = a_ij
const aRows = buildMatrixRows("a", "ethanol", "water", [0, 1.2, 0.8, 0]);
const bRows = buildMatrixRows("b", "ethanol", "water", [0, 0, 0, 0]);
const cRows = buildMatrixRows("c", "ethanol", "water", [0, 0, 0, 0]);
const dRows = buildMatrixRows("d", "ethanol", "water", [0, 0, 0, 0]);
const alphaRows = buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]);
const nrtlRows = mergeMatrixRows(aRows, bRows, cRows, dRows, alphaRows);

const nrtlData = buildBinaryMixtureData(components as any, nrtlRows as any) as Record<string, Record<string, unknown>>;

// NOTE: create model source
const modelSource = {
    dataSource: nrtlData,
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
