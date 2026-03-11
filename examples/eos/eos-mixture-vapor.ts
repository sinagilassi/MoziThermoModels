import type { Component } from "mozithermodb-settings";
import { buildComponentsData, buildComponentsEquation, createEq } from "mozithermodb";
import type { ConfigArgMap, ConfigParamMap, ConfigRetMap, Eq, RawThermoRecord } from "mozithermodb";
import { calcMixtureFugacity, checkMultiComponentEosRoots } from "../../src";

type P = "C1" | "C2" | "C3" | "C4" | "C5";
type A = "T";
type R = "VaPr";

const params: ConfigParamMap<P> = {
    C1: { name: "C1", symbol: "C1", unit: "-" },
    C2: { name: "C2", symbol: "C2", unit: "-" },
    C3: { name: "C3", symbol: "C3", unit: "-" },
    C4: { name: "C4", symbol: "C4", unit: "-" },
    C5: { name: "C5", symbol: "C5", unit: "-" }
};

const args: ConfigArgMap<A> = {
    T: { name: "Temperature", symbol: "T", unit: "K" }
};

const ret: ConfigRetMap<R> = {
    VaPr: { name: "Vapor Pressure", symbol: "VaPr", unit: "Pa" }
};

const dippr101: Eq<P, A> = (p, a) => ({
    value: Math.exp(
        p.C1.value +
        p.C2.value / a.T.value +
        p.C3.value * Math.log(a.T.value) +
        p.C4.value * a.T.value ** p.C5.value
    ),
    unit: "Pa",
    symbol: "VaPr"
});

const components: Component[] = [
    { name: "CO2", formula: "CO2", state: "g", mole_fraction: 0.15 },
    { name: "n-butane", formula: "C4H10", state: "g", mole_fraction: 0.85 }
];

const co2Records: RawThermoRecord[] = [
    { name: "Name", symbol: "Name", value: "CO2", unit: "" },
    { name: "Formula", symbol: "Formula", value: "CO2", unit: "" },
    { name: "State", symbol: "State", value: "g", unit: "" },
    { name: "Tc", symbol: "Tc", value: 304.21, unit: "K" },
    { name: "Pc", symbol: "Pc", value: 7.383e6, unit: "Pa" },
    { name: "AcFa", symbol: "AcFa", value: 0.2236, unit: "-" },
    { name: "C1", symbol: "C1", value: 140.54, unit: "-" },
    { name: "C2", symbol: "C2", value: -4735, unit: "-" },
    { name: "C3", symbol: "C3", value: -21.268, unit: "-" },
    { name: "C4", symbol: "C4", value: 4.09e-2, unit: "-" },
    { name: "C5", symbol: "C5", value: 1, unit: "-" }
];

const nButaneRecords: RawThermoRecord[] = [
    { name: "Name", symbol: "Name", value: "n-butane", unit: "" },
    { name: "Formula", symbol: "Formula", value: "C4H10", unit: "" },
    { name: "State", symbol: "State", value: "g", unit: "" },
    { name: "Tc", symbol: "Tc", value: 425.12, unit: "K" },
    { name: "Pc", symbol: "Pc", value: 3.796e6, unit: "Pa" },
    { name: "AcFa", symbol: "AcFa", value: 0.2002, unit: "-" },
    { name: "C1", symbol: "C1", value: 66.343, unit: "-" },
    { name: "C2", symbol: "C2", value: -4363.2, unit: "-" },
    { name: "C3", symbol: "C3", value: -7.046, unit: "-" },
    { name: "C4", symbol: "C4", value: 9.45e-6, unit: "-" },
    { name: "C5", symbol: "C5", value: 2, unit: "-" }
];

const eqTemplate = createEq(params, args, ret, dippr101, "Liquid Vapor Pressure (DIPPR 101)");
const modelSource = {
    dataSource: buildComponentsData(components, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State"),
    equationSource: buildComponentsEquation(components, eqTemplate, [co2Records, nButaneRecords], ["Name-State"], true, "Name-State")
};

const pressure = { value: 10, unit: "bar" } as const;
const temperature = { value: 444, unit: "K" } as const;
const solver_method = "qr" as const;
const solver_options = {
    qr: {
        max_iter: 300,
        tol: 1e-12,
        polish_newton: true
    }
};

const roots = checkMultiComponentEosRoots(
    components,
    pressure,
    temperature,
    modelSource,
    "RK",
    "Raoult",
    "Raoult",
    "Name-State"
);

const fugacity = calcMixtureFugacity(
    components,
    pressure,
    temperature,
    modelSource,
    "RK",
    "Name-State",
    {
        phase: "VAPOR",
        solver_method,
        solver_options
    }
);

console.log("Roots:");
console.log(JSON.stringify(roots, null, 2));
console.log("Fugacity (VAPOR):");
console.log(JSON.stringify(fugacity, null, 2));
