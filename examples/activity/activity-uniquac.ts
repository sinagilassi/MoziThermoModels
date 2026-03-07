// ! MoziThermoModels
import { calcActivityCoefficientUsingUniquacModel } from "../../src";

console.log(calcActivityCoefficientUsingUniquacModel(
  [
    { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
    { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
  ],
  { value: 1, unit: "bar" },
  { value: 298.15, unit: "K" },
  {
    "ethanol | ethanol": 1,
    "ethanol | water": 0.8,
    "water | ethanol": 1.2,
    "water | water": 1
  },
  { ethanol: 2.1055, water: 0.92 },
  { ethanol: 1.972, water: 1.4 }
));
