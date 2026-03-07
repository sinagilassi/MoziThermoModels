import { describe, expect, it } from "vitest";
import { buildComponentData, buildComponentEquation, calcFugacity, calcGasFugacity, checkComponentEosRoots, createEq } from "../index";
import type { Component, ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../types";

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

const propane: Component = { name: "propane", formula: "C3H8", state: "g", mole_fraction: 1 };
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

function vaporPressureAt(T: number): number {
  const A = 59.078;
  const B = -3492.6;
  const C = -6.0669;
  const D = 1.0919e-5;
  const E = 2;
  return Math.exp(A + B / T + C * Math.log(T) + D * T ** E);
}

describe("eos", () => {
  it("checks root result shape", () => {
    const res = checkComponentEosRoots(
      { name: "propane", formula: "C3H8", state: "g", mole_fraction: 1 },
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

  it("calcFugacity gas mode handles subcritical vapor-like condition", () => {
    const res = calcFugacity({
      component: propane,
      pressure: { value: 9, unit: "bar" },
      temperature: { value: 300.1, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "gas"
    });
    expect(res.results.VAPOR).toBeDefined();
    expect(Number((res.results.VAPOR.fugacity as { value: number }).value)).toBeGreaterThan(0);
  });

  it("calcFugacity liquid mode handles subcritical liquid-like condition", () => {
    const res = calcFugacity({
      component: propane,
      pressure: { value: 11, unit: "bar" },
      temperature: { value: 300.1, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "liquid"
    });
    expect(res.results.LIQUID).toBeDefined();
    expect(Number((res.results.LIQUID.fugacity as { value: number }).value)).toBeGreaterThan(0);
  });

  it("calcFugacity both mode returns vapor and liquid candidates in ambiguous subcritical region", () => {
    const T = 300.1;
    const Psat = vaporPressureAt(T);
    const res = calcFugacity({
      component: propane,
      pressure: { value: Psat, unit: "Pa" },
      temperature: { value: T, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "both",
      tolerance: 1
    });

    expect(res.results.LIQUID).toBeDefined();
    expect(res.results.VAPOR).toBeDefined();
    expect((res.results.LIQUID.roots ?? []).length).toBeLessThanOrEqual(2);
    expect((res.results.VAPOR.roots ?? []).length).toBeLessThanOrEqual(2);
    expect(res.results.LIQUID.selected_root).not.toBe(res.results.VAPOR.selected_root);
  });

  it("calcFugacity auto mode handles supercritical condition", () => {
    const res = calcFugacity({
      component: propane,
      pressure: { value: 50, unit: "bar" },
      temperature: { value: 400, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "auto"
    });
    const phase = Object.keys(res.results)[0];
    expect(["SUPERCRITICAL", "VAPOR"]).toContain(phase);
  });

  it("calcFugacity rejects invalid phaseMode", () => {
    expect(() =>
      calcFugacity({
        component: propane,
        pressure: { value: 10, unit: "bar" },
        temperature: { value: 300.1, unit: "K" },
        modelSource,
        modelName: "PR",
        phaseMode: "bad" as any
      })
    ).toThrow("Invalid phaseMode");
  });

  it("calcFugacity remains robust near critical conditions", () => {
    const res = calcFugacity({
      component: propane,
      pressure: { value: 42.48e5, unit: "Pa" },
      temperature: { value: 369.83, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "auto",
      criticalTolerance: { temperature: 1e-5, pressure: 1 }
    });
    expect(Object.keys(res.results).length).toBeGreaterThanOrEqual(1);
    expect(res.message).toBeDefined();
    expect(res.diagnostics).toBeDefined();
  });

  it("calcFugacity honors solverMethod option", () => {
    const res = calcFugacity({
      component: propane,
      pressure: { value: 10, unit: "bar" },
      temperature: { value: 300.1, unit: "K" },
      modelSource,
      modelName: "PR",
      phaseMode: "gas",
      solverMethod: "root"
    });
    const phase = Object.keys(res.results)[0];
    expect(res.results[phase].solver_method).toBe("root");
  });
});
