import { describe, expect, it } from "vitest";
import { buildComponentData, buildComponentEquation, calcGasFugacity, checkComponentEosRoots, createEq } from "../index";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../types";

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
  unit: "Pa",
  symbol: "VaPr"
});

const propane = { name: "propane", formula: "C3H8", state: "g" };
const propaneRecords: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "propane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C3H8", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 369.83, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 42.48e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.152, unit: "-" },
  { name: "A", symbol: "A", value: 59.078, unit: "-" },
  { name: "B", symbol: "B", value: -3492.6, unit: "K" },
  { name: "C", symbol: "C", value: -6.0669, unit: "-" },
  { name: "D", symbol: "D", value: 1.0919e-5, unit: "1/K^E" },
  { name: "E", symbol: "E", value: 2, unit: "-" }
];

const modelSource = (() => {
  const tpl = createEq(params, args, ret, eq, "DIPPR 101");
  return {
    dataSource: buildComponentData(propane, propaneRecords, ["Name-State"]),
    equationSource: buildComponentEquation(propane, tpl, propaneRecords, ["Name-State"])
  };
})();

describe("eos", () => {
  it("checks root result shape", () => {
    const res = checkComponentEosRoots(
      { name: "propane", formula: "C3H8", state: "g" },
      { value: 10, unit: "bar" },
      { value: 300.1, unit: "K" },
      modelSource,
      "PR"
    );
    expect(res.pressure.unit).toBe("Pa");
    expect(res.phase).toBeDefined();
  });

  it("returns gas fugacity result", () => {
    const res = calcGasFugacity(
      propane,
      { value: 10, unit: "bar" },
      { value: 300.1, unit: "K" },
      modelSource,
      "PR"
    );
    const phase = Object.keys(res.results)[0];
    expect(res.results[phase].fugacity.value).toBeGreaterThan(0);
  });
});
