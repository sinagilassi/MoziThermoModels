import { ThermoModelError } from "../core";
import type { EosModelName } from "../types";
import { EOSModels, type ComponentEosParams, type MixtureEosParams } from "./eosmodels";
import { EOSUtils } from "./eosutils";

type ComponentDataMap = Record<string, { value: number; unit: string; symbol?: string }>;

type RootAnalysisLike = {
  root: number[];
  phase?: string;
  root_analysis_list?: unknown[];
};

export interface EosRootsResult {
  Z: number;
  roots: number[];
  eos_params: ComponentEosParams | MixtureEosParams;
  eos_params_comp: Record<string, ComponentEosParams | MixtureEosParams>;
  solver_method: string;
  solver_note?: string;
}

export class EOSManager extends EOSModels {
  protected utils: EOSUtils;

  constructor(datasource: Record<string, ComponentDataMap>, equationsource: Record<string, any>, kwargs: { k_ij?: number[][] } = {}) {
    super(datasource, equationsource, kwargs);
    this.utils = new EOSUtils(datasource, equationsource);
  }

  eosRoots(
    P: number,
    T: number,
    components: string[],
    rootAnalysis: RootAnalysisLike,
    xi: number[] = [],
    eosModel: EosModelName = "SRK",
    solverMethod = "ls",
    mode: "single" | "mixture" = "single"
  ): EosRootsResult {
    const eosParams = components.map((c) => this.eosParameters(P, T, c, eosModel));
    const eosParamsComp: Record<string, ComponentEosParams | MixtureEosParams> = Object.fromEntries(eosParams.map((p) => [p.component, p]));

    let params0: ComponentEosParams | MixtureEosParams = eosParams[0];
    if (mode === "mixture") {
      const x = xi.length ? xi : Array.from({ length: components.length }, () => 1 / Math.max(components.length, 1));
      const [amix, bmix, aij, A_mix, B_mix] = this.eosMixingRule(x, eosParams, this.k_ij);
      const mixName = components.join(" | ");
      const mix = this.eosParametersMixture(P, T, amix, bmix, aij, A_mix, B_mix, mixName, eosModel);
      eosParamsComp.mixture = mix;
      params0 = mix;
    }

    const [a, b, c, d] = (mode === "single")
      ? this.eosEquationCoefficient(params0 as ComponentEosParams)
      : this.eosEquationCoefficientMixture(params0 as MixtureEosParams);
    const rootId = rootAnalysis.root?.[0] ?? 3;

    let solverNote: string | undefined;
    let actualSolver = solverMethod;
    if (solverMethod !== "ls") {
      solverNote = `Solver '${solverMethod}' routed to 'ls'`;
      actualSolver = "ls";
    }

    const roots = this.rootLs(rootId, [a, b, c, d]);
    if (!roots.length) throw new ThermoModelError("No valid EOS roots found", "EOS_ROOTS_NOT_FOUND");
    const Z = rootId === 2 ? Math.min(...roots) : Math.max(...roots);

    return {
      Z,
      roots,
      eos_params: params0,
      eos_params_comp: eosParamsComp,
      solver_method: actualSolver,
      ...(solverNote ? { solver_note: solverNote } : {})
    };
  }

  rootLs(rootId: number, coeff: [number, number, number, number]): number[] {
    void rootId;
    const roots = solveCubicRealRoots(coeff[0], coeff[1], coeff[2], coeff[3])
      .filter((z) => Number.isFinite(z) && z > 0)
      .map((z) => round(z, 10));
    return uniqSorted(roots);
  }

  eosRootAnalysis(P: number, T: number, components: string[], tolerance = 1e-3, kwargs: { mole_fraction?: number[] } = {}) {
    return this.utils.eosRootAnalysis(P, T, components, tolerance, kwargs);
  }

  eosFugacity(args: {
    P: number;
    T: number;
    components: string[];
    yi: number[];
    eosModel: EosModelName;
    mode: "single" | "mixture";
    rootAnalysis: RootAnalysisLike;
    solverMethod?: string;
  }) {
    const rootRes = this.eosRoots(
      args.P,
      args.T,
      args.components,
      args.rootAnalysis,
      args.yi,
      args.eosModel,
      args.solverMethod ?? "ls",
      args.mode
    );
    const Z = rootRes.Z;
    if (args.mode === "single") {
      const p = rootRes.eos_params as ComponentEosParams;
      const phi = this.phiPure(Z, p);
      return {
        Z,
        roots: rootRes.roots,
        phi,
        fugacity: phi * args.P,
        eos_params: rootRes.eos_params,
        eos_params_comp: rootRes.eos_params_comp,
        solver_method: rootRes.solver_method,
        solver_note: rootRes.solver_note
      };
    }

    const x = args.yi.length ? normalizeFractions(args.yi) : Array.from({ length: args.components.length }, () => 1 / Math.max(args.components.length, 1));
    const mix = rootRes.eos_params as MixtureEosParams;
    const compParams = args.components.map((c) => rootRes.eos_params_comp[c] as ComponentEosParams);
    const amix = mix.amix;
    const bmix = mix.bmix;
    const A = mix.A;
    const B = mix.B;
    const sigma = mix.sigma;
    const epsilon = mix.epsilon;
    const phiMap: Record<string, number> = {};
    const fugacityMap: Record<string, number> = {};

    for (let i = 0; i < args.components.length; i++) {
      const bi = compParams[i].b;
      let sumAij = 0;
      for (let j = 0; j < args.components.length; j++) sumAij += x[j] * mix.aij[i][j];
      const lnPhi = this.lnPhiCubicMixture(Z, A, B, sigma, epsilon, bi, bmix, sumAij, amix);
      const phi = Math.exp(lnPhi);
      phiMap[args.components[i]] = phi;
      fugacityMap[args.components[i]] = x[i] * phi * args.P;
    }

    return {
      Z,
      roots: rootRes.roots,
      phi: phiMap,
      fugacity: fugacityMap,
      eos_params: rootRes.eos_params,
      eos_params_comp: rootRes.eos_params_comp,
      solver_method: rootRes.solver_method,
      solver_note: rootRes.solver_note
    };
  }

  SRK(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }
  PR(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }
  RK(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }
  vdW(Z: number, p: ComponentEosParams): number {
    const lnPhi = Z - 1 - Math.log(Math.max(Z - p.B, 1e-30)) - p.A / Math.max(Z, 1e-30);
    return Math.exp(lnPhi);
  }

  protected phiPure(Z: number, p: ComponentEosParams): number {
    switch (p.eos_model) {
      case "SRK": return this.SRK(Z, p);
      case "PR": return this.PR(Z, p);
      case "RK": return this.RK(Z, p);
      case "vdW": return this.vdW(Z, p);
      default: return this.SRK(Z, p);
    }
  }

  protected lnPhiCubicPure(Z: number, A: number, B: number, sigma: number, epsilon: number): number {
    if (sigma === 0 && epsilon === 0) {
      return Z - 1 - Math.log(Math.max(Z - B, 1e-30)) - A / Math.max(Z, 1e-30);
    }
    const denom = Math.max((sigma - epsilon) * B, 1e-30);
    const logTerm = Math.log(Math.max((Z + sigma * B) / Math.max(Z + epsilon * B, 1e-30), 1e-30));
    return Z - 1 - Math.log(Math.max(Z - B, 1e-30)) - (A / denom) * logTerm;
  }

  protected lnPhiCubicMixture(
    Z: number,
    A: number,
    B: number,
    sigma: number,
    epsilon: number,
    bi: number,
    bmix: number,
    sumAij: number,
    amix: number
  ): number {
    const biOverB = bi / Math.max(bmix, 1e-30);
    if (sigma === 0 && epsilon === 0) {
      return biOverB * (Z - 1) - Math.log(Math.max(Z - B, 1e-30)) - (A / Math.max(Z, 1e-30)) * (2 * sumAij / Math.max(amix, 1e-30) - biOverB);
    }
    const coef = A / Math.max(B * (sigma - epsilon), 1e-30);
    const factor = (2 * sumAij / Math.max(amix, 1e-30)) - biOverB;
    const logTerm = Math.log(Math.max((Z + sigma * B) / Math.max(Z + epsilon * B, 1e-30), 1e-30));
    return biOverB * (Z - 1) - Math.log(Math.max(Z - B, 1e-30)) - coef * factor * logTerm;
  }
}

function normalizeFractions(x: number[]): number[] {
  let s = x.reduce((a, b) => a + b, 0);
  if (!(s > 0)) s = 1;
  return x.map((v) => v / s);
}

function round(v: number, d: number): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function uniqSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > 1e-8) out.push(v);
  }
  return out;
}

function solveCubicRealRoots(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-30) throw new ThermoModelError("Leading cubic coefficient cannot be zero", "INVALID_CUBIC");
  const A = b / a;
  const B = c / a;
  const C = d / a;

  const p = B - (A * A) / 3;
  const q = (2 * A * A * A) / 27 - (A * B) / 3 + C;
  const discriminant = (q * q) / 4 + (p * p * p) / 27;

  if (discriminant > 1e-14) {
    const sqrtD = Math.sqrt(discriminant);
    const u = cbrt(-q / 2 + sqrtD);
    const v = cbrt(-q / 2 - sqrtD);
    return [u + v - A / 3];
  }
  if (Math.abs(discriminant) <= 1e-14) {
    const u = cbrt(-q / 2);
    return [2 * u - A / 3, -u - A / 3];
  }

  const r = Math.sqrt(-(p ** 3) / 27);
  const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
  const m = 2 * Math.sqrt(-p / 3);
  return [
    m * Math.cos(phi / 3) - A / 3,
    m * Math.cos((phi + 2 * Math.PI) / 3) - A / 3,
    m * Math.cos((phi + 4 * Math.PI) / 3) - A / 3
  ];
}

function cbrt(x: number): number {
  return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}
