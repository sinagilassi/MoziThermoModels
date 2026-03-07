# MoziThermoModels 🧪

[![npm version](https://badge.fury.io/js/mozithermomodels.svg)](https://badge.fury.io/js/mozithermomodels)
[![npm downloads](https://img.shields.io/npm/dm/mozithermomodels?color=brightgreen)](https://www.npmjs.com/package/mozithermomodels)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

TypeScript thermodynamic models for **EOS fugacity/root analysis** and **activity-coefficient modeling**.

Built to work with `mozithermodb` model sources and component data workflows. 🚀

## ✨ Features

- EOS models: `SRK`, `PR`, `RK`, `vdW`
- Single-component fugacity:
  - `calcFugacity({ ... })` (auto phase orchestration for pure components)
  - `calcGasFugacity(...)`
  - `calcLiquidFugacity(...)`
- Mixture fugacity:
  - `calcMixtureFugacity(...)`
- EOS root diagnostics:
  - `checkComponentEosRoots(...)`
  - `checkMultiComponentEosRoots(...)`
- Activity models:
  - `calcActivityCoefficientUsingNrtlModel(...)`
  - `calcActivityCoefficientUsingUniquacModel(...)`
  - `calcActivityCoefficient(...)` (auto-parameter extraction from `modelSource`)
- Activity parameter utilities:
  - `calcTauIjWithDgIjUsingNrtlModel(...)`
  - `calcTauIjWithDUijUsingUniquacModel(...)`
  - `calcTauIjByCoefficients(...)`
- Re-exported MoziThermoDB building helpers (`buildComponentData`, `buildComponentsData`, `buildComponentEquation`, `buildComponentsEquation`, `Source`, `mkdt`, `mkeq`, `mkeqs`)

## 📝 Installation

```bash
npm install mozithermomodels
```

## ✨ Supported Models

### EOS models

- `SRK`
- `PR`
- `RK`
- `vdW`

### Activity models

- `NRTL`
- `UNIQUAC`
- `UNIFAC` (available via `ActivityCore` / `activities(...)` selection API)

## ✨ Quick Start (EOS: Single Component Gas Fugacity)

```ts
import { calcGasFugacity } from "mozithermomodels";
import { buildComponentData, buildComponentEquation } from "mozithermodb";

// Define your equation template + component records first (same pattern as examples/eos-single-gas.ts)
const component = { name: "propane", formula: "C3H8", state: "g", mole_fraction: 1 };

const modelSource = {
  dataSource: buildComponentData(component as any, records as any, ["Name-State"], true, "Name-State"),
  equationSource: buildComponentEquation(component as any, eqTemplate as any, records as any, ["Name-State"], true, "Name-State")
};

const result = calcGasFugacity(
  component as any,
  { value: 9.99, unit: "bar" },
  { value: 300.1, unit: "K" },
  modelSource,
  "PR"
);

console.log(result);
```

For a full runnable file, see `examples/eos-single-gas.ts`.

## ✨ Quick Start (EOS: Pure Component Auto Fugacity)

```ts
import { calcFugacity } from "mozithermomodels";

const result = calcFugacity({
  component,
  pressure: { value: 10, unit: "bar" },
  temperature: { value: 300.1, unit: "K" },
  modelSource,
  modelName: "PR",
  phaseMode: "auto",
  solverMethod: "ls"
});

console.log(result.results);
```

`phaseMode` supports `"auto" | "gas" | "liquid" | "both"`.

## ✨ Quick Start (EOS: Mixture Fugacity)

```ts
import { calcMixtureFugacity } from "mozithermomodels";

const result = calcMixtureFugacity(
  components,
  { value: 10, unit: "bar" },
  { value: 444, unit: "K" },
  modelSource,
  "RK"
);

console.log(result);
```

See `examples/eos-mixture.ts` for the complete setup with `createEq(...)`, data records, and source builders.

## ✨ Quick Start (Activity Coefficients)

### NRTL direct parameters

```ts
import { calcActivityCoefficientUsingNrtlModel } from "mozithermomodels";

const [gamma] = calcActivityCoefficientUsingNrtlModel(
  components,
  { value: 30, unit: "bar" },
  { value: 323.15, unit: "K" },
  tau_ij,
  alpha_ij
);

console.log(gamma);
```

See `examples/activity-nrtl.ts`.

### UNIQUAC direct parameters

```ts
import { calcActivityCoefficientUsingUniquacModel } from "mozithermomodels";

const [gamma] = calcActivityCoefficientUsingUniquacModel(
  components,
  { value: 1, unit: "bar" },
  { value: 298.15, unit: "K" },
  tau_ij,
  r_i,
  q_i
);

console.log(gamma);
```

See `examples/activity-uniquac.ts`.

### Extract from `modelSource`

`calcActivityCoefficient(...)` can extract `tau/alpha` (NRTL) and `tau/r_i/q_i` (UNIQUAC) from a prepared `modelSource.dataSource` mixture/component structure.

See:

- `examples/extract-activity-data.ts`
- `examples/activity-uniquac-extract-data.ts`

## ✨ Model Source Shape

Most EOS and unified activity APIs expect:

```ts
const modelSource = {
  dataSource: { /* component + mixture data nodes */ },
  equationSource: { /* equation nodes */ }
};
```

Notes:

- High-level wrappers validate units using `mozicuc` converters.
- Common component key pattern in examples: `"Name-State"`.
- Mixture keys commonly use `"Name"` + `"|"` delimiter (e.g. `ethanol|water`).

## ✨ High-Level App API

You can also use app-style wrappers:

- `init()` -> returns `ThermoModelCore`
- `eos(kwargs)` -> EOS entrypoint
- `activity(args)` -> returns `ActivityCore`
- `activities(args)` -> returns selected model (`NRTL`, `UNIQUAC`, or `UNIFAC`)

Runtime metadata:

- `eos.metadata` -> `['SRK', 'PR', 'RK', 'vdW']`
- `activity.metadata` / `activities.metadata` -> `['NRTL', 'UNIQUAC', 'UNIFAC']`

## 📚 Examples

- EOS single-component gas fugacity: `examples/eos-single-gas.ts`
- EOS single-component liquid fugacity: `examples/eos-single-liquid.ts`
- EOS pure-component auto/phase-mode fugacity: `examples/eos/eos-calc-fugacity.ts`
- EOS pure-component fugacity aliases: `examples/eos/eos-calc-fugacity-aliases.ts`
- EOS mixture fugacity: `examples/eos-mixture.ts`
- EOS single-component roots: `examples/eos-root-single.ts`
- EOS mixture roots: `examples/eos-root-mixture.ts`
- Activity (NRTL): `examples/activity-nrtl.ts`
- Activity (UNIQUAC): `examples/activity-uniquac.ts`
- Activity parameter extraction: `examples/extract-activity-data.ts`
- UNIQUAC extraction with component vectors: `examples/activity-uniquac-extract-data.ts`

## 🏃 Run Examples

From project root:

```bash
npx tsx examples/eos-single-gas.ts
npx tsx examples/eos-mixture.ts
npx tsx examples/activity-nrtl.ts
```

## ✨ API Naming

Both camelCase and snake_case aliases are available for many APIs (for Python-style compatibility), for example:

- `calcGasFugacity` and `calc_gas_fugacity`
- `calcFugacity` and `calc_fugacity`
- `checkComponentEosRoots` and `check_component_eos_roots`
- `calcActivityCoefficient` and `calc_activity_coefficient`

## 📄 License

Licensed under the Apache-2.0 License. See `LICENSE`.

## ❓ FAQ

For questions, contact Sina Gilassi on [LinkedIn](https://www.linkedin.com/in/sina-gilassi/).

## 👨‍💻 Author

- [@sinagilassi](https://github.com/sinagilassi)
