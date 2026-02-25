import type { ActivityCoefficientResult, ExcessGibbsResult } from "../types";
import {
  R_ACTIVITY,
  buildActivityCoefficientResult,
  ensureMatrix,
  ensureVector,
  generalExcessMolarGibbsFreeEnergy,
  parseModelInputObject,
  toKelvin,
  toPairDict,
  toVectorDict
} from "./_shared";

export type UniquacCalInput = {
  mole_fraction: Record<string, number>;
  tau_ij: Record<string, number> | number[][];
  r_i: Record<string, number> | number[];
  q_i: Record<string, number> | number[];
};

export class UNIQUAC {
  readonly components: string[];
  datasource: Record<string, unknown>;
  equationsource: Record<string, unknown>;
  comp_num: number;
  comp_idx: Record<string, number>;
  coordinationNumber: number;
  mixture_id = "";
  mixture_ids: Record<string, string> = {};
  components_ids: Record<string, string[]> = {};

  constructor(
    components: string[],
    datasource: Record<string, unknown> = {},
    equationsource: Record<string, unknown> = {},
    coordinationNumber = 10
  ) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.components = (components ?? []).map((c) => String(c).trim());
    this.comp_num = this.components.length;
    this.comp_idx = Object.fromEntries(this.components.map((c, i) => [c, i]));
    this.coordinationNumber = coordinationNumber;
  }

  parseModelInputs(modelInputs: unknown): Record<string, unknown> {
    return parseModelInputObject(modelInputs);
  }

  to_ij(data: Record<string, number> | number[][], _prop_symbol?: string, symbol_delimiter: "|" | "_" = "|"): number[][] {
    return ensureMatrix(data, this.components, symbol_delimiter);
  }

  to_i(data: Record<string, number> | number[]): number[] {
    return ensureVector(data, this.components);
  }

  to_dict_ij(data: Record<string, number> | number[][], symbol_delimiter: "|" | "_" = "|") {
    const matrix = Array.isArray(data) ? data : this.to_ij(data, undefined, symbol_delimiter);
    return toPairDict(this.components, matrix, symbol_delimiter);
  }

  to_dict_i(data: Record<string, number> | number[]) {
    const vec = Array.isArray(data) ? data.map(Number) : this.to_i(data);
    return toVectorDict(this.components, vec);
  }

  to_matrix_ij(data: Record<string, number> | number[][], symbol_delimiter: "|" | "_" = "|") {
    return this.to_ij(data, undefined, symbol_delimiter);
  }

  cal_dU_ij_M1(
    temperature: number | { value: number; unit: string },
    tau_ij: Record<string, number> | number[][],
    symbol_delimiter: "|" | "_" = "|"
  ) {
    const T = toKelvin(temperature as any);
    const tau = this.to_matrix_ij(tau_ij, symbol_delimiter);
    const dU = tau.map((row) => row.map((v) => -Math.log(Math.max(Number(v), 1e-30)) * R_ACTIVITY * T));
    return [dU, this.to_dict_ij(dU, symbol_delimiter)] as const;
  }

  cal_tau_ij_M1(
    temperature: number | { value: number; unit: string },
    dU_ij: Record<string, number> | number[][],
    symbol_delimiter: "|" | "_" = "|"
  ) {
    const T = toKelvin(temperature as any);
    const dU = this.to_matrix_ij(dU_ij, symbol_delimiter);
    const tau = dU.map((row) => row.map((v) => Math.exp(-Number(v) / Math.max(R_ACTIVITY * T, 1e-30))));
    return [tau, this.to_dict_ij(tau, symbol_delimiter)] as const;
  }

  cal_tau_ij_M2(
    temperature: number | { value: number; unit: string },
    a_ij: Record<string, number> | number[][],
    b_ij: Record<string, number> | number[][],
    c_ij: Record<string, number> | number[][],
    d_ij: Record<string, number> | number[][],
    symbol_delimiter: "|" | "_" = "|"
  ) {
    const T = toKelvin(temperature as any);
    const A = this.to_matrix_ij(a_ij, symbol_delimiter);
    const B = this.to_matrix_ij(b_ij, symbol_delimiter);
    const C = this.to_matrix_ij(c_ij, symbol_delimiter);
    const D = this.to_matrix_ij(d_ij, symbol_delimiter);
    const tau = A.map((row, i) =>
      row.map((_, j) => Number(A[i][j]) + Number(B[i][j]) / Math.max(T, 1e-30) + Number(C[i][j]) * Math.log(Math.max(T, 1e-30)) + Number(D[i][j]) * T)
    );
    return [tau, this.to_dict_ij(tau, symbol_delimiter)] as const;
  }

  cal(
    model_input: UniquacCalInput,
    message = "Calculating activity coefficient using UNIQUAC model"
  ): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
    const n = this.components.length;
    const x = this.components.map((c) => Number(model_input.mole_fraction[c] ?? 0));
    const tau = ensureMatrix(model_input.tau_ij, this.components);
    const r = ensureVector(model_input.r_i, this.components);
    const q = ensureVector(model_input.q_i, this.components);
    const z = this.coordinationNumber;

    const sumRx = x.reduce((s, xi, i) => s + xi * r[i], 0);
    const sumQx = x.reduce((s, xi, i) => s + xi * q[i], 0);
    const Phi = x.map((xi, i) => (xi * r[i]) / Math.max(sumRx, 1e-30));
    const Theta = x.map((xi, i) => (xi * q[i]) / Math.max(sumQx, 1e-30));
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
        s2 += (Theta[j] * tau[i][j]) / Math.max(den, 1e-30);
      }
      lnGammaR[i] = q[i] * (1 - Math.log(Math.max(s1, 1e-30)) - s2);
    }

    const gamma = lnGammaC.map((v, i) => Math.exp(v + lnGammaR[i]));
    const result = buildActivityCoefficientResult(this.components, model_input.mole_fraction, gamma, message);
    const value = result.value;
    const others = {
      AcCo_i_comp: value,
      tau_ij: tau,
      tau_ij_comp: this.to_dict_ij(tau),
      r_i: r,
      r_i_comp: this.to_dict_i(r),
      q_i: q,
      q_i_comp: this.to_dict_i(q),
      calculation_mode: "UNIQUAC"
    };
    return [result, others, this.excess_gibbs_free_energy(model_input.mole_fraction, value)];
  }

  excess_gibbs_free_energy(mole_fraction: Record<string, number>, activity_coefficients: Record<string, number>) {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, "UNIQUAC excess Gibbs free energy");
  }

  CalAcCo_V1(model_input: UniquacCalInput, message?: string) {
    return this.cal(model_input, message);
  }
}

