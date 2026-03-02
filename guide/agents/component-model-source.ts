// // Example: Using Source to extract data/equations and execute
// import type { Component } from "mozithermodb-settings";
// import { createEq, buildComponentEquation } from "../src/docs/equation";
// import { buildComponentData } from "../src/docs/data";
// import type { ConfigParamMap, ConfigArgMap, ConfigRetMap, RawThermoRecord, Eq } from "../src/types";
// import { Source, calcEq } from "../src/sources";

// type P = "A" | "B" | "C" | "D" | "E";
// type A = "T" | "R";
// type R = "Cp_IG";

// const params: ConfigParamMap<P> = {
//     A: { name: "A constant", symbol: "A", unit: "J/kmol*K" },
//     B: { name: "B constant", symbol: "B", unit: "J/kmol*K" },
//     C: { name: "C constant", symbol: "C", unit: "K" },
//     D: { name: "D constant", symbol: "D", unit: "J/kmol*K" },
//     E: { name: "E constant", symbol: "E", unit: "K" }
// };

// const args: ConfigArgMap<A> = {
//     T: { name: "Temperature", symbol: "T", unit: "K" },
//     R: { name: "Universal Gas Constant", symbol: "R", unit: "J/kmol*K" }
// };

// const ret: ConfigRetMap<R> = {
//     Cp_IG: { name: "Heat Capacity (ideal gas)", symbol: "Cp_IG", unit: "J/kmol*K" }
// };

// const eq: Eq<P, A> = (p, a) => {
//     const T = a.T.value;
//     const R = a.R.value;
//     const x = p.C.value / T;
//     const y = p.E.value / T;
//     const termB = (x / Math.sinh(x)) ** 2;
//     const termD = (y / Math.cosh(y)) ** 2;
//     let res = p.A.value + p.B.value * termB + p.D.value * termD;
//     res = res * R;
//     return { value: res, unit: "J/kmol*K", symbol: "Cp_IG" };
// };

// const data: RawThermoRecord[] = [
//     { name: "Name", symbol: "Name", value: "Methane", unit: "" },
//     { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
//     { name: "State", symbol: "State", value: "g", unit: "" },
//     { name: "A Constant", symbol: "A", value: 33298, unit: "J/kmol*K" },
//     { name: "B Constant", symbol: "B", value: 79933, unit: "J/kmol*K" },
//     { name: "C Constant", symbol: "C", value: 2086.9, unit: "K" },
//     { name: "D Constant", symbol: "D", value: 41602, unit: "J/kmol*K" },
//     { name: "E", symbol: "E", value: 991.96, unit: "K" },
//     { name: "Tmin", symbol: "Tmin", value: 298.15, unit: "K" },
//     { name: "Tmax", symbol: "Tmax", value: 1300, unit: "K" },
//     { name: "Universal Gas Constant", symbol: "R", value: 8314.462618, unit: "J/kmol*K" }
// ];

// // Component
// const methane = {
//     name: "Methane",
//     formula: "CH4",
//     state: "g"
// } as Component;

// // Build model source parts
// const methaneEq = createEq(params, args, ret, eq, "Methane Ideal Gas Cp");
// const componentData = buildComponentData(methane, data, ["Name-State"]);
// const componentEq = buildComponentEquation(methane, methaneEq, data, ["Name-State"]);

// // SECTION: Directly use equation source
// const eq_ = componentEq["Methane-g"]["Cp_IG"];
// const result_ = eq_.calc({
//     T: { value: 298.15, unit: "K", symbol: "T" },
//     R: { value: 8314.462618, unit: "J/kmol*K", symbol: "R" }
// });
// console.log("Direct equation result:", result_);


// // SECTION: Build and use Source
// const modelSource = {
//     dataSource: componentData,
//     equationSource: componentEq
// };

// // Use Source
// const source = new Source(modelSource, "Name-State");
// const componentId = "Methane-g";

// // Extract data and equation
// const recordA = source.dataExtractor(componentId, "A");
// console.log("Record A:", recordA);

// const eqCp = source.eqExtractor(componentId, "Cp_IG");
// console.log("Equation symbol:", eqCp?.equationSymbol);

// // Build and execute equation
// const eqSrc = source.eqBuilder([methane], "Cp_IG");
// console.log("Built equation source:", eqSrc);
// const result = source.execEq([methane], eqSrc!, { T: 298.15 });
// console.log("Result:", result);

// // Direct calc using calcEq (single component)
// const eqSrcSingle = eqSrc?.[componentId];
// console.log("Single component equation source:", eqSrcSingle);
// if (eqSrcSingle) {
//     const direct = calcEq(eqSrcSingle, { T: 298.15 });
//     console.log("Direct calcEq:", direct);
// }
