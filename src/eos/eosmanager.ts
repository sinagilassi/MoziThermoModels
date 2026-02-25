import { ThermoModelError } from "@/core";
import {
  selectRootsByAnalysis,
  solveByFsolveLikeMultiStart,
  solveByLeastSquaresMultiStart,
  solveByNewtonMultiStart,
  solveByPolynomialRoots,
} from "@/solvers";
import type { EosModelName, SolverMethod } from "@/types";
import { EOSModels, type ComponentEosParams, type MixtureEosParams } from "./eosmodels";
import { EOSUtils } from "./eosutils";

/** Component property dictionary mapping property symbols to property nodes. */
type ComponentDataMap = Record<string, { value: number; unit: string; symbol?: string }>;

/**
 * Root analysis metadata from EOS utilities.
 *
 * Includes selected root index, resolved phase, and optional diagnostic data.
 */
type RootAnalysisLike = {
  root: number[];
  phase?: string;
  root_analysis_list?: unknown[];
};

/**
 * EOS root-solving result payload.
 *
 * Contains selected compressibility factor, all real roots, EOS parameters for the system
 * and individual components, and solver metadata.
 */
export interface EosRootsResult {
  Z: number;
  roots: number[];
  eos_params: ComponentEosParams | MixtureEosParams;
  eos_params_comp: Record<string, ComponentEosParams | MixtureEosParams>;
  solver_method: string;
  solver_note?: string;
}

/**
 * High-level EOS manager for root solving, fugacity calculation, and phase analysis.
 *
 * `EOSManager` extends `EOSModels` and adds:
 * - Cubic EOS root solving with multiple numerical methods.
 * - Compressibility factor selection via root analysis.
 * - Fugacity coefficient calculation for single components and mixtures.
 * - Model-specific fugacity implementations (SRK, PR, RK, vdW).
 * - Integration with `EOSUtils` for automated phase resolution.
 *
 * Supports both single-component and mixture workflows with extensible binary interaction.
 */
export class EOSManager extends EOSModels {
  protected utils: EOSUtils;

  /**
   * Initializes EOS manager with data sources, equation metadata, and optional interaction coefficients.
   *
   * @param datasource - Component property maps keyed by component name.
   * @param equationsource - Equation metadata (reserved for future extension).
   * @param kwargs - Optional controls including `k_ij` binary interaction matrix.
   */
  constructor(datasource: Record<string, ComponentDataMap>, equationsource: Record<string, any>, kwargs: { k_ij?: number[][] } = {}) {
    super(datasource, equationsource, kwargs);
    this.utils = new EOSUtils(datasource, equationsource);
  }

  /**
   * Solves cubic EOS for compressibility factor and returns all real roots.
   *
   * Computes EOS parameters for each component, applies mixing rules for mixtures, builds the
   * cubic polynomial, solves for real roots, and selects Z based on phase from root analysis.
   *
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @param components - Component names for lookup in datasource.
   * @param rootAnalysis - Root analysis metadata with phase and root selection index.
   * @param xi - Mole fractions for mixture mode (defaults to equal fractions).
   * @param eosModel - EOS model identifier. Defaults to `"SRK"`.
   * @param solverMethod - Root solver method (currently only `"ls"` is implemented). Defaults to `"ls"`.
   * @param mode - Calculation mode: `"single"` or `"mixture"`. Defaults to `"single"`.
   * @returns EOS roots result including selected Z, all roots, and EOS parameters.
   * @throws {ThermoModelError} `EOS_ROOTS_NOT_FOUND` when no valid positive real roots exist.
   */
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

    const requestedSolver = solverMethod as SolverMethod;
    const fnCtx = {
      fn: (x: number, ctx: ComponentEosParams | MixtureEosParams) =>
        mode === "single"
          ? this.eosEquation(x, ctx as ComponentEosParams)
          : this.eosEquationMixture(x, ctx as MixtureEosParams),
      ctx: params0
    };

    let allRoots: number[] = [];
    if (requestedSolver === "ls") {
      allRoots = solveByLeastSquaresMultiStart(rootId, fnCtx).roots;
    } else if (requestedSolver === "newton") {
      allRoots = solveByNewtonMultiStart(fnCtx).roots;
    } else if (requestedSolver === "fsolve") {
      allRoots = solveByFsolveLikeMultiStart(fnCtx).roots;
    } else if (requestedSolver === "root") {
      allRoots = solveByPolynomialRoots([a, b, c, d]).roots;
    } else {
      throw new ThermoModelError(`Invalid solver_method: ${solverMethod}`, "INVALID_SOLVER_METHOD");
    }

    const roots = selectRootsByAnalysis(rootId, allRoots);
    if (!roots.length) throw new ThermoModelError("No valid EOS roots found", "EOS_ROOTS_NOT_FOUND");
    const Z = rootId === 2 ? Math.min(...roots) : Math.max(...roots);

    return {
      Z,
      roots,
      eos_params: params0,
      eos_params_comp: eosParamsComp,
      solver_method: requestedSolver
    };
  }

  /**
   * Solves cubic polynomial for real roots using analytical cubic formula.
   *
   * Filters out non-physical roots (negative or non-finite) and removes near-duplicates.
   *
   * @param rootId - Root selection index (preserved for compatibility, not used in filtering).
   * @param coeff - Cubic polynomial coefficients: [a, b, c, d] for ax³ + bx² + cx + d = 0.
   * @returns Sorted array of unique positive real roots.
   */
  rootLs(rootId: number, coeff: [number, number, number, number]): number[] {
    const run = solveByLeastSquaresMultiStart(rootId, {
      fn: (x, c) => (((c[0] * x + c[1]) * x + c[2]) * x + c[3]),
      ctx: coeff
    });
    return selectRootsByAnalysis(rootId, run.roots);
  }

  /**
   * Performs EOS root analysis to determine phase and root selection.
   *
   * Delegates to `EOSUtils.eosRootAnalysis` for phase diagnostics.
   *
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @param components - Component names.
   * @param tolerance - Root-analysis tolerance. Defaults to `1e-3`.
   * @param kwargs - Optional controls including `mole_fraction`.
   * @returns Root analysis result with selected phase and root metadata.
   */
  eosRootAnalysis(P: number, T: number, components: string[], tolerance = 1e-3, kwargs: { mole_fraction?: number[] } = {}) {
    return this.utils.eosRootAnalysis(P, T, components, tolerance, kwargs);
  }

  /**
   * Calculates fugacity and fugacity coefficients for single components or mixtures.
   *
   * Solves EOS roots, computes compressibility factor, and applies model-specific fugacity
   * correlations. For mixtures, computes component-wise fugacity coefficients.
   *
   * @param args - Fugacity calculation configuration.
   * @param args.P - Operating pressure in Pa.
   * @param args.T - Operating temperature in K.
   * @param args.components - Component names.
   * @param args.yi - Mole fractions (for mixture mode).
   * @param args.eosModel - EOS model identifier.
   * @param args.mode - Calculation mode: `"single"` or `"mixture"`.
   * @param args.rootAnalysis - Root analysis metadata for phase/root selection.
   * @param args.solverMethod - Root solver method. Defaults to `"ls"`.
   * @returns Fugacity result with Z, phi, fugacity, roots, and solver metadata.
   */
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

  /**
   * Calculates fugacity coefficient for pure component using SRK EOS.
   *
   * @param Z - Compressibility factor.
   * @param p - Component EOS parameters.
   * @returns Fugacity coefficient (phi).
   */
  SRK(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }

  /**
   * Calculates fugacity coefficient for pure component using Peng-Robinson EOS.
   *
   * @param Z - Compressibility factor.
   * @param p - Component EOS parameters.
   * @returns Fugacity coefficient (phi).
   */
  PR(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }

  /**
   * Calculates fugacity coefficient for pure component using Redlich-Kwong EOS.
   *
   * @param Z - Compressibility factor.
   * @param p - Component EOS parameters.
   * @returns Fugacity coefficient (phi).
   */
  RK(Z: number, p: ComponentEosParams): number { return Math.exp(this.lnPhiCubicPure(Z, p.A, p.B, p.sigma, p.epsilon)); }

  /**
   * Calculates fugacity coefficient for pure component using Van der Waals EOS.
   *
   * @param Z - Compressibility factor.
   * @param p - Component EOS parameters.
   * @returns Fugacity coefficient (phi).
   */
  vdW(Z: number, p: ComponentEosParams): number {
    const lnPhi = Z - 1 - Math.log(Math.max(Z - p.B, 1e-30)) - p.A / Math.max(Z, 1e-30);
    return Math.exp(lnPhi);
  }

  /**
   * Dispatches to the appropriate pure-component fugacity method based on EOS model.
   *
   * @param Z - Compressibility factor.
   * @param p - Component EOS parameters.
   * @returns Fugacity coefficient (phi).
   */
  protected phiPure(Z: number, p: ComponentEosParams): number {
    switch (p.eos_model) {
      case "SRK": return this.SRK(Z, p);
      case "PR": return this.PR(Z, p);
      case "RK": return this.RK(Z, p);
      case "vdW": return this.vdW(Z, p);
      default: return this.SRK(Z, p);
    }
  }

  /**
   * Computes natural log of fugacity coefficient for pure component using generalized cubic EOS.
   *
   * Handles special case for Van der Waals (sigma=0, epsilon=0) and general cubic forms.
   *
   * @param Z - Compressibility factor.
   * @param A - Dimensionless attractive parameter.
   * @param B - Dimensionless covolume parameter.
   * @param sigma - EOS constant.
   * @param epsilon - EOS constant.
   * @returns Natural log of fugacity coefficient: ln(phi).
   */
  protected lnPhiCubicPure(Z: number, A: number, B: number, sigma: number, epsilon: number): number {
    if (sigma === 0 && epsilon === 0) {
      return Z - 1 - Math.log(Math.max(Z - B, 1e-30)) - A / Math.max(Z, 1e-30);
    }
    const denom = Math.max((sigma - epsilon) * B, 1e-30);
    const logTerm = Math.log(Math.max((Z + sigma * B) / Math.max(Z + epsilon * B, 1e-30), 1e-30));
    return Z - 1 - Math.log(Math.max(Z - B, 1e-30)) - (A / denom) * logTerm;
  }

  /**
   * Computes natural log of fugacity coefficient for a component in a mixture using cubic EOS.
   *
   * Applies mixture-specific fugacity correlation with composition-dependent terms.
   *
   * @param Z - Mixture compressibility factor.
   * @param A - Dimensionless mixture attractive parameter.
   * @param B - Dimensionless mixture covolume parameter.
   * @param sigma - EOS constant.
   * @param epsilon - EOS constant.
   * @param bi - Component covolume parameter.
   * @param bmix - Mixture covolume parameter.
   * @param sumAij - Sum of interaction-corrected attractive terms for the component.
   * @param amix - Mixture attractive parameter.
   * @returns Natural log of component fugacity coefficient: ln(phi_i).
   */
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

/**
 * Normalizes mole fractions to sum to 1.
 *
 * @param x - Raw mole fractions.
 * @returns Normalized mole fractions.
 */
function normalizeFractions(x: number[]): number[] {
  let s = x.reduce((a, b) => a + b, 0);
  if (!(s > 0)) s = 1;
  return x.map((v) => v / s);
}
