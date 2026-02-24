import { describe, expect, it } from "vitest";
import { createEq, buildComponentData, buildComponentEquation, Source, calcEq } from "../index";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../types";

describe("Source workflow", () => {
  it("extracts data/equation and executes", () => {
    type P = "A" | "B";
    type A = "T";
    type R = "Y";
    const params: ConfigParamMap<P> = {
      A: { name: "A", symbol: "A", unit: "-" },
      B: { name: "B", symbol: "B", unit: "1/K" }
    };
    const args: ConfigArgMap<A> = { T: { name: "T", symbol: "T", unit: "K" } };
    const ret: ConfigRetMap<R> = { Y: { name: "Y", symbol: "Y", unit: "-" } };
    const eq: Eq<P, A> = (p, a) => ({ value: p.A.value + p.B.value * a.T.value, unit: "-", symbol: "Y" });
    const comp = { name: "Methane", formula: "CH4", state: "g" };
    const recs: RawThermoRecord[] = [
      { name: "Name", symbol: "Name", value: "Methane", unit: "" },
      { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
      { name: "State", symbol: "State", value: "g", unit: "" },
      { name: "A", symbol: "A", value: 1, unit: "-" },
      { name: "B", symbol: "B", value: 0.02, unit: "1/K" }
    ];
    const tpl = createEq(params, args, ret, eq, "Linear");
    const modelSource = {
      dataSource: buildComponentData(comp, recs, ["Name-State"]),
      equationSource: buildComponentEquation(comp, tpl, recs, ["Name-State"])
    };
    const source = new Source(modelSource, "Name-State");
    expect(source.dataExtractor("Methane-g", "A")?.value).toBe(1);
    expect(source.eqExtractor("Methane-g", "Y")?.equationSymbol).toBe("Y");
    const eqSrc = source.eqBuilder([comp], "Y");
    expect(eqSrc).toBeDefined();
    const exec = eqSrc ? source.execEq([comp], eqSrc, { T: 300 }) : null;
    expect(exec).not.toBeNull();
    expect(Array.isArray(exec)).toBe(true);
    if (eqSrc) {
      expect(calcEq(eqSrc["Methane-g"], { T: 300 })?.value).toBeCloseTo(7);
    }
  });
});
