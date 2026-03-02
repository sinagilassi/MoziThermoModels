import { describe, expect, it } from "vitest";
import {
  buildBinaryMixtureData,
  calcActivityCoefficient,
  calcActivityCoefficientUsingNrtlModel,
  calcActivityCoefficientUsingUniquacModel,
  MoziMatrixData
} from "../index";

function buildMatrixRows(
  prefix: string,
  aName: string,
  bName: string,
  values: [number, number, number, number],
  style: "i_j" | "ij" = "i_j"
) {
  const [a11, a12, a21, a22] = values;
  const sfx = style === "ij" ? "_ij_" : "_i_j_";
  return [
    [
      { name: "Mixture", symbol: "-", value: `${aName}|${bName}`, unit: "N/A" },
      { name: "Name", symbol: "-", value: aName, unit: "N/A" },
      { name: `${prefix}${sfx}1`, symbol: `${prefix}${sfx}1`, value: a11, unit: "1" },
      { name: `${prefix}${sfx}2`, symbol: `${prefix}${sfx}2`, value: a12, unit: "1" }
    ],
    [
      { name: "Mixture", symbol: "-", value: `${aName}|${bName}`, unit: "N/A" },
      { name: "Name", symbol: "-", value: bName, unit: "N/A" },
      { name: `${prefix}${sfx}1`, symbol: `${prefix}${sfx}1`, value: a21, unit: "1" },
      { name: `${prefix}${sfx}2`, symbol: `${prefix}${sfx}2`, value: a22, unit: "1" }
    ]
  ];
}

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
    expect(Object.keys(res.value)).toContain("ethanol-l");
  });

  it("calcActivityCoefficient NRTL reads tau_ij and alpha_ij from mozimatrixdata wrappers", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        " Ethanol | Water ": {
          tau_ij: { mozimatrixdata: buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) },
          alpha_ij: { mozimatrixdata: buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]) }
        }
      },
      equationSource: {}
    };

    const [res, other] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "NRTL"
    );

    expect(Object.values(res.value).every((v) => v > 0)).toBe(true);
    expect((other as any).tau_ij_comp["ethanol | water"]).toBeCloseTo(0.8, 10);
    expect((other as any).alpha_ij_comp["water | ethanol"]).toBeCloseTo(0.3, 10);
  });

  it("calcActivityCoefficient UNIQUAC supports tau_ij from mozimatrixdata with plain r_i and q_i", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        "ETHANOL|WATER": {
          tau_ij: { mozimatrixdata: buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) },
          r_i: { "ethanol-l": 2.1055, "water-l": 0.92 },
          q_i: { "ethanol-l": 1.972, "water-l": 1.4 }
        }
      },
      equationSource: {}
    };

    const [res] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "UNIQUAC"
    );

    expect(Object.keys(res.value)).toContain("ethanol-l");
  });

  it("calcActivityCoefficient NRTL supports direct MoziMatrixData node extraction via matDict", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];
    const tau = new MoziMatrixData(buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) as any);
    tau.analyzeRawData();

    const modelSource = {
      dataSource: {
        "ethanol|water": {
          tau,
          alpha_ij: { mozimatrixdata: buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]) }
        }
      },
      equationSource: {}
    };

    const [, other] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "NRTL"
    );

    expect((other as any).tau_ij_comp["ethanol | water"]).toBeCloseTo(0.8, 10);
    expect((other as any).tau_ij_comp["water | ethanol"]).toBeCloseTo(1.2, 10);
  });

  it("calcActivityCoefficient UNIQUAC fails strict vector lookup when r_i/q_i keys do not match componentKey", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        "ETHANOL|WATER": {
          tau_ij: { mozimatrixdata: buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) },
          r_i: { ethanol: 2.1055, water: 0.92 },
          q_i: { ethanol: 1.972, water: 1.4 }
        }
      },
      equationSource: {}
    };

    expect(() =>
      calcActivityCoefficient(
        components,
        { value: 1, unit: "bar" },
        { value: 298.15, unit: "K" },
        modelSource as any,
        "UNIQUAC"
      )
    ).toThrowError(/UNIQUAC requires tau_ij\+r_i\+q_i/);
  });

  it("calcActivityCoefficient UNIQUAC vector lookup succeeds with componentKey Name for Name-keyed r_i/q_i", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        "ETHANOL|WATER": {
          tau_ij: { mozimatrixdata: buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) },
          r_i: { ethanol: 2.1055, water: 0.92 },
          q_i: { ethanol: 1.972, water: 1.4 }
        }
      },
      equationSource: {}
    };

    const [res] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "UNIQUAC",
      "Name",
      "Name",
      "-",
      "|"
    );

    expect(Object.keys(res.value)).toContain("ethanol");
  });

  it("calcActivityCoefficient UNIQUAC supports direct matrix source node from buildBinaryMixtureData", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const binary = buildBinaryMixtureData(components as any, buildMatrixRows("tau", "ethanol", "water", [1, 0.8, 1.2, 1]) as any) as any;
    const mixtureNode = binary["ethanol|water"] ?? binary["water|ethanol"];
    const tauSource = mixtureNode["tau"] ?? mixtureNode["tau_ij"];

    const modelSource = {
      dataSource: {
        "ethanol|water": {
          tau: tauSource,
          r_i: { "ethanol-l": 2.1055, "water-l": 0.92 },
          q_i: { "ethanol-l": 1.972, "water-l": 1.4 }
        }
      },
      equationSource: {}
    };

    const [res] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "UNIQUAC"
    );

    expect(Object.keys(res.value)).toContain("ethanol-l");
  });

  it("calcActivityCoefficient resolves reverse mixture ids and preserves directional tau mapping", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 },
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 }
    ];

    const modelSource = {
      dataSource: {
        "ethanol|water": {
          tau_ij: { mozimatrixdata: buildMatrixRows("tau", "ethanol", "water", [11, 22, 33, 44]) },
          alpha_ij: { mozimatrixdata: buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]) }
        }
      },
      equationSource: {}
    };

    const [, other] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "NRTL"
    );

    expect((other as any).tau_ij_comp["ethanol | water"]).toBeCloseTo(22, 10);
    expect((other as any).tau_ij_comp["water | ethanol"]).toBeCloseTo(33, 10);
  });

  it("calcActivityCoefficient supports normalized matrix param keys and _ij row fields", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        "ethanol|water": {
          tau_i_j: { mozimatrixdata: buildMatrixRows("TaU", "ethanol", "water", [1, 2, 3, 4], "ij") },
          alpha: { mozimatrixdata: buildMatrixRows("AlPhA", "ethanol", "water", [0, 0.3, 0.3, 0], "ij") }
        }
      },
      equationSource: {}
    };

    const [, other] = calcActivityCoefficient(
      components,
      { value: 1, unit: "bar" },
      { value: 298.15, unit: "K" },
      modelSource as any,
      "NRTL"
    );

    expect((other as any).tau_ij_comp["ethanol | water"]).toBeCloseTo(2, 10);
    expect((other as any).tau_ij_comp["water | ethanol"]).toBeCloseTo(3, 10);
  });

  it("calcActivityCoefficient throws INVALID_ACTIVITY_INPUT for malformed mozimatrixdata", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "ethanol", formula: "C2H5OH", state: "l", mole_fraction: 0.4 },
      { name: "water", formula: "H2O", state: "l", mole_fraction: 0.6 }
    ];

    const modelSource = {
      dataSource: {
        "ethanol|water": {
          tau_ij: {
            mozimatrixdata: [
              [
                { name: "Name", symbol: "-", value: "ethanol", unit: "N/A" },
                { name: "tau_i_j_1", symbol: "tau_i_j_1", value: 1, unit: "1" }
              ],
              [
                { name: "Name", symbol: "-", value: "water", unit: "N/A" },
                { name: "tau_i_j_1", symbol: "tau_i_j_1", value: 1.2, unit: "1" }
              ]
            ]
          },
          alpha_ij: { mozimatrixdata: buildMatrixRows("alpha", "ethanol", "water", [0, 0.3, 0.3, 0]) }
        }
      },
      equationSource: {}
    };

    try {
      calcActivityCoefficient(
        components,
        { value: 1, unit: "bar" },
        { value: 298.15, unit: "K" },
        modelSource as any,
        "NRTL"
      );
      expect.fail("expected INVALID_ACTIVITY_INPUT");
    } catch (error) {
      expect((error as any).code).toBe("INVALID_ACTIVITY_INPUT");
    }
  });
});
