import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentsEquation } from "mozithermodb";
import { buildComponentsData } from "mozithermodb";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "mozithermodb";
// ! MoziThermoModels
import { checkMultiComponentEosRoots } from "mozithermomodels";

type P = "A" | "B" | "C" | "D" | "E";
type A = "T";
type R = "VaPr";

const params: ConfigParamMap<P> = {
  A: { name: "A", symbol: "A", unit: "-" },
  B: { name: "B", symbol: "B", unit: "K" },
  C: { name: "C", symbol: "C", unit: "-" },
  D: { name: "D", symbol: "D", unit: "1/K^E" },
  E: { name: "E", symbol: "E", unit: "-" }
};
const args: ConfigArgMap<A> = { T: { name: "Temperature", symbol: "T", unit: "K" } };
const ret: ConfigRetMap<R> = { VaPr: { name: "Vapor Pressure", symbol: "VaPr", unit: "Pa" } };
const eq: Eq<P, A> = (p, a) => ({
  value: Math.exp(p.A.value + p.B.value / a.T.value + p.C.value * Math.log(a.T.value) + p.D.value * a.T.value ** p.E.value),
  unit: "Pa", symbol: "VaPr"
});

const co2 = { name: "CO2", formula: "CO2", state: "g", mole_fraction: 0.15 } as Component;
const nButane = { name: "n-butane", formula: "C4H10", state: "g", mole_fraction: 0.85 } as Component;
const components = [co2, nButane];
const co2Records: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "CO2", unit: "" },
  { name: "Formula", symbol: "Formula", value: "CO2", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 304.13, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 73.77e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.225, unit: "-" },
  { name: "A", symbol: "A", value: 20.0, unit: "-" },
  { name: "B", symbol: "B", value: -1800, unit: "K" },
  { name: "C", symbol: "C", value: 0, unit: "-" },
  { name: "D", symbol: "D", value: 0, unit: "1/K^E" },
  { name: "E", symbol: "E", value: 1, unit: "-" }
];
const nButaneRecords: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "n-butane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C4H10", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 425.12, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 37.96e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.2, unit: "-" },
  { name: "A", symbol: "A", value: 25.0, unit: "-" },
  { name: "B", symbol: "B", value: -2500, unit: "K" },
  { name: "C", symbol: "C", value: 0, unit: "-" },
  { name: "D", symbol: "D", value: 0, unit: "1/K^E" },
  { name: "E", symbol: "E", value: 1, unit: "-" }
];

const eqTemplate = createEq(params, args, ret, eq, "Liquid Vapor Pressure (DIPPR 101)");
const modelSource = {
  dataSource: buildComponentsData(components, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State"),
  equationSource: buildComponentsEquation(components, eqTemplate, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State")
};

const res = checkMultiComponentEosRoots(
  components,
  { value: 10, unit: "bar" },
  { value: 444, unit: "K" },
  modelSource,
  "RK"
);

// log result
console.log(JSON.stringify(res, null, 2));

