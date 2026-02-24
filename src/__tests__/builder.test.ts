import { describe, expect, it } from "vitest";
import { createEq, buildEquation, buildComponentData, buildComponentEquation, buildComponentsData, buildComponentsEquation } from "../index";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "../types";

describe("builder workflow", () => {
  it("buildEquation supports sync calc", () => {
    type P = "A" | "B";
    type A = "T";
    type R = "Y";
    const params: ConfigParamMap<P> = { A: { name: "A", symbol: "A", unit: "-" }, B: { name: "B", symbol: "B", unit: "1/K" } };
    const args: ConfigArgMap<A> = { T: { name: "T", symbol: "T", unit: "K" } };
    const ret: ConfigRetMap<R> = { Y: { name: "Y", symbol: "Y", unit: "-" } };
    const eq: Eq<P, A> = (p, a) => ({ value: p.A.value + p.B.value * a.T.value, unit: "-", symbol: "Y" });
    const tpl = createEq(params, args, ret, eq, "Linear");
    const built = buildEquation(tpl, [
      { name: "A", symbol: "A", value: 1, unit: "-" },
      { name: "B", symbol: "B", value: 0.1, unit: "1/K" }
    ]);
    expect(built.equation.calc({ T: { value: 10, unit: "K", symbol: "T" } }).value).toBe(2);
  });

  it("buildEquation supports calcAsync for async equations", async () => {
    type P = "A";
    type A = "T";
    type R = "Y";
    const params: ConfigParamMap<P> = { A: { name: "A", symbol: "A", unit: "-" } };
    const args: ConfigArgMap<A> = { T: { name: "T", symbol: "T", unit: "K" } };
    const ret: ConfigRetMap<R> = { Y: { name: "Y", symbol: "Y", unit: "-" } };
    const eq: Eq<P, A> = async (p, a) => ({ value: p.A.value + a.T.value, unit: "-", symbol: "Y" });
    const built = buildEquation(createEq(params, args, ret, eq, "Async"), [{ name: "A", symbol: "A", value: 1, unit: "-" }]);
    const res = await built.equation.calcAsync({ T: { value: 2, unit: "K", symbol: "T" } });
    expect(res.value).toBe(3);
  });

  it("component and components builders create aliases", () => {
    type P = "A";
    type A = "T";
    type R = "Y";
    const params: ConfigParamMap<P> = { A: { name: "A", symbol: "A", unit: "-" } };
    const args: ConfigArgMap<A> = { T: { name: "T", symbol: "T", unit: "K" } };
    const ret: ConfigRetMap<R> = { Y: { name: "Y", symbol: "Y", unit: "-" } };
    const eq: Eq<P, A> = (p, a) => ({ value: p.A.value + a.T.value, unit: "-", symbol: "Y" });
    const tpl = createEq(params, args, ret, eq, "Eq");
    const comp = { name: "Methane", formula: "CH4", state: "g" };
    const recs: RawThermoRecord[] = [
      { name: "Name", symbol: "Name", value: "Methane", unit: "" },
      { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
      { name: "State", symbol: "State", value: "g", unit: "" },
      { name: "A", symbol: "A", value: 1, unit: "-" }
    ];
    const d1 = buildComponentData(comp, recs, ["Name-Formula", "Name-State"], true, "Name-Formula");
    const e1 = buildComponentEquation(comp, tpl, recs, ["Name-Formula", "Name-State"], true, "Name-Formula");
    expect(d1["Methane-CH4"]).toBeDefined();
    expect(d1["Methane-g"]).toBeDefined();
    expect(e1["Methane-g"].Y).toBeDefined();

    const d2 = buildComponentsData([comp], [recs], ["Name-State"]);
    const e2 = buildComponentsEquation([comp], tpl, [recs], ["Name-State"]);
    expect(d2["Methane-g"]).toBeDefined();
    expect(e2["Methane-g"].Y).toBeDefined();
  });
});

