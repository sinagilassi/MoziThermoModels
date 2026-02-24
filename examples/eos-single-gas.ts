import type { Component } from "mozithermodb-settings";
import { calcGasFugacity } from "../src";
import { createEq, buildComponentEquation } from "../src/docs/equation";
import { buildComponentData } from "../src/docs/data";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../src/types";

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

const args: ConfigArgMap<A> = {
  T: { name: "Temperature", symbol: "T", unit: "K" }
};

const ret: ConfigRetMap<R> = {
  VaPr: { name: "Vapor Pressure", symbol: "VaPr", unit: "Pa" }
};

const dippr101: Eq<P, A> = (p, a) => {
  const T = a.T.value;
  const lnY = p.A.value + p.B.value / T + p.C.value * Math.log(T) + p.D.value * T ** p.E.value;
  return { value: Math.exp(lnY), unit: "Pa", symbol: "VaPr" };
};

const vaporPressureEq = createEq(params, args, ret, dippr101, "Liquid Vapor Pressure (DIPPR 101)");

const propane = { name: "propane", formula: "C3H8", state: "g" } as Component;
const propaneRecords: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "propane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C3H8", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Critical Temperature", symbol: "Tc", value: 369.83, unit: "K" },
  { name: "Critical Pressure", symbol: "Pc", value: 42.48e5, unit: "Pa" },
  { name: "Acentric Factor", symbol: "AcFa", value: 0.152, unit: "-" },
  { name: "A", symbol: "A", value: 59.078, unit: "-" },
  { name: "B", symbol: "B", value: -3492.6, unit: "K" },
  { name: "C", symbol: "C", value: -6.0669, unit: "-" },
  { name: "D", symbol: "D", value: 1.0919e-5, unit: "1/K^E" },
  { name: "E", symbol: "E", value: 2, unit: "-" }
];

const dataSource = buildComponentData(propane, propaneRecords, ["Name-State"], true, "Name-State");
const equationSource = buildComponentEquation(propane, vaporPressureEq, propaneRecords, ["Name-State"], true, "Name-State");
const modelSource = { dataSource, equationSource };

console.log(
  calcGasFugacity(
    propane,
    { value: 9.99, unit: "bar" },
    { value: 300.1, unit: "K" },
    modelSource,
    "PR"
  )
);

