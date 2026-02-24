// ! MoziThermoModels
import { calcActivityCoefficientUsingNrtlModel } from "../src";

const components = [
  { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
  { name: "butyl-methyl-ether", formula: "C5H12O", state: "l", mole_fraction: 0.6 }
];

const tau_ij = {
  "ethanol | ethanol": 0,
  "ethanol | butyl-methyl-ether": 1.21670526,
  "butyl-methyl-ether | ethanol": 0.65831047,
  "butyl-methyl-ether | butyl-methyl-ether": 0
};

const alpha_ij = {
  "ethanol | ethanol": 0,
  "ethanol | butyl-methyl-ether": 0.680715,
  "butyl-methyl-ether | ethanol": 0.680715,
  "butyl-methyl-ether | butyl-methyl-ether": 0
};

console.log(calcActivityCoefficientUsingNrtlModel(
  components,
  { value: 30, unit: "bar" },
  { value: 323.15, unit: "K" },
  tau_ij,
  alpha_ij
));
