// // import libs
// import { type Component, ComponentKey, ComponentSchema } from "mozithermodb-settings"
// // ! LOCALS
// import type { RawThermoRecord } from "../src/types";
// import { buildBinaryMixtureData, MoziMatrixData } from './../src';


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

// const methane = ComponentSchema.parse({
//     name: "Methane",
//     formula: "CH4",
//     state: "g"
// })



// // STRUCTURE:
// // COLUMNS: [No.,Mixture,Name,Formula,State,a_i_1,a_i_2,b_i_1,b_i_2,c_i_1,c_i_2,alpha_i_1,alpha_i_2]
// // SYMBOL: [None,None,None,None,None,a_i_1,a_i_2,b_i_1,b_i_2,c_i_1,c_i_2,alpha_i_1,alpha_i_2]
// // UNIT: [None,None,None,None,None,1,1,1,1,1,1,1,1]
// // VALUES:
// // - [1,methanol|ethanol,methanol,CH3OH,l,0,0.300492719,0,1.564200272,0,35.05450323,0,4.481683583]
// // - [2,methanol|ethanol,ethanol,C2H5OH,l,0.380229054,0,-20.63243601,0,0.059982839,0,4.481683583,0]
// // - [1,methane|ethanol,methane,CH4,g,0,0.300492719,0,1.564200272,0,35.05450323,0,4.481683583]
// // - [2,methane|ethanol,ethanol,C2H5OH,l,0.380229054,0,-20.63243601,0,0.059982839,0,4.481683583,0]

// // SECTION: matrix data
// // NOTE: Record 1
// const methanolEthanolRecords: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Methanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "CH3OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 0, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 1, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 4, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 5, unit: "1" },
//     { name: "c_i_j_1", symbol: "c_i_j_1", value: 8, unit: "1" },
//     { name: "c_i_j_2", symbol: "c_i_j_2", value: 9, unit: "1" },
//     { name: "alpha_i_j_1", symbol: "alpha_i_j_1", value: 5, unit: "1" },
//     { name: "alpha_i_j_2", symbol: "alpha_i_j_2", value: 6, unit: "1" }
// ]

// const ethanolMethanolRecords: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Ethanol", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Ethanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "C2H5OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 2, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 3, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 6, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 7, unit: "1" },
//     { name: "c_i_j_1", symbol: "c_i_j_1", value: 10, unit: "1" },
//     { name: "c_i_j_2", symbol: "c_i_j_2", value: 11, unit: "1" },
//     { name: "alpha_i_j_1", symbol: "alpha_i_j_1", value: 6, unit: "1" },
//     { name: "alpha_i_j_2", symbol: "alpha_i_j_2", value: 7, unit: "1" }
// ]

// // NOTE: Record 2
// const methanolMethaneRecords: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Methane", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Methanol", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "CH3OH", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 0, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 10, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 40, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 50, unit: "1" },
//     { name: "c_i_j_1", symbol: "c_i_j_1", value: 80, unit: "1" },
//     { name: "c_i_j_2", symbol: "c_i_j_2", value: 90, unit: "1" },
//     { name: "alpha_i_j_1", symbol: "alpha_i_j_1", value: 5, unit: "1" },
//     { name: "alpha_i_j_2", symbol: "alpha_i_j_2", value: 6, unit: "1" }
// ]

// const methaneMethanolRecords: RawThermoRecord[] = [
//     { name: "Mixture", symbol: "-", value: "Methanol | Methane", unit: "N/A" },
//     { name: "Name", symbol: "-", value: "Methane", unit: "N/A" },
//     { name: "Formula", symbol: "-", value: "CH4", unit: "N/A" },
//     { name: "State", symbol: "-", value: "l", unit: "N/A" },
//     { name: "a_i_j_1", symbol: "a_i_j_1", value: 200, unit: "1" },
//     { name: "a_i_j_2", symbol: "a_i_j_2", value: 300, unit: "1" },
//     { name: "b_i_j_1", symbol: "b_i_j_1", value: 600, unit: "1" },
//     { name: "b_i_j_2", symbol: "b_i_j_2", value: 700, unit: "1" },
//     { name: "c_i_j_1", symbol: "c_i_j_1", value: 1000, unit: "1" },
//     { name: "c_i_j_2", symbol: "c_i_j_2", value: 1100, unit: "1" },
//     { name: "alpha_i_j_1", symbol: "alpha_i_j_1", value: 6, unit: "1" },
//     { name: "alpha_i_j_2", symbol: "alpha_i_j_2", value: 7, unit: "1" }
// ]

// const matrixData: RawThermoRecord[][] = [
//     methanolEthanolRecords,
//     ethanolMethanolRecords,
//     methanolMethaneRecords,
//     methaneMethanolRecords
// ]

// const mixture: Component[] = [methanol, methane];

// // SECTION: access binary mixture data
// const comp1 = mixture[0];
// const comp2 = mixture[1];
// // >> mixture id
// // const mixtureId = `${comp1.name}|${comp2.name}`; // name key
// // const mixtureId = `${comp1.formula}|${comp2.formula}`; // formula key
// const mixtureId = `${comp1.name}-${comp1.formula}|${comp2.name}-${comp2.formula}`; // name-formula key

// // log
// console.log("Mixture ID:", mixtureId)

// // SECTION: build binary mixture data
// const binaryMixtureData = buildBinaryMixtureData(
//     mixture,
//     matrixData,
// );
// // >> log
// console.log(binaryMixtureData)

// // NOTE: all sources
// const allSources = binaryMixtureData[mixtureId];
// console.log("All sources for mixture:", allSources)
// // get types
// console.log("allSources type:", typeof allSources)

// // NOTE: property symbol "a"
// const aSrc: MoziMatrixData = binaryMixtureData[mixtureId]["a"];
// console.log("Property 'a' for methanol|ethanol:", aSrc)


// // SECTION: get property for a component pair
// const res1 = aSrc.getProperty(
//     "a_i_j",
//     comp1,
//     mixtureId,
// );
// console.log("Property 'a_i_j' for methanol in methanol|ethanol:", res1)

// const res2 = aSrc.getProperty(
//     "a_i_j",
//     comp2,
//     mixtureId,
// );
// console.log("Property 'a_i_j' for ethanol in methanol|ethanol:", res2)

// // SECTION: get matrix property
// const res3 = aSrc.getMatrixProperty(
//     "a_i_j", [comp1, comp2], mixtureId
// )
// console.log("Matrix property 'a_i_j' for [methanol, ethanol] in methanol|ethanol:", res3)

// const res4 = aSrc.getMatrixProperty(
//     "a_i_j", [comp1, comp1], mixtureId
// )
// console.log("Matrix property 'a_i_j' for [methanol, methanol] in methanol|ethanol:", res4)

// const res5 = aSrc.getMatrixProperty(
//     "a_i_j", [comp2, comp1], mixtureId
// )
// console.log("Matrix property 'a_i_j' for [ethanol, methanol] in methanol|ethanol:", res5)

// const res6 = aSrc.getMatrixProperty(
//     "a_i_j", [comp2, comp2], mixtureId
// )
// console.log("Matrix property 'a_i_j' for [ethanol, ethanol] in methanol|ethanol:", res6)

// // SECTION: get matrix property by symbol
// const res7 = aSrc.ij(
//     "a_1_1", mixtureId
// )
// console.log("Matrix property 'a_1_1' for methanol-methanol pair in methanol|ethanol:", res7)

// const res8 = aSrc.ij(
//     "a_1_2", mixtureId
// )
// console.log("Matrix property 'a_1_2' for methanol-ethanol pair in methanol|ethanol:", res8)

// const res9 = aSrc.ij(
//     "a_2_1", mixtureId
// )
// console.log("Matrix property 'a_2_1' for ethanol-methanol pair in methanol|ethanol:", res9)

// const res10 = aSrc.ij(
//     "a_2_2",
//     mixtureId,
//     "Formula"
// )
// console.log("Matrix property 'a_2_2' for ethanol-ethanol pair in methanol|ethanol (accessed by formula):", res10)

// const res10_1 = aSrc.ij(
//     `a_${comp2.name}_${comp2.name}`,
//     mixtureId,
//     "Name"
// )
// console.log("Matrix property 'a_ethanol_ethanol' for ethanol-ethanol pair in methanol|ethanol (accessed by name):", res10_1)

// const res10_2 = aSrc.ij(
//     `a_${comp2.name}_${comp2.name}`,
//     mixtureId,
//     "Name-Formula"
// )
// console.log("Matrix property 'a_ethanol_ethanol' for ethanol-ethanol pair in methanol|ethanol (accessed by name-formula):", res10_2)

// // SECTION: ijs
// console.log("SECTION: ijs")
// const res11 = aSrc.ijs(
//     `a | ${comp1.name} | ${comp2.name}`,
//     "Name"
// )
// console.log(`Matrix property 'a | ${comp1.name} | ${comp2.name}' for methanol-ethanol pair in methanol|ethanol (accessed by name):`, res11)

// const res111 = aSrc.ijs(
//     `a | ${comp2.name} | ${comp1.name}`,
//     "Name"
// )
// console.log(`Matrix property 'a | ${comp2.name} | ${comp1.name}' for methanol-ethanol pair in methanol|ethanol (accessed by formula):`, res111)

// const res12 = aSrc.ijs(
//     `a_${comp1.name}_${comp2.name}`,
//     "Formula"
// )
// console.log(`Matrix property 'a_${comp1.name}_${comp2.name}' for methanol-ethanol pair in methanol|ethanol (accessed by formula):`, res12)

// const res13 = aSrc.ijs(
//     `a_${comp1.name}_${comp2.name}`,
//     "Name-Formula"
// )
// console.log(`Matrix property 'a_${comp2.name}_${comp1.name}' for ethanol-methanol pair in methanol|ethanol (accessed by name-formula):`, res13)

// // SECTION: mat
// console.log("SECTION: mat")
// const res14 = aSrc.mat(
//     `a_${comp1.name}_${comp2.name}`,
//     mixture,
// )
// console.log(`Matrix property 'a_${comp1.name}_${comp2.name}' for methanol-ethanol pair in methanol|ethanol (accessed by mixture):`, res14)

// const res14_1 = aSrc.mat(
//     `a_${comp2.name}_${comp1.name}`,
//     mixture,
// )
// console.log(`Matrix property 'a_${comp2.name}_${comp1.name}' for ethanol-methanol pair in methanol|ethanol (accessed by mixture with reversed component order):`, res14_1)

// // NOTE: mat dict
// const res15 = aSrc.matDict(
//     `a_${comp1.name}_${comp2.name}`,
//     mixture,
// )
// console.log(`Matrix property dict for 'a_${comp1.name}_${comp2.name}' for methanol-ethanol pair in methanol|ethanol (accessed by mixture):`, res15)

// const res15_1 = aSrc.matDict(
//     `a_${comp2.name}_${comp1.name}`,
//     mixture,
// )
// console.log(`Matrix property dict for 'a_${comp2.name}_${comp1.name}' for ethanol-methanol pair in methanol|ethanol (accessed by mixture with reversed component order):`, res15_1)