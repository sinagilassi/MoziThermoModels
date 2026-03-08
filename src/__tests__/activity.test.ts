import { describe, expect, it } from "vitest";
import {
  buildBinaryMixtureData,
  calcActivityCoefficient,
  calcActivityCoefficientUsingNrtlModel,
  calcActivityCoefficientUsingUnifacModel,
  calcActivityCoefficientUsingUniquacModel,
  MoziMatrixData,
  UNIFAC
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
  const unifacGroupData = {
    "1": { main_group: 1, name: "CH3", R: 0.9011, Q: 0.848 },
    "2": { main_group: 1, name: "CH2", R: 0.6744, Q: 0.54 },
    "18": { main_group: 9, name: "CH3CO", R: 1.6724, Q: 1.488 }
  };
  const unifacInteractionData = {
    "1": { "1": 0, "9": 476.4 },
    "9": { "1": 26.76, "9": 0 }
  };

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

  it("UNIFAC direct model workflow computes gamma using group-name component groups", () => {
    const model = new UNIFAC(["acetone-l", "n_heptane-l"]);
    model.load_data(unifacGroupData as any, unifacInteractionData as any);
    model.set_component_groups({
      "acetone-l": { CH3: 1, CH3CO: 1 },
      "n_heptane-l": { CH3: 2, CH2: 3 }
    });

    const [res, other] = model.cal({
      mole_fraction: { "acetone-l": 0.047, "n_heptane-l": 0.953 },
      temperature: [307, "K"]
    });

    expect(Object.values(res.value).every((v) => v > 0)).toBe(true);
    expect(res.value["acetone-l"]).toBeGreaterThan(res.value["n_heptane-l"]);
    expect((other as any).calculation_mode).toBe("UNIFAC");
  });

  it("UNIFAC direct model workflow supports subgroup-id component groups", () => {
    const model = new UNIFAC(["acetone-l", "n_heptane-l"]);
    model.load_data(unifacGroupData as any, unifacInteractionData as any);
    model.set_component_groups({
      "acetone-l": { "1": 1, "18": 1 },
      "n_heptane-l": { "1": 2, "2": 3 }
    });

    const [res] = model.cal({
      mole_fraction: { "acetone-l": 0.047, "n_heptane-l": 0.953 },
      temperature: [307, "K"]
    });

    expect(Object.values(res.value).every((v) => v > 0)).toBe(true);
  });

  it("UNIFAC direct model workflow uses main-group interaction directionality", () => {
    const model = new UNIFAC(["comp_a-l", "comp_b-l"]);
    model.load_data(
      {
        "101": { main_group: 1, name: "GA", R: 1, Q: 1 },
        "202": { main_group: 2, name: "GB", R: 1, Q: 1 }
      } as any,
      {
        "1": { "1": 0, "2": 900 },
        "2": { "1": 0, "2": 0 }
      } as any
    );
    model.set_component_groups({
      "comp_a-l": { "101": 1 },
      "comp_b-l": { "202": 1 }
    });

    const [res] = model.cal({
      mole_fraction: { "comp_a-l": 0.5, "comp_b-l": 0.5 },
      temperature: [298.15, "K"]
    });

    expect(Math.abs(res.value["comp_a-l"] - res.value["comp_b-l"])).toBeGreaterThan(1e-8);
  });

  it("calcActivityCoefficient rejects UNIFAC model name", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "acetone", formula: "C3H6O", state: "l", mole_fraction: 0.047 },
      { name: "n_heptane", formula: "C7H16", state: "l", mole_fraction: 0.953 }
    ];

    expect(() =>
      calcActivityCoefficient(
        components,
        { value: 1, unit: "bar" },
        { value: 307, unit: "K" },
        { dataSource: {}, equationSource: {} } as any,
        "UNIFAC" as any
      )
    ).toThrowError(/Unsupported activity model: UNIFAC/);
  });

  it("calcActivityCoefficientUsingUnifacModel computes gamma with explicit group datasets", () => {
    const components: Array<{ name: string; formula: string; state: "l"; mole_fraction: number }> = [
      { name: "acetone", formula: "C3H6O", state: "l", mole_fraction: 0.047 },
      { name: "n_heptane", formula: "C7H16", state: "l", mole_fraction: 0.953 }
    ];

    const [res, other] = calcActivityCoefficientUsingUnifacModel(
      components,
      { value: 1, unit: "bar" },
      { value: 307, unit: "K" },
      unifacGroupData as any,
      unifacInteractionData as any,
      {
        "acetone-l": { CH3: 1, CH3CO: 1 },
        "n_heptane-l": { CH3: 2, CH2: 3 }
      },
      "Name-State",
      "Name",
      "-",
      "|"
    );

    expect(Object.values(res.value).every((v) => v > 0)).toBe(true);
    expect((other as any).calculation_mode).toBe("UNIFAC");
  });
});
