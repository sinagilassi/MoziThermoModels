import { describe, expect, it } from "vitest";
import { buildComponentData, buildComponentEquation, buildComponentsData, buildComponentsEquation, calcFugacity, calcGasFugacity, calcMixtureFugacity, checkComponentEosRoots, createEq } from "../index";
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

const co2: Component = { name: "CO2", formula: "CO2", state: "g", mole_fraction: 0.15 };
const nButane: Component = { name: "n-butane", formula: "C4H10", state: "g", mole_fraction: 0.85 };
const mixtureComponents: Component[] = [co2, nButane];

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

const mixtureModelSource = (() => {
  const tpl = createEq(params, args, ret, eq, "DIPPR 101");
  return {
    dataSource: buildComponentsData(mixtureComponents, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State"),
    equationSource: buildComponentsEquation(mixtureComponents, tpl, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State")
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

  it("returns both liquid and vapor results for explicit single-component VAPOR-LIQUID phase", () => {
    const res = calcGasFugacity(
      propane,
      { value: 10, unit: "bar" },
      { value: 300.1, unit: "K" },
      modelSource,
      "PR",
      "Name-State",
      { phase: "VAPOR-LIQUID" }
    );

    expect(res.results.LIQUID).toBeDefined();
    expect(res.results.VAPOR).toBeDefined();
    expect(Number(res.results.LIQUID.selected_root)).toBeLessThan(Number(res.results.VAPOR.selected_root));
  });

  it("uses minimum selected root for liquid mixture EOS mode", () => {
    const res = calcMixtureFugacity(
      mixtureComponents,
      { value: 10, unit: "bar" },
      { value: 300.1, unit: "K" },
      mixtureModelSource,
      "PR",
      "Name-State",
      { phase: "LIQUID", liquid_fugacity_mode: "EOS" }
    );

    const liquid = res.results.LIQUID;
    expect(liquid).toBeDefined();
    const roots = liquid.roots ?? [];
    expect(roots.length).toBeGreaterThan(0);
    expect(Number(liquid.selected_root)).toBeCloseTo(Math.min(...roots), 10);
    expect(typeof liquid.solver_method).toBe("string");
  });

  it("retains result and diagnostics for liquid mixture roots", () => {
    const res = calcMixtureFugacity(
      mixtureComponents,
      { value: 10, unit: "bar" },
      { value: 444, unit: "K" },
      mixtureModelSource,
      "RK",
      "Name-State",
      {
        phase: "LIQUID",
        liquid_fugacity_mode: "EOS",
        solver_method: "ls",
        k_ij: [
          [0, 0.18],
          [0.18, 0]
        ]
      }
    );

    const liquid = res.results.LIQUID;
    expect(liquid).toBeDefined();
    expect(Number(liquid.selected_root)).toBeGreaterThan(0);
    expect(typeof liquid.solver_method).toBe("string");
    expect(liquid.solver_method).toBe("ls");
  });

  it("throws not implemented for liquid mixture Poynting mode", () => {
    expect(() =>
      calcMixtureFugacity(
        mixtureComponents,
        { value: 10, unit: "bar" },
        { value: 300.1, unit: "K" },
        mixtureModelSource,
        "PR",
        "Name-State",
        { phase: "LIQUID", liquid_fugacity_mode: "Poynting" }
      )
    ).toThrow("Liquid fugacity calculation method for the mixture mode is not available");
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

  it("selects max root for vapor branch in ambiguous subcritical region", () => {
    const T = 300.1;
    const Psat = vaporPressureAt(T);
    const res = calcGasFugacity(
      propane,
      { value: Psat, unit: "Pa" },
      { value: T, unit: "K" },
      modelSource,
      "PR",
      "Name-State",
      { phase: "VAPOR" }
    );

    const vapor = res.results.VAPOR;
    const roots = vapor.roots ?? [];
    expect(roots.length).toBeGreaterThan(0);
    expect(Number(vapor.selected_root)).toBeCloseTo(Math.max(...roots), 10);
    expect(Number((vapor.fugacity as { value: number }).value)).toBeGreaterThan(0);
  });
});
