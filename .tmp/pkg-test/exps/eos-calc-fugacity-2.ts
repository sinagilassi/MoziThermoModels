import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentData, buildComponentEquation } from "mozithermodb";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "mozithermodb";
import { calcFugacity } from "mozithermomodels";

type P = "A" | "B" | "C";
type A = "T";
type R = "VaPr";

// log10(P) = A − (B / (T + C))
//     P = vapor pressure (bar)
//     T = temperature (K)

const params: ConfigParamMap<P> = {
  A: { name: "A", symbol: "A", unit: "-" },
  B: { name: "B", symbol: "B", unit: "-" },
  C: { name: "C", symbol: "C", unit: "-" },
};
const args: ConfigArgMap<A> = { T: { name: "Temperature", symbol: "T", unit: "K" } };
const ret: ConfigRetMap<R> = { VaPr: { name: "Vapor Pressure", symbol: "VaPr", unit: "Pa" } };
const nistEq: Eq<P, A> = (p, a) => ({
  value: Math.pow(10, p.A.value - p.B.value / (a.T.value + p.C.value)) * 1e5,
  unit: "Pa",
  symbol: "VaPr"
});

const carbonDioxide = { name: "carbon dioxide", formula: "CO2", state: "g", mole_fraction: 1 } as Component;

const records: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "carbon dioxide", unit: "" },
  { name: "Formula", symbol: "Formula", value: "CO2", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 304.2, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 7.38, unit: "MPa" },
  { name: "AcFa", symbol: "AcFa", value: 0.225, unit: "-" },
  { name: "A", symbol: "A", value: 6.8128, unit: "-" },
  { name: "B", symbol: "B", value: 1301.679, unit: "-" },
  { name: "C", symbol: "C", value: -3.494, unit: "-" },
];

// NOTE: Equation Template
const eqTemplate = createEq(params, args, ret, nistEq, "Liquid Vapor Pressure Model");

// NOTE: Model Source
const modelSource = {
  dataSource: buildComponentData(carbonDioxide, records, ["Name-State"], true, "Name-State"),
  equationSource: buildComponentEquation(carbonDioxide, eqTemplate, records, ["Name-State"], true, "Name-State")
};

const base = {
  component: carbonDioxide,
  modelSource,
  modelName: "PR" as const,
  componentKey: "Name-State" as const,
  solverMethod: "qr" as const,
  solverOptions: {
    qr: { max_iter: 300, tol: 1e-12, polish_newton: true }
  }
};

const auto = calcFugacity({
  ...base,
  pressure: { value: 10, unit: "bar" },
  temperature: { value: 300.15, unit: "K" },
  phaseMode: "auto"
});

const gas = calcFugacity({
  ...base,
  pressure: { value: 9, unit: "bar" },
  temperature: { value: 300.1, unit: "K" },
  phaseMode: "gas"
});

const liquid = calcFugacity({
  ...base,
  pressure: { value: 11, unit: "bar" },
  temperature: { value: 300.1, unit: "K" },
  phaseMode: "liquid",
  liquidFugacityMode: "Poynting"
});

const both = calcFugacity({
  ...base,
  pressure: { value: 1001435.2352169304, unit: "Pa" },
  temperature: { value: 300.1, unit: "K" },
  phaseMode: "both",
  tolerance: 1
});

console.log("AUTO:\n", JSON.stringify(auto, null, 2));
console.log("GAS:\n", JSON.stringify(gas, null, 2));
console.log("LIQUID:\n", JSON.stringify(liquid, null, 2));
console.log("BOTH:\n", JSON.stringify(both, null, 2));
