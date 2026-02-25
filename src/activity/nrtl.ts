import type { ActivityCoefficientResult, ExcessGibbsResult } from "../types";
import {
  R_ACTIVITY,
  buildActivityCoefficientResult,
  ensureMatrix,
  generalExcessMolarGibbsFreeEnergy,
  parseModelInputObject,
  toKelvin,
  toPairDict
} from "./_shared";

export type NrtlCalInput = {
  mole_fraction: Record<string, number>;
  tau_ij: Record<string, number> | number[][];
  alpha_ij: Record<string, number> | number[][];
};

export class NRTL {
  readonly components: string[];
  datasource: Record<string, unknown>;
  equationsource: Record<string, unknown>;
  comp_num: number;
  comp_idx: Record<string, number>;
  mixture_id = "";
  mixture_ids: Record<string, string> = {};
  components_ids: Record<string, string[]> = {};

  constructor(
    components: string[],
    datasource: Record<string, unknown> = {},
    equationsource: Record<string, unknown> = {}
  ) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.components = (components ?? []).map((c) => String(c).trim());
    this.comp_num = this.components.length;
    this.comp_idx = Object.fromEntries(this.components.map((c, i) => [c, i]));
  }

  parseModelInputs(modelInputs: unknown): Record<string, unknown> {
    return parseModelInputObject(modelInputs);
  }

  to_ij(data: Record<string, number> | number[][], _prop_symbol?: string, symbol_delimiter: "|" | "_" = "|"): number[][] {
    return ensureMatrix(data, this.components, symbol_delimiter);
  }

  to_dict_ij(data: Record<string, number> | number[][], symbol_delimiter: "|" | "_" = "|") {
    const matrix = Array.isArray(data) ? data : this.to_ij(data, undefined, symbol_delimiter);
    return toPairDict(this.components, matrix, symbol_delimiter);
  }

  to_matrix_ij(data: Record<string, number> | number[][], symbol_delimiter: "|" | "_" = "|") {
    return this.to_ij(data, undefined, symbol_delimiter);
  }

  cal_dg_ij_M1(
    temperature: number | { value: number; unit: string },
    tau_ij: Record<string, number> | number[][],
    symbol_delimiter: "|" | "_" = "|"
  ) {
    const T = toKelvin(temperature as any);
    const tau = this.to_matrix_ij(tau_ij, symbol_delimiter);
    const dg = tau.map((row) => row.map((v) => Number(v) * R_ACTIVITY * T));
    return [dg, this.to_dict_ij(dg, symbol_delimiter)] as const;
  }

  cal_tau_ij_M1(
    temperature: number | { value: number; unit: string },
    dg_ij: Record<string, number> | number[][],
    symbol_delimiter: "|" | "_" = "|"
  ) {
    const T = toKelvin(temperature as any);
    const dg = this.to_matrix_ij(dg_ij, symbol_delimiter);
    const tau = dg.map((row) => row.map((v) => Number(v) / Math.max(R_ACTIVITY * T, 1e-30)));
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

  cal_G_ij(tau_ij: number[][], alpha_ij: number[][]) {
    const G = tau_ij.map((row, i) => row.map((tau, j) => Math.exp(-Number(alpha_ij[i]?.[j] ?? 0) * Number(tau))));
    return [G, this.to_dict_ij(G)] as const;
  }

  cal(
    model_input: NrtlCalInput,
    message = "Calculating activity coefficient using NRTL model"
  ): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
    const n = this.components.length;
    const x = this.components.map((c) => Number(model_input.mole_fraction[c] ?? 0));
    const tau = ensureMatrix(model_input.tau_ij, this.components);
    const alpha = ensureMatrix(model_input.alpha_ij, this.components);
    const [G, G_ij_comp] = this.cal_G_ij(tau, alpha);
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
    const result = buildActivityCoefficientResult(this.components, model_input.mole_fraction, gamma, message);
    const value = result.value;
    const others = {
      AcCo_i_comp: value,
      tau_ij: tau,
      tau_ij_comp: this.to_dict_ij(tau),
      alpha_ij: alpha,
      alpha_ij_comp: this.to_dict_ij(alpha),
      G_ij: G,
      G_ij_comp,
      calculation_mode: "NRTL"
    };
    return [result, others, this.excess_gibbs_free_energy(model_input.mole_fraction, value)];
  }

  excess_gibbs_free_energy(mole_fraction: Record<string, number>, activity_coefficients: Record<string, number>) {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, "NRTL excess Gibbs free energy");
  }

  CalAcCo_V1(model_input: NrtlCalInput, message?: string) {
    return this.cal(model_input, message);
  }

  CalAcCo_V2(model_input: NrtlCalInput, message?: string) {
    return this.cal(model_input, message);
  }
}

