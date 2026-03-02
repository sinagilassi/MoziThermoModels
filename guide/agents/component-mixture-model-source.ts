// // Example: Build BinaryMixtureData, then build modelSource and matrix wrapper via mkmat
// import type { Component } from "mozithermodb-settings";
// import type { RawThermoRecord } from "../src/types";
// import { buildComponentsData } from "../src/docs/data";
// import { buildBinaryMixtureData } from "../src/docs/matrix-data";
// import { mkmat, Source } from "../src/sources";

// const methanol = {
//     name: "Methanol",
//     formula: "CH3OH",
//     state: "l"
// } as Component;

// const ethanol = {
//     name: "Ethanol",
//     formula: "C2H5OH",
//     state: "l"
// } as Component;

// const mixture: Component[] = [methanol, ethanol];

// // Matrix-shaped raw records for one binary mixture (2 rows: one per component)
// const methanolRow: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol|Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Methanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "CH3OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 0, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 1, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 4, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 5, unit: "1" }
// ];

// const ethanolRow: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol|Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Ethanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "C2H5OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 2, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 3, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 6, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 7, unit: "1" }
// ];

// const matrixData: RawThermoRecord[][] = [methanolRow, ethanolRow];

// // 0) Build individual component records (Tc, Pc, MW)
// const methanolPureData: RawThermoRecord[] = [
//     { name: "Name", symbol: "Name", value: "Methanol", unit: "N/A" },
//     { name: "Formula", symbol: "Formula", value: "CH3OH", unit: "N/A" },
//     { name: "State", symbol: "State", value: "l", unit: "N/A" },
//     { name: "Critical Temperature", symbol: "Tc", value: 512.6, unit: "K" },
//     { name: "Critical Pressure", symbol: "Pc", value: 80.9, unit: "bar" },
//     { name: "Molecular Weight", symbol: "MW", value: 32.04, unit: "g/mol" }
// ];

// const ethanolPureData: RawThermoRecord[] = [
//     { name: "Name", symbol: "Name", value: "Ethanol", unit: "N/A" },
//     { name: "Formula", symbol: "Formula", value: "C2H5OH", unit: "N/A" },
//     { name: "State", symbol: "State", value: "l", unit: "N/A" },
//     { name: "Critical Temperature", symbol: "Tc", value: 514.0, unit: "K" },
//     { name: "Critical Pressure", symbol: "Pc", value: 61.4, unit: "bar" },
//     { name: "Molecular Weight", symbol: "MW", value: 46.07, unit: "g/mol" }
// ];

// const pureDataBlocks: RawThermoRecord[][] = [methanolPureData, ethanolPureData];
// const componentData = buildComponentsData(
//     mixture,
//     pureDataBlocks,
//     ["Name-Formula", "Name", "Formula"],
//     true,
//     "Name-Formula"
// );

// // 1) Build all mixture aliases -> BinaryMixtureData map keyed by mixture-id aliases
// const allBinaryData = buildBinaryMixtureData(mixture, matrixData);

// // 2) Build merged data source with both individual component data + mixture matrix data
// const dataSourceAll = {
//     ...componentData,
//     ...allBinaryData
// };

// // 3) Build model source with DataSource = componentData + binaryMixtureData
// const modelSource = {
//     dataSource: dataSourceAll,
//     equationSource: {}
// };

// console.log("Model source built from component + mixture data:");
// console.log("component data keys:", Object.keys(componentData));
// console.log("dataSource property symbols:", Object.keys(modelSource.dataSource));
// console.log("equationSource keys:", Object.keys(modelSource.equationSource));

// // Optional: Source instance (works with the model source contract)
// const source = new Source(modelSource, "Name-Formula");
// console.log("Source datasource symbols:", Object.keys(source.datasource));
// console.log("Methanol Tc:", source.dataExtractor("Methanol-CH3OH", "Tc"));
// console.log("Ethanol Pc:", source.dataExtractor("Ethanol-C2H5OH", "Pc"));

// // 4) Build matrix wrapper from components + modelSource + mixtureKey
// const matSource = mkmat(mixture, modelSource, "Name-Formula");

// if (!matSource) {
//     console.log("Failed to create matrix source.");
// } else {
//     console.log("Resolved mixture ids:", matSource.mixtureIds());
//     console.log("Available props:", matSource.props());
//     console.log("a matrix:", matSource.mat("a_methanol_ethanol", mixture, "methanol|ethanol"));
//     console.log("a_1_2:", matSource.ij("a_1_2", "methanol|ethanol"));
// }
