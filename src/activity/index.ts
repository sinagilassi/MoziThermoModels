import type {
  ActivityCoefficientResult,
  ComponentLike,
  ExcessGibbsResult,
  MixtureKey,
  ModelSource
} from "../types";
import { createMixtureId, setComponentId, ThermoModelError } from "../core";

const R = 8.314462618;

function normalizeComponents(components: ComponentLike[]) {
  const names = components.map((c) => setComponentId(c, "Name"));
  const xPairs = components.map((c, i) => [names[i], Number(c.mole_fraction ?? c.moleFraction ?? 0)] as const);
  let sum = xPairs.reduce((s, [, x]) => s + x, 0);
  if (!(sum > 0)) sum = 1;
  const moleFraction = Object.fromEntries(xPairs.map(([k, x]) => [k, x / sum]));
  return { names, moleFraction };
}

function generalExcessMolarGibbsFreeEnergy(
  mole_fraction: Record<string, number> | number[],
  activity_coefficients: Record<string, number> | number[],
  message?: string
): ExcessGibbsResult {
  let names: string[];
  let x: number[];
  let gamma: number[];
  if (Array.isArray(mole_fraction) && Array.isArray(activity_coefficients)) {
    names = mole_fraction.map((_, i) => `component_${i + 1}`);
    x = mole_fraction;
    gamma = activity_coefficients;
  } else if (!Array.isArray(mole_fraction) && !Array.isArray(activity_coefficients)) {
    names = Object.keys(mole_fraction);
    x = names.map((k) => mole_fraction[k]);
    gamma = names.map((k) => activity_coefficients[k]);
  } else if (!Array.isArray(mole_fraction) && Array.isArray(activity_coefficients)) {
    names = Object.keys(mole_fraction);
    x = names.map((k) => mole_fraction[k]);
    gamma = activity_coefficients;
  } else {
    names = Object.keys(activity_coefficients as Record<string, number>);
    x = mole_fraction as number[];
    gamma = names.map((k) => (activity_coefficients as Record<string, number>)[k]);
  }
  const value = x.reduce((s, xi, i) => s + xi * Math.log(Math.max(gamma[i], 1e-15)), 0);
  return {
    property_name: "Excess Molar Gibbs Free Energy (G^E/RT)",
    components: names,
    mole_fraction,
    value,
    unit: "dimensionless",
    symbol: "ExMoGiFrEn",
    message: message ?? "General excess Gibbs free energy",
    activity_coefficients
  };
}

function toMatrixFromPairDict(components: string[], data: Record<string, number>, delimiter = "|"): number[][] {
  const idx = new Map(components.map((c, i) => [c, i] as const));
  const out = Array.from({ length: components.length }, () => Array.from({ length: components.length }, () => 0));
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split(delimiter).map((x) => x.trim());
    if (parts.length !== 2) continue;
    const i = idx.get(parts[0]);
    const j = idx.get(parts[1]);
    if (i == null || j == null) continue;
    out[i][j] = Number(v);
  }
  return out;
}

function toPairDict(components: string[], matrix: number[][], delimiter = "|"): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < components.length; i++) {
    for (let j = 0; j < components.length; j++) {
      out[`${components[i]} ${delimiter} ${components[j]}`] = Number(matrix[i][j]);
    }
  }
  return out;
}

function toVectorFromDict(components: string[], data: Record<string, number>): number[] {
  return components.map((c) => Number(data[c] ?? 0));
}

function toVectorDict(components: string[], values: number[]): Record<string, number> {
  return Object.fromEntries(components.map((c, i) => [c, Number(values[i])]));
}

export class NRTL {
  constructor(public readonly components: string[]) {}

  parseModelInputs(modelInputs: string): Record<string, unknown> {
    try { return JSON.parse(modelInputs); } catch { return {}; }
  }

  cal_dg_ij_M1(temperature: number, tau_ij: Record<string, number>) {
    const tau = toMatrixFromPairDict(this.components, tau_ij);
    const dg = tau.map((row) => row.map((v) => v * R * temperature));
    return [dg, toPairDict(this.components, dg)] as const;
  }

  cal_tau_ij_M1(temperature: number, dg_ij: Record<string, number>) {
    const dg = toMatrixFromPairDict(this.components, dg_ij);
    const tau = dg.map((row) => row.map((v) => v / (R * temperature)));
    return [tau, toPairDict(this.components, tau)] as const;
  }

  cal_G_ij(tau_ij: number[][], alpha_ij: number[][]) {
    return tau_ij.map((row, i) => row.map((tau, j) => Math.exp(-alpha_ij[i][j] * tau)));
  }

  cal(
    model_input: { mole_fraction: Record<string, number>; tau_ij: Record<string, number> | number[][]; alpha_ij: Record<string, number> | number[][] },
    message = "Calculating activity coefficient using NRTL model"
  ): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
    const n = this.components.length;
    const x = this.components.map((c) => Number(model_input.mole_fraction[c] ?? 0));
    const tau = Array.isArray(model_input.tau_ij) ? model_input.tau_ij : toMatrixFromPairDict(this.components, model_input.tau_ij);
    const alpha = Array.isArray(model_input.alpha_ij) ? model_input.alpha_ij : toMatrixFromPairDict(this.components, model_input.alpha_ij);
    const G = this.cal_G_ij(tau, alpha);
    const lnGamma = Array.from({ length: n }, () => 0);

    for (let i = 0; i < n; i++) {
      let num = 0;
      let den = 0;
      for (let j = 0; j < n; j++) {
        num += x[j] * tau[j][i] * G[j][i];
        den += x[j] * G[j][i];
      }
      let term2 = 0;
      for (let j = 0; j < n; j++) {
        let numJ = 0;
        let denJ = 0;
        for (let k = 0; k < n; k++) {
          numJ += x[k] * tau[k][j] * G[k][j];
          denJ += x[k] * G[k][j];
        }
        term2 += (x[j] * G[i][j] / Math.max(denJ, 1e-15)) * (tau[i][j] - numJ / Math.max(denJ, 1e-15));
      }
      lnGamma[i] = num / Math.max(den, 1e-15) + term2;
    }

    const gamma = lnGamma.map((v) => Math.exp(v));
    const value = toVectorDict(this.components, gamma);
    const result: ActivityCoefficientResult = {
      property_name: "Activity Coefficient",
      components: [...this.components],
      mole_fraction: model_input.mole_fraction,
      value,
      unit: "dimensionless",
      symbol: "AcCo_i",
      message
    };
    const others = {
      AcCo_i_comp: value,
      tau_ij: tau,
      tau_ij_comp: toPairDict(this.components, tau),
      alpha_ij: alpha,
      alpha_ij_comp: toPairDict(this.components, alpha),
      G_ij: G,
      G_ij_comp: toPairDict(this.components, G),
      calculation_mode: "NRTL"
    };
    return [result, others, this.excess_gibbs_free_energy(model_input.mole_fraction, value)];
  }

  excess_gibbs_free_energy(mole_fraction: Record<string, number>, activity_coefficients: Record<string, number>) {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, "NRTL excess Gibbs free energy");
  }
}

export class UNIQUAC {
  constructor(public readonly components: string[], private readonly coordinationNumber = 10) {}

  parseModelInputs(modelInputs: string): Record<string, unknown> {
    try { return JSON.parse(modelInputs); } catch { return {}; }
  }

  cal_dU_ij_M1(temperature: number, tau_ij: Record<string, number>) {
    const tau = toMatrixFromPairDict(this.components, tau_ij);
    const dU = tau.map((row) => row.map((v) => -Math.log(Math.max(v, 1e-30)) * R * temperature));
    return [dU, toPairDict(this.components, dU)] as const;
  }

  cal_tau_ij_M1(temperature: number, dU_ij: Record<string, number>) {
    const dU = toMatrixFromPairDict(this.components, dU_ij);
    const tau = dU.map((row) => row.map((v) => Math.exp(-v / (R * temperature))));
    return [tau, toPairDict(this.components, tau)] as const;
  }

  cal(
    model_input: { mole_fraction: Record<string, number>; tau_ij: Record<string, number> | number[][]; r_i: Record<string, number> | number[]; q_i: Record<string, number> | number[] },
    message = "Calculating activity coefficient using UNIQUAC model"
  ): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
    const n = this.components.length;
    const x = this.components.map((c) => Number(model_input.mole_fraction[c] ?? 0));
    const tau = Array.isArray(model_input.tau_ij) ? model_input.tau_ij : toMatrixFromPairDict(this.components, model_input.tau_ij);
    const r = Array.isArray(model_input.r_i) ? model_input.r_i.map(Number) : toVectorFromDict(this.components, model_input.r_i);
    const q = Array.isArray(model_input.q_i) ? model_input.q_i.map(Number) : toVectorFromDict(this.components, model_input.q_i);
    const z = this.coordinationNumber;

    const sumRx = x.reduce((s, xi, i) => s + xi * r[i], 0);
    const sumQx = x.reduce((s, xi, i) => s + xi * q[i], 0);
    const Phi = x.map((xi, i) => (xi * r[i]) / Math.max(sumRx, 1e-15));
    const Theta = x.map((xi, i) => (xi * q[i]) / Math.max(sumQx, 1e-15));
    const l = r.map((ri, i) => (z / 2) * (ri - q[i]) - (ri - 1));
    const sumXl = x.reduce((s, xi, i) => s + xi * l[i], 0);

    const lnGammaC = Array.from({ length: n }, (_, i) =>
      Math.log(Math.max(Phi[i] / Math.max(x[i], 1e-30), 1e-30)) +
      (z / 2) * q[i] * Math.log(Math.max(Theta[i] / Math.max(Phi[i], 1e-30), 1e-30)) +
      l[i] - (Phi[i] / Math.max(x[i], 1e-30)) * sumXl
    );

    const lnGammaR = Array.from({ length: n }, () => 0);
    for (let i = 0; i < n; i++) {
      const s1 = Array.from({ length: n }, (_, j) => Theta[j] * tau[j][i]).reduce((a, b) => a + b, 0);
      let s2 = 0;
      for (let j = 0; j < n; j++) {
        const den = Array.from({ length: n }, (_, k) => Theta[k] * tau[k][j]).reduce((a, b) => a + b, 0);
        s2 += (Theta[j] * tau[i][j]) / Math.max(den, 1e-15);
      }
      lnGammaR[i] = q[i] * (1 - Math.log(Math.max(s1, 1e-30)) - s2);
    }

    const gamma = lnGammaC.map((v, i) => Math.exp(v + lnGammaR[i]));
    const value = toVectorDict(this.components, gamma);
    const result: ActivityCoefficientResult = {
      property_name: "Activity Coefficient",
      components: [...this.components],
      mole_fraction: model_input.mole_fraction,
      value,
      unit: "dimensionless",
      symbol: "AcCo_i",
      message
    };
    const others = {
      AcCo_i_comp: value,
      tau_ij: tau,
      tau_ij_comp: toPairDict(this.components, tau),
      r_i: r,
      r_i_comp: toVectorDict(this.components, r),
      q_i: q,
      q_i_comp: toVectorDict(this.components, q),
      calculation_mode: "UNIQUAC"
    };
    return [result, others, this.excess_gibbs_free_energy(model_input.mole_fraction, value)];
  }

  excess_gibbs_free_energy(mole_fraction: Record<string, number>, activity_coefficients: Record<string, number>) {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, "UNIQUAC excess Gibbs free energy");
  }
}

export function calcDgIjUsingNrtlModel(
  temperature: { value: number; unit: string } | number,
  tau_ij: Record<string, number>,
  components: string[]
) {
  const T = typeof temperature === "number" ? temperature : temperature.value;
  const model = new NRTL(components);
  const [dG_ij, dG_ij_comp] = model.cal_dg_ij_M1(T, tau_ij);
  return { dG_ij, dG_ij_comp };
}

export function calcTauIjWithDgIjUsingNrtlModel(
  temperature: { value: number; unit: string } | number,
  dg_ij: Record<string, number>,
  components: string[]
) {
  const T = typeof temperature === "number" ? temperature : temperature.value;
  const model = new NRTL(components);
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(T, dg_ij);
  return { tau_ij, tau_ij_comp };
}

export function calcDUijUsingUniquacModel(
  temperature: { value: number; unit: string } | number,
  tau_ij: Record<string, number>,
  components: string[]
) {
  const T = typeof temperature === "number" ? temperature : temperature.value;
  const model = new UNIQUAC(components);
  const [dU_ij, dU_ij_comp] = model.cal_dU_ij_M1(T, tau_ij);
  return { dU_ij, dU_ij_comp };
}

export function calcTauIjWithDUijUsingUniquacModel(
  temperature: { value: number; unit: string } | number,
  dU_ij: Record<string, number>,
  components: string[]
) {
  const T = typeof temperature === "number" ? temperature : temperature.value;
  const model = new UNIQUAC(components);
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(T, dU_ij);
  return { tau_ij, tau_ij_comp };
}

export function calcTauIj(args: {
  modelName: "NRTL" | "UNIQUAC";
  temperature: number;
  dg_ij?: Record<string, number>;
  dU_ij?: Record<string, number>;
  components: string[];
}) {
  if (args.modelName === "NRTL") {
    if (!args.dg_ij) throw new ThermoModelError("dg_ij is required for NRTL", "INVALID_ACTIVITY_INPUT");
    return calcTauIjWithDgIjUsingNrtlModel(args.temperature, args.dg_ij, args.components);
  }
  if (!args.dU_ij) throw new ThermoModelError("dU_ij is required for UNIQUAC", "INVALID_ACTIVITY_INPUT");
  return calcTauIjWithDUijUsingUniquacModel(args.temperature, args.dU_ij, args.components);
}

export function calcActivityCoefficientUsingNrtlModel(
  components: ComponentLike[],
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  tau_ij: Record<string, number>,
  alpha_ij: Record<string, number>,
  componentKey: "Name-State" | "Formula-State" = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  void pressure;
  void temperature;
  void componentKey;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components);
  const model = new NRTL(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, alpha_ij }, message);
}

export function calcActivityCoefficientUsingUniquacModel(
  components: ComponentLike[],
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  tau_ij: Record<string, number>,
  r_i: Record<string, number>,
  q_i: Record<string, number>,
  componentKey: "Name-State" | "Formula-State" = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  void pressure;
  void temperature;
  void componentKey;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components);
  const model = new UNIQUAC(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, r_i, q_i }, message);
}

function maybeExtractActivityParams(
  modelSource: ModelSource,
  mixtureId: string,
  keys: string[]
): Record<string, number> | undefined {
  const data = modelSource.dataSource as Record<string, unknown> | undefined;
  if (!data) return undefined;
  const node = data[mixtureId] as Record<string, unknown> | undefined;
  if (!node || typeof node !== "object") return undefined;
  for (const k of keys) {
    const key = Object.keys(node).find((x) => x.toLowerCase() === k.toLowerCase());
    const v = key ? node[key] : undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, number>;
  }
  return undefined;
}

export function calcActivityCoefficient(
  components: ComponentLike[],
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSource,
  modelName: "NRTL" | "UNIQUAC",
  componentKey: "Name-State" | "Formula-State" = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false,
  kwargs: Record<string, unknown> = {}
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  void componentKey;
  void separatorSymbol;
  void verbose;
  const mixtureId = createMixtureId(components, mixtureKey, delimiter);
  if (modelName === "NRTL") {
    const tau_ij = kwargs.tau_ij as Record<string, number> | undefined;
    const dg_ij = kwargs.dg_ij as Record<string, number> | undefined;
    const alpha_ij = (kwargs.alpha_ij as Record<string, number> | undefined) ?? maybeExtractActivityParams(modelSource, mixtureId, ["alpha_ij", "alpha"]);
    const { names } = normalizeComponents(components);
    let tau = tau_ij;
    if (!tau && dg_ij) {
      tau = calcTauIjWithDgIjUsingNrtlModel(temperature.value, dg_ij, names).tau_ij_comp;
    }
    if (!tau) tau = maybeExtractActivityParams(modelSource, mixtureId, ["tau_ij", "tau"]);
    if (!tau || !alpha_ij) {
      throw new ThermoModelError("NRTL requires tau_ij+alpha_ij (or dg_ij+alpha_ij)", "INVALID_ACTIVITY_INPUT");
    }
    return calcActivityCoefficientUsingNrtlModel(components, pressure, temperature, tau, alpha_ij, componentKey, mixtureKey, separatorSymbol, delimiter, message, verbose);
  }

  const { names } = normalizeComponents(components);
  let tau_ij = kwargs.tau_ij as Record<string, number> | undefined;
  const dU_ij = kwargs.dU_ij as Record<string, number> | undefined;
  if (!tau_ij && dU_ij) tau_ij = calcTauIjWithDUijUsingUniquacModel(temperature.value, dU_ij, names).tau_ij_comp;
  if (!tau_ij) tau_ij = maybeExtractActivityParams(modelSource, mixtureId, ["tau_ij", "tau"]);
  const r_i = (kwargs.r_i as Record<string, number> | undefined) ?? maybeExtractActivityParams(modelSource, mixtureId, ["r_i", "r"]);
  const q_i = (kwargs.q_i as Record<string, number> | undefined) ?? maybeExtractActivityParams(modelSource, mixtureId, ["q_i", "q"]);
  if (!tau_ij || !r_i || !q_i) throw new ThermoModelError("UNIQUAC requires tau_ij+r_i+q_i (or dU_ij+r_i+q_i)", "INVALID_ACTIVITY_INPUT");
  return calcActivityCoefficientUsingUniquacModel(components, pressure, temperature, tau_ij, r_i, q_i, componentKey, mixtureKey, separatorSymbol, delimiter, message, verbose);
}

export {
  generalExcessMolarGibbsFreeEnergy
};

export const calc_activity_coefficient = calcActivityCoefficient;
export const calc_activity_coefficient_using_nrtl_model = calcActivityCoefficientUsingNrtlModel;
export const calc_activity_coefficient_using_uniquac_model = calcActivityCoefficientUsingUniquacModel;
export const calc_dg_ij_using_nrtl_model = calcDgIjUsingNrtlModel;
export const calc_tau_ij_with_dg_ij_using_nrtl_model = calcTauIjWithDgIjUsingNrtlModel;
export const calc_dU_ij_using_uniquac_model = calcDUijUsingUniquacModel;
export const calc_tau_ij_with_dU_ij_using_uniquac_model = calcTauIjWithDUijUsingUniquacModel;
export const calc_tau_ij = calcTauIj;
