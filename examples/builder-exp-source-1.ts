import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentEquation } from "mozithermodb";
import { buildComponentData } from "mozithermodb";
import { Source, calcEq } from "mozithermodb";
import type { ConfigParamMap, ConfigArgMap, ConfigRetMap, RawThermoRecord, Eq } from "mozithermodb";

type P = "A" | "B" | "C" | "D" | "E";
type A = "T" | "R";
type Rv = "Cp_IG";

const params: ConfigParamMap<P> = {
  A: { name: "A", symbol: "A", unit: "J/kmol*K" },
  B: { name: "B", symbol: "B", unit: "J/kmol*K" },
  C: { name: "C", symbol: "C", unit: "K" },
  D: { name: "D", symbol: "D", unit: "J/kmol*K" },
  E: { name: "E", symbol: "E", unit: "K" }
};
const args: ConfigArgMap<A> = {
  T: { name: "Temperature", symbol: "T", unit: "K" },
  R: { name: "Universal Gas Constant", symbol: "R", unit: "J/kmol*K" }
};
const ret: ConfigRetMap<Rv> = { Cp_IG: { name: "Heat Capacity", symbol: "Cp_IG", unit: "J/kmol*K" } };
const eq: Eq<P, A> = (p, a) => {
  const T = a.T.value;
  const x = p.C.value / T;
  const y = p.E.value / T;
  const res = (p.A.value + p.B.value * (x / Math.sinh(x)) ** 2 + p.D.value * (y / Math.cosh(y)) ** 2) * a.R.value;
  return { value: res, unit: "J/kmol*K", symbol: "Cp_IG" };
};

const methane = { name: "Methane", formula: "CH4", state: "g" } as Component;
const records: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "Methane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "A", symbol: "A", value: 33298, unit: "J/kmol*K" },
  { name: "B", symbol: "B", value: 79933, unit: "J/kmol*K" },
  { name: "C", symbol: "C", value: 2086.9, unit: "K" },
  { name: "D", symbol: "D", value: 41602, unit: "J/kmol*K" },
  { name: "E", symbol: "E", value: 991.96, unit: "K" },
  { name: "R", symbol: "R", value: 8314.462618, unit: "J/kmol*K" }
];

const tpl = createEq(params, args, ret, eq, "Methane Ideal Gas Cp");
const modelSource = {
  dataSource: buildComponentData(methane, records, ["Name-State"]),
  equationSource: buildComponentEquation(methane, tpl, records, ["Name-State"])
};
const source = new Source(modelSource, "Name-State");
const eqSrc = source.eqBuilder([methane], "Cp_IG");
console.log(source.dataExtractor("Methane-g", "A"));
console.log(source.eqExtractor("Methane-g", "Cp_IG")?.equationSymbol);
console.log(eqSrc && source.execEq([methane], eqSrc, { T: 298.15 }));
if (eqSrc?.["Methane-g"]) console.log(calcEq(eqSrc["Methane-g"], { T: 298.15 }));
