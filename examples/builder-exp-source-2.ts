import type { Component } from "mozithermodb-settings";
import { createEq, buildComponentsEquation } from "../src/docs/equation";
import { buildComponentsData } from "../src/docs/data";
import { Source } from "../src/sources";
import type { ConfigParamMap, ConfigArgMap, ConfigRetMap, RawThermoRecord, Eq } from "../src/types";

type P = "A" | "B";
type A = "T";
type R = "Y";
const params: ConfigParamMap<P> = {
  A: { name: "A", symbol: "A", unit: "-" },
  B: { name: "B", symbol: "B", unit: "1/K" }
};
const args: ConfigArgMap<A> = { T: { name: "Temperature", symbol: "T", unit: "K" } };
const ret: ConfigRetMap<R> = { Y: { name: "Y", symbol: "Y", unit: "-" } };
const eq: Eq<P, A> = (p, a) => ({ value: p.A.value + p.B.value * a.T.value, unit: "-", symbol: "Y" });
const tpl = createEq(params, args, ret, eq, "Linear Example");

const methane = { name: "Methane", formula: "CH4", state: "g" } as Component;
const ethane = { name: "Ethane", formula: "C2H6", state: "g" } as Component;
const blocks: RawThermoRecord[][] = [
  [
    { name: "Name", symbol: "Name", value: "Methane", unit: "" },
    { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
    { name: "State", symbol: "State", value: "g", unit: "" },
    { name: "A", symbol: "A", value: 1, unit: "-" },
    { name: "B", symbol: "B", value: 0.01, unit: "1/K" }
  ],
  [
    { name: "Name", symbol: "Name", value: "Ethane", unit: "" },
    { name: "Formula", symbol: "Formula", value: "C2H6", unit: "" },
    { name: "State", symbol: "State", value: "g", unit: "" },
    { name: "A", symbol: "A", value: 2, unit: "-" },
    { name: "B", symbol: "B", value: 0.02, unit: "1/K" }
  ]
];

const modelSource = {
  dataSource: buildComponentsData([methane, ethane], blocks, ["Name-State"], true, "Name-Formula"),
  equationSource: buildComponentsEquation([methane, ethane], tpl, blocks, ["Name-State"], true, "Name-Formula")
};
const source = new Source(modelSource, "Name-State");
const eqSrc = source.eqBuilder([methane, ethane], "Y");
console.log(eqSrc && source.execEq([methane, ethane], eqSrc, { T: 300 }));
