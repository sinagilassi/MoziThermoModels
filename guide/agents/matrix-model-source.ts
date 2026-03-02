// // Example: mixture-only modelSource and multiple mixture data extraction methods
// import { type Component, ComponentSchema } from "mozithermodb-settings";
// import type { RawThermoRecord } from "../src/types";
// import { buildBinaryMixtureData, MoziMatrixData } from "../src";
// import { mkmat, Source } from "../src/sources";

// // NOTE: components
// const methanol = ComponentSchema.parse({
//     name: "Methanol",
//     formula: "CH3OH",
//     state: "l"
// });

// const ethanol = ComponentSchema.parse({
//     name: "Ethanol",
//     formula: "C2H5OH",
//     state: "l"
// });

// const mixture: Component[] = [methanol, ethanol];

// // SECTION: matrix rows (one row per component for the same binary mixture)
// const methanolRow: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Methanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "CH3OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 0, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 1, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 4, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 5, unit: "1" }
// ];

// const ethanolRow: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Ethanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "C2H5OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 2, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 3, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 6, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 7, unit: "1" }
// ];

// const matrixData: RawThermoRecord[][] = [methanolRow, ethanolRow];

// // SECTION: build a mixture-only model source
// const binaryMixtureData = buildBinaryMixtureData(mixture, matrixData);
// const modelSource = {
//     dataSource: binaryMixtureData,
//     equationSource: {}
// };

// console.log("Model source built (mixture only):", modelSource);
// console.log("Mixture ids:", Object.keys(modelSource.dataSource));

// // Optional: Source instance with mixture-only datasource contract
// const source = new Source(modelSource, "Name-Formula");
// console.log("Source datasource keys:", Object.keys(source.datasource));

// // SECTION: direct extraction from MoziMatrixData
// const mixtureId = `${methanol.name}|${ethanol.name}`;
// const aSrc: MoziMatrixData = binaryMixtureData[mixtureId]["a"];

// console.log("Mixture ID:", mixtureId);
// console.log("Property symbols for mixture:", Object.keys(binaryMixtureData[mixtureId]));

// console.log("a.getProperty(a_i_j, methanol):", aSrc.getProperty("a_i_j", methanol, mixtureId));
// console.log("a.getProperty(a_i_j, ethanol):", aSrc.getProperty("a_i_j", ethanol, mixtureId));

// console.log("a.getMatrixProperty(a_i_j, [methanol, ethanol]):", aSrc.getMatrixProperty("a_i_j", [methanol, ethanol], mixtureId));
// console.log("a.ij(a_1_2):", aSrc.ij("a_1_2", mixtureId));
// console.log("a.ijs(a | methanol | ethanol, Name):", aSrc.ijs("a | methanol | ethanol", "Name"));
// console.log("a.mat(a_methanol_ethanol):", aSrc.mat("a_methanol_ethanol", mixture));
// console.log("a.matDict(a_methanol_ethanol):", aSrc.matDict("a_methanol_ethanol", mixture));

// // SECTION: extraction via mkmat wrapper from modelSource
// const matSource = mkmat(mixture, modelSource, "Name-Formula");

// if (!matSource) {
//     console.log("Failed to create matrix source.");
// } else {
//     console.log("mkmat.mixtureIds():", matSource.mixtureIds());
//     console.log("mkmat.props():", matSource.props());
//     console.log("mkmat.ij(a_2_1):", matSource.ij("a_2_1", "methanol|ethanol"));
//     console.log("mkmat.mat(a_methanol_ethanol):", matSource.mat("a_methanol_ethanol", mixture, "methanol|ethanol"));
// }
