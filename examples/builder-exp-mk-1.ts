import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentsEquation } from "../src/docs/equation";
import { buildComponentsData } from "../src/docs/data";
import { mkdt, mkeq, mkeqs } from "../src/sources";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../src/types";

type P = "A" | "B";
type A = "T";
type R = "Y";

const params: ConfigParamMap<P> = {
  A: { name: "Intercept", symbol: "A", unit: "-" },
  B: { name: "Slope", symbol: "B", unit: "1/K" }
};
const args: ConfigArgMap<A> = { T: { name: "Temperature", symbol: "T", unit: "K" } };
const ret: ConfigRetMap<R> = { Y: { name: "Example Property", symbol: "Y", unit: "-" } };
const eq: Eq<P, A> = (p, a) => ({ value: p.A.value + p.B.value * a.T.value, unit: "-", symbol: "Y" });
const eqTemplate = createEq(params, args, ret, eq, "Linear Example", "Y = A + B*T");

const methane = { name: "Methane", formula: "CH4", state: "g" } as Component;
const ethane = { name: "Ethane", formula: "C2H6", state: "g" } as Component;

const methaneData: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "Methane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "A", symbol: "A", value: 1, unit: "-" },
  { name: "B", symbol: "B", value: 0.01, unit: "1/K" }
];
const ethaneData: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "Ethane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C2H6", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "A", symbol: "A", value: 2, unit: "-" },
  { name: "B", symbol: "B", value: 0.02, unit: "1/K" }
];

const modelSource = {
  dataSource: buildComponentsData([methane, ethane], [methaneData, ethaneData], ["Name-Formula", "Name-State"], true, "Name-Formula"),
  equationSource: buildComponentsEquation([methane, ethane], eqTemplate, [methaneData, ethaneData], ["Name-Formula", "Name-State"], true, "Name-Formula")
};

// New in mozithermodb root exports: mkdt / mkeq / mkeqs
const ds = mkdt(methane, modelSource, "Name-Formula");
console.log("mkdt props:", ds?.props());
console.log("mkdt A:", ds?.prop("A"));

const eqs = mkeqs(methane, modelSource, "Name-Formula");
console.log("mkeqs equations:", eqs?.equations());

const eqY = mkeq("Y", methane, modelSource, "Name-Formula");
console.log("mkeq calc:", eqY?.calc({ T: 300 }));

