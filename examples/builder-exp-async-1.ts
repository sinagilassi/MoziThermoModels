import { createEq, buildEquation, launchEqAsync } from "../src/docs/equation";
import type { Eq, ConfigParamMap, ConfigArgMap, ConfigRetMap } from "../src/types";

type P = "A" | "B" | "C" | "D" | "E";
type A = "T";
type R = "Cp_IG";

const params: ConfigParamMap<P> = {
  A: { name: "A constant", symbol: "A", unit: "J/kmol*K" },
  B: { name: "B constant", symbol: "B", unit: "J/kmol*K" },
  C: { name: "C constant", symbol: "C", unit: "K" },
  D: { name: "D constant", symbol: "D", unit: "J/kmol*K" },
  E: { name: "E constant", symbol: "E", unit: "K" }
};
const args: ConfigArgMap<A> = { T: { name: "Temperature", symbol: "T", unit: "K" } };
const ret: ConfigRetMap<R> = { Cp_IG: { name: "Heat Capacity (ideal gas)", symbol: "Cp_IG", unit: "J/kmol*K" } };

const eq: Eq<P, A> = async (p, a) => {
  const T = a.T.value;
  const x = p.C.value / T;
  const y = p.E.value / T;
  const termB = (x / Math.sinh(x)) ** 2;
  const termD = (y / Math.cosh(y)) ** 2;
  return { value: p.A.value + p.B.value * termB + p.D.value * termD, unit: "J/kmol*K", symbol: "Cp_IG" };
};

const tpl = createEq(params, args, ret, eq, "Methane Ideal Gas Cp");
const built = buildEquation(tpl, [
  { name: "A", symbol: "A", value: 33298, unit: "J/kmol*K" },
  { name: "B", symbol: "B", value: 79933, unit: "J/kmol*K" },
  { name: "C", symbol: "C", value: 2086.9, unit: "K" },
  { name: "D", symbol: "D", value: 41602, unit: "J/kmol*K" },
  { name: "E", symbol: "E", value: 991.96, unit: "K" }
]);

(async () => {
  console.log(await built.equation.calcAsync({ T: { value: 298.15, unit: "K", symbol: "T" } }));
  const launched = await launchEqAsync(
    params,
    args,
    ret,
    eq,
    [
      { name: "A", symbol: "A", value: 33298, unit: "J/kmol*K" },
      { name: "B", symbol: "B", value: 79933, unit: "J/kmol*K" },
      { name: "C", symbol: "C", value: 2086.9, unit: "K" },
      { name: "D", symbol: "D", value: 41602, unit: "J/kmol*K" },
      { name: "E", symbol: "E", value: 991.96, unit: "K" }
    ],
    {
      T: { value: 298.15, unit: "K", symbol: "T" }
    },
    "Methane Ideal Gas Cp",
    "one-shot launchEqAsync"
  );
  console.log("launchEqAsync:", await launched.result);
})();
