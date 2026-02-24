import { createEq, buildEquation, launchEq } from "mozithermodb";
import type { Eq, ConfigParamMap, ConfigArgMap, ConfigRetMap } from "mozithermodb";

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

const eq: Eq<P, A> = (p, a) => {
  const T = a.T.value;
  const lnY = p.A.value + p.B.value / T + p.C.value * Math.log(T) + p.D.value * T ** p.E.value;
  return { value: Math.exp(lnY), unit: "Pa", symbol: "VaPr" };
};

const vaporPressure = createEq(params, args, ret, eq, "Liquid Vapor Pressure (DIPPR 101)");
const built = buildEquation(vaporPressure, [
  { name: "A constant", symbol: "A", value: 39.205, unit: "-" },
  { name: "B constant", symbol: "B", value: -1324.4, unit: "K" },
  { name: "C constant", symbol: "C", value: -3.4366, unit: "-" },
  { name: "D constant", symbol: "D", value: 3.1019e-5, unit: "1/K^E" },
  { name: "E constant", symbol: "E", value: 2, unit: "-" }
]);

const res = built.equation.calc({ T: { value: 298.15, unit: "K", symbol: "T" } });
console.log(res);

// New in mozithermodb v1.0.1 root exports: one-shot create+configure+run
const launched = launchEq(
  params,
  args,
  ret,
  eq,
  [
    { name: "A constant", symbol: "A", value: 39.205, unit: "-" },
    { name: "B constant", symbol: "B", value: -1324.4, unit: "K" },
    { name: "C constant", symbol: "C", value: -3.4366, unit: "-" },
    { name: "D constant", symbol: "D", value: 3.1019e-5, unit: "1/K^E" },
    { name: "E constant", symbol: "E", value: 2, unit: "-" }
  ],
  {
    T: { value: 298.15, unit: "K", symbol: "T" }
  },
  "Liquid Vapor Pressure (DIPPR 101)",
  "one-shot launchEq"
);
console.log("launchEq:", launched.result);
