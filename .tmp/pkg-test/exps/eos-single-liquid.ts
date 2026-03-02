import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentEquation } from "mozithermodb";
import { buildComponentData } from "mozithermodb";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "mozithermodb";
// ! MoziThermoModels
import { calcLiquidFugacity } from "mozithermomodels";

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
const dippr101: Eq<P, A> = (p, a) => ({
  value: Math.exp(p.A.value + p.B.value / a.T.value + p.C.value * Math.log(a.T.value) + p.D.value * a.T.value ** p.E.value),
  unit: "Pa",
  symbol: "VaPr"
});

const propane = { name: "propane", formula: "C3H8", state: "l", mole_fraction: 1 } as Component;
const records: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "propane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C3H8", unit: "" },
  { name: "State", symbol: "State", value: "l", unit: "" },
  { name: "Tc", symbol: "Tc", value: 369.83, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 42.48e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.152, unit: "-" },
  { name: "A", symbol: "A", value: 59.078, unit: "-" },
  { name: "B", symbol: "B", value: -3492.6, unit: "K" },
  { name: "C", symbol: "C", value: -6.0669, unit: "-" },
  { name: "D", symbol: "D", value: 1.0919e-5, unit: "1/K^E" },
  { name: "E", symbol: "E", value: 2, unit: "-" }
];

const eqTemplate = createEq(params, args, ret, dippr101, "Liquid Vapor Pressure (DIPPR 101)");
const modelSource = {
  dataSource: buildComponentData(propane, records, ["Name-State"], true, "Name-State"),
  equationSource: buildComponentEquation(propane, eqTemplate, records, ["Name-State"], true, "Name-State")
};


const res = calcLiquidFugacity(
  propane,
  { value: 10, unit: "bar" },
  { value: 300.1, unit: "K" },
  modelSource,
  "PR",
  "Name-State",
  { liquid_fugacity_mode: "Poynting" }
);

// log
console.log(JSON.stringify(res, null, 2));
