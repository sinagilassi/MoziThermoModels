import { describe, expect, it } from "vitest";
import { calcActivityCoefficientUsingNrtlModel, calcActivityCoefficientUsingUniquacModel } from "../index";

describe("activity", () => {
  it("nrtl returns positive gamma values", () => {
    const [res] = calcActivityCoefficientUsingNrtlModel(
      [
        { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
        { name: "bme", formula: "C5H12O", state: "l", mole_fraction: 0.6 }
      ],
      { value: 1, unit: "bar" },
      { value: 323.15, unit: "K" },
      {
        "ethanol | ethanol": 0,
        "ethanol | bme": 1.1,
        "bme | ethanol": 0.7,
        "bme | bme": 0
      },
      {
        "ethanol | ethanol": 0,
        "ethanol | bme": 0.3,
        "bme | ethanol": 0.3,
        "bme | bme": 0
      }
    );
    expect(Object.values(res.value).every((v) => v > 0)).toBe(true);
  });

  it("uniquac returns component keys", () => {
    const [res] = calcActivityCoefficientUsingUniquacModel(
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
    );
    expect(Object.keys(res.value)).toContain("ethanol");
  });
});
