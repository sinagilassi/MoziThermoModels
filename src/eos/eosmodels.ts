import { to } from "mozicuc";
import { R_CONST } from "../configs/constants";
import { ThermoModelError } from "../core";
import type { EosModelName } from "../types";

type PropertyNode = { value: number; unit: string; symbol?: string };
type ComponentDataMap = Record<string, PropertyNode>;

export interface EosModelParameterSelection {
  method: EosModelName;
  sigma: number;
  epsilon: number;
  omega: number;
  psi: number;
  alpha: ((Tr: number, omega?: number) => number) | number;
}

export interface ComponentEosParams {
  component: string;
  eos_model: EosModelName;
  sigma: number;
  epsilon: number;
  omega_eos: number;
  psi: number;
  alpha: number;
  Tr: number;
  Pr: number;
  Pc: number;
  Tc: number;
  AcFa: number;
  Zc?: number;
  a: number;
  b: number;
  A: number;
  B: number;
  q: number;
  beta: number;
}

export interface MixtureEosParams {
  component: string;
  eos_model: EosModelName;
  sigma: number;
  epsilon: number;
  amix: number;
  bmix: number;
  aij: number[][];
  A: number;
  B: number;
  P: number;
  T: number;
}

export class EOSModels {
  protected datasource: Record<string, ComponentDataMap>;
  protected equationsource: Record<string, unknown>;
  protected k_ij?: number[][];

  constructor(datasource: Record<string, ComponentDataMap>, equationsource: Record<string, unknown>, kwargs: { k_ij?: number[][] } = {}) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.k_ij = kwargs.k_ij;
  }

  eosParameterSelection(method: EosModelName): EosModelParameterSelection {
    const map: Record<EosModelName, Omit<EosModelParameterSelection, "method">> = {
      vdW: {
        sigma: 0,
        epsilon: 0,
        omega: 0.125,
        psi: 0.42188,
        alpha: 1
      },
      RK: {
        sigma: 1,
        epsilon: 0,
        omega: 0.08664,
        psi: 0.42748,
        alpha: (Tr: number) => Math.pow(Tr, -0.5)
      },
      SRK: {
        sigma: 1,
        epsilon: 0,
        omega: 0.08664,
        psi: 0.42748,
        alpha: (Tr: number, omega = 0) => Math.pow(1 + (0.48 + 1.574 * omega - 0.176 * omega * omega) * (1 - Math.sqrt(Tr)), 2)
      },
      PR: {
        sigma: 1 + Math.SQRT2,
        epsilon: 1 - Math.SQRT2,
        omega: 0.0778,
        psi: 0.45724,
        alpha: (Tr: number, omega = 0) => Math.pow(1 + (0.37464 + 1.54226 * omega - 0.26992 * omega * omega) * (1 - Math.sqrt(Tr)), 2)
      }
    };
    return { method, ...map[method] };
  }

  eosParameters(P: number, T: number, componentName: string, method: EosModelName = "SRK"): ComponentEosParams {
    const node = this.datasource[componentName];
    if (!node) throw new ThermoModelError(`Component datasource not found: ${componentName}`, "MISSING_COMPONENT_DATASOURCE");

    const Pc = this.readProp(node, "Pc", "Pa");
    const Tc = this.readProp(node, "Tc", "K");
    const AcFa = this.readOptionalProp(node, "AcFa", "-") ?? 0;
    const Zc = this.readOptionalProp(node, "Zc", "-") ?? undefined;

    const sel = this.eosParameterSelection(method);
    const Tr = T / Tc;
    const Pr = P / Pc;
    const alphaSel = sel.alpha;
    const alpha = typeof alphaSel === "number"
      ? alphaSel
      : method === "RK"
        ? alphaSel(Tr)
        : alphaSel(Tr, AcFa);

    const a = sel.psi * alpha * (R_CONST ** 2) * (Tc ** 2) / Pc;
    const b = sel.omega * R_CONST * Tc / Pc;
    const A = a * P / ((R_CONST ** 2) * (T ** 2));
    const B = b * P / (R_CONST * T);
    const q = a / (Math.max(b, 1e-30) * R_CONST * T);
    const beta = B;

    return {
      component: componentName,
      eos_model: method,
      sigma: sel.sigma,
      epsilon: sel.epsilon,
      omega_eos: sel.omega,
      psi: sel.psi,
      alpha,
      Tr,
      Pr,
      Pc,
      Tc,
      AcFa,
      Zc,
      a,
      b,
      A,
      B,
      q,
      beta
    };
  }

  eosParametersMixture(
    P: number,
    T: number,
    amix: number,
    bmix: number,
    aij: number[][],
    A_mix: number,
    B_mix: number,
    mixtureName: string,
    eosModel: EosModelName
  ): MixtureEosParams {
    const sel = this.eosParameterSelection(eosModel);
    return {
      component: mixtureName,
      eos_model: eosModel,
      sigma: sel.sigma,
      epsilon: sel.epsilon,
      amix,
      bmix,
      aij,
      A: A_mix,
      B: B_mix,
      P,
      T
    };
  }

  eosMixingRule(xi: number[], eosParams: ComponentEosParams[], k_ij?: number[][]): [number, number, number[][], number, number] {
    const n = xi.length;
    const aij = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    let amix = 0;
    let bmix = 0;

    for (let i = 0; i < n; i++) {
      bmix += xi[i] * eosParams[i].b;
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const kij = k_ij?.[i]?.[j] ?? this.k_ij?.[i]?.[j] ?? 0;
        const aij_ij = this.__aij(eosParams[i].a, eosParams[j].a, kij);
        aij[i][j] = aij_ij;
        amix += xi[i] * xi[j] * aij_ij;
      }
    }

    const P = eosParams[0]?.Pr != null ? eosParams[0].Pr * eosParams[0].Pc : 0;
    const T = eosParams[0]?.Tr != null ? eosParams[0].Tr * eosParams[0].Tc : 1;
    const A_mix = amix * P / ((R_CONST ** 2) * (T ** 2));
    const B_mix = bmix * P / (R_CONST * T);
    return [amix, bmix, aij, A_mix, B_mix];
  }

  protected __aij(ai: number, aj: number, kij = 0): number {
    return Math.sqrt(Math.max(ai, 0) * Math.max(aj, 0)) * (1 - kij);
  }

  eosAlpha(B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    return (eosNameSet.epsilon + eosNameSet.sigma - 1) * B - 1;
  }

  eosBeta(A: number, B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    const { sigma, epsilon } = eosNameSet;
    return A + (epsilon * sigma - epsilon - sigma) * (B ** 2) - (epsilon + sigma) * B;
  }

  eosGamma(A: number, B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    const { sigma, epsilon } = eosNameSet;
    return -(A * B + epsilon * sigma * (B ** 2) * (1 + B));
  }

  eosEquation(x: number, params: { A: number; B: number; sigma: number; epsilon: number }): number {
    return (x ** 3) + this.eosAlpha(params.B, params) * (x ** 2) + this.eosBeta(params.A, params.B, params) * x + this.eosGamma(params.A, params.B, params);
  }

  eosEquationCoefficient(params: { A: number; B: number; sigma: number; epsilon: number }): [number, number, number, number] {
    return [1, this.eosAlpha(params.B, params), this.eosBeta(params.A, params.B, params), this.eosGamma(params.A, params.B, params)];
  }

  eosEquationMixture(x: number, params: MixtureEosParams): number {
    return (x ** 3) + this.eosAlpha(params.B, params) * (x ** 2) + this.eosBeta(params.A, params.B, params) * x + this.eosGamma(params.A, params.B, params);
  }

  eosEquationCoefficientMixture(params: MixtureEosParams): [number, number, number, number] {
    return [1, this.eosAlpha(params.B, params), this.eosBeta(params.A, params.B, params), this.eosGamma(params.A, params.B, params)];
  }

  protected readProp(node: ComponentDataMap, symbol: string, outUnit: string): number {
    const entry = node[symbol];
    if (!entry) throw new ThermoModelError(`Required property ${symbol} not found`, "MISSING_PROPERTY");
    return this.convertEntry(entry, outUnit);
  }

  protected readOptionalProp(node: ComponentDataMap, symbol: string, outUnit: string): number | undefined {
    const entry = node[symbol];
    if (!entry) return undefined;
    return this.convertEntry(entry, outUnit);
  }

  protected convertEntry(entry: PropertyNode, outUnit: string): number {
    const val = Number(entry.value);
    if (outUnit === "-" || String(entry.unit) === outUnit) return val;
    return to(val, `${entry.unit} => ${outUnit}`);
  }
}

export class eosModels extends EOSModels {}
