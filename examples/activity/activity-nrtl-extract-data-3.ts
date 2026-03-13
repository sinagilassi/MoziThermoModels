// import libs
import { Component } from "mozithermodb-settings";
import { RawThermoRecord, MoziMatObj, buildBinaryMatrixRawThermoData } from "mozithermodb";
// ! MoziThermoModels
import { buildBinaryMixtureData, calcActivityCoefficient } from "../../src";

const components = [
    { name: "Ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
    { name: "Water", formula: "H2O", state: "l", mole_fraction: 0.6 }
] as Component[];

// SECTION: dummy NRTL matrix data (coefficient form)
// NOTE: case 1
// tau_ij = a_ij + b_ij/T + c_ij*ln(T) + d_ij*T
// Here b=c=d=0, so tau_ij = a_ij

const a: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0.3,
    "Water-H2O_Ethanol-C2H5OH": 0.1,
    "Water-H2O_Water-H2O": 0
};

const b: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0,
    "Water-H2O_Ethanol-C2H5OH": 0,
    "Water-H2O_Water-H2O": 0
};

const c: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0,
    "Water-H2O_Ethanol-C2H5OH": 0,
    "Water-H2O_Water-H2O": 0
};

const d: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0,
    "Water-H2O_Ethanol-C2H5OH": 0,
    "Water-H2O_Water-H2O": 0
};

// NOTE: case 2: dg_ij
const dg: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0.3,
    "Water-H2O_Ethanol-C2H5OH": 0.1,
    "Water-H2O_Water-H2O": 0
};

// NOTE: alpha_ij
const alpha: MoziMatObj = {
    "Ethanol-C2H5OH_Ethanol-C2H5OH": 0,
    "Ethanol-C2H5OH_Water-H2O": 0.2,
    "Water-H2O_Ethanol-C2H5OH": 0.2,
    "Water-H2O_Water-H2O": 0
};

// >> prop data
const propData1: Record<string, MoziMatObj> = {
    "a": a,
    "b": b,
    "c": c,
    "d": d,
    "alpha": alpha
}

// >> prop data in dg_ij form
const propData2: Record<string, MoziMatObj> = {
    "dg": dg,
    "alpha": alpha
}

const propData = [propData1, propData2]

// NOTE: build binary mixture raw thermo data
const nrtlRawThermoData = buildBinaryMatrixRawThermoData(
    components,
    "Name",
    "Name-Formula",
    propData[1],
    "|",
    "12",
    ["i_j_1", "i_j_2"],
    "_"
);
// >> convert raw thermo data array
const nrtlRows = Object.values(nrtlRawThermoData) as RawThermoRecord[][];

const nrtlData = buildBinaryMixtureData(components, nrtlRows);

// NOTE: create model source
const modelSource = {
    dataSource: nrtlData,
    equationSource: {}
};

console.log("ModelSource mixture keys:", Object.keys(modelSource.dataSource));
console.log("Sample node:", modelSource.dataSource["Ethanol|Water"] ?? modelSource.dataSource["Water|Ethanol"]);

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
