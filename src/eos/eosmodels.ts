import { convertFromTo } from "mozicuc";
import { R_CONST } from "@/configs/constants";
import { ThermoModelError } from "@/errors";
import type { EosModelName } from "@/types";

/** Property value with unit metadata from datasource. */
type PropertyNode = { value: number; unit: string; symbol?: string };
/** Component property dictionary mapping property symbols to property nodes. */
type ComponentDataMap = Record<string, PropertyNode>;

/**
 * EOS model parameter set with algebraic constants and alpha function.
 *
 * Captures all EOS-specific coefficients (sigma, epsilon, omega, psi) and the temperature-dependent
 * alpha term (as a function or constant) for a given EOS model.
 */
export interface EosModelParameterSelection {
  method: EosModelName;
  sigma: number;
  epsilon: number;
  omega: number;
  psi: number;
  alpha: ((Tr: number, omega?: number) => number) | number;
}

/**
 * Computed EOS parameters for a single component.
 *
 * Includes original properties (Pc, Tc, AcFa, Zc), normalized thermodynamic state (Pr, Tr),
 * and derived EOS terms (a, b, A, B, alpha, q, beta).
 */
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

/**
 * Computed EOS parameters for a mixture.
 *
 * Contains mixture-level properties (amix, bmix, aij interaction matrix) and dimensionless
 * EOS terms (A, B) derived via mixing rules.
 */
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

/**
 * EOS model parameter builder and cubic EOS equation evaluator.
 *
 * `EOSModels` handles:
 * - EOS parameter selection (vdW, RK, SRK, PR) with model-specific constants and alpha correlations.
 * - Single-component EOS parameter computation from datasource critical properties.
 * - Mixture parameter computation via mixing rules with binary interaction coefficients.
 * - Cubic EOS polynomial coefficient generation and evaluation for both single and mixture systems.
 *
 * Supports extensible binary interaction via `k_ij` matrix.
 */
export class EOSModels {
  protected datasource: Record<string, ComponentDataMap>;
  protected equationsource: Record<string, unknown>;
  protected k_ij?: number[][];

  /**
   * Initializes EOS model builder with data sources and optional binary interaction coefficients.
   *
   * @param datasource - Component property maps keyed by component name.
   * @param equationsource - Equation metadata (reserved for future extension).
   * @param kwargs - Optional controls including `k_ij` binary interaction matrix.
   */
  constructor(datasource: Record<string, ComponentDataMap>, equationsource: Record<string, unknown>, kwargs: { k_ij?: number[][] } = {}) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.k_ij = kwargs.k_ij;
  }

  /**
   * Returns algebraic constants and alpha function for the specified EOS model.
   *
   * Supported models:
   * - `vdW`: Van der Waals (constant alpha)
   * - `RK`: Redlich-Kwong (Tr-dependent alpha)
   * - `SRK`: Soave-Redlich-Kwong (Tr and acentric-factor-dependent alpha)
   * - `PR`: Peng-Robinson (Tr and acentric-factor-dependent alpha)
   *
   * @param method - EOS model identifier.
   * @returns Parameter set with sigma, epsilon, omega, psi, and alpha.
   */
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

  /**
   * Computes full EOS parameter set for a single component at specified operating conditions.
   *
   * Reads critical properties (Pc, Tc, AcFa, Zc) from datasource, applies EOS-specific correlations,
   * and returns derived parameters (a, b, A, B, alpha, q, beta) in SI units.
   *
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @param componentName - Component identifier used to lookup datasource properties.
   * @param method - EOS model identifier. Defaults to `"SRK"`.
   * @returns Complete component EOS parameter payload.
   * @throws {ThermoModelError} `MISSING_COMPONENT_DATASOURCE` when component not found in datasource.
   * @throws {ThermoModelError} `MISSING_PROPERTY` when required critical property is absent.
   */
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

  /**
   * Constructs mixture EOS parameter payload from pre-computed mixing-rule outputs.
   *
   * This method assembles mixture-level terms without re-computing mixing rules. Use
   * {@link eosMixingRule} to compute `amix`, `bmix`, `aij`, `A_mix`, and `B_mix` before calling this method.
   *
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @param amix - Mixture attractive parameter.
   * @param bmix - Mixture covolume parameter.
   * @param aij - Binary interaction matrix for attractive parameter.
   * @param A_mix - Dimensionless mixture attractive parameter.
   * @param B_mix - Dimensionless mixture covolume parameter.
   * @param mixtureName - Mixture identifier label.
   * @param eosModel - EOS model identifier.
   * @returns Mixture EOS parameter payload.
   */
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

  /**
   * Applies quadratic mixing rules to compute mixture EOS parameters.
   *
   * Uses component mole fractions, individual EOS parameters, and optional binary interaction
   * coefficients to calculate mixture-level attractive and covolume parameters.
   *
   * @param xi - Component mole fractions (must sum to 1).
   * @param eosParams - Array of component EOS parameters (length must match `xi`).
   * @param k_ij - Optional binary interaction matrix (overrides instance-level `this.k_ij`).
   * @returns Tuple: [amix, bmix, aij, A_mix, B_mix].
   */
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

  /**
   * Computes binary attractive parameter interaction term.
   *
   * @param ai - Component i attractive parameter.
   * @param aj - Component j attractive parameter.
   * @param kij - Binary interaction coefficient. Defaults to `0`.
   * @returns Interaction-corrected geometric mean: sqrt(ai * aj) * (1 - kij).
   */
  protected __aij(ai: number, aj: number, kij = 0): number {
    return Math.sqrt(Math.max(ai, 0) * Math.max(aj, 0)) * (1 - kij);
  }

  /**
   * Calculates the quadratic coefficient (alpha) of the cubic EOS polynomial.
   *
   * For the cubic Z³ + alpha·Z² + beta·Z + gamma = 0.
   *
   * @param B - Dimensionless covolume parameter.
   * @param eosNameSet - EOS model constants (sigma, epsilon).
   * @returns Alpha coefficient.
   */
  eosAlpha(B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    return (eosNameSet.epsilon + eosNameSet.sigma - 1) * B - 1;
  }

  /**
   * Calculates the linear coefficient (beta) of the cubic EOS polynomial.
   *
   * For the cubic Z³ + alpha·Z² + beta·Z + gamma = 0.
   *
   * @param A - Dimensionless attractive parameter.
   * @param B - Dimensionless covolume parameter.
   * @param eosNameSet - EOS model constants (sigma, epsilon).
   * @returns Beta coefficient.
   */
  eosBeta(A: number, B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    const { sigma, epsilon } = eosNameSet;
    return A + (epsilon * sigma - epsilon - sigma) * (B ** 2) - (epsilon + sigma) * B;
  }

  /**
   * Calculates the constant coefficient (gamma) of the cubic EOS polynomial.
   *
   * For the cubic Z³ + alpha·Z² + beta·Z + gamma = 0.
   *
   * @param A - Dimensionless attractive parameter.
   * @param B - Dimensionless covolume parameter.
   * @param eosNameSet - EOS model constants (sigma, epsilon).
   * @returns Gamma coefficient.
   */
  eosGamma(A: number, B: number, eosNameSet: { sigma: number; epsilon: number }): number {
    const { sigma, epsilon } = eosNameSet;
    return -(A * B + epsilon * sigma * (B ** 2) * (1 + B));
  }

  /**
   * Evaluates the cubic EOS polynomial at a given compressibility factor.
   *
   * @param x - Compressibility factor (Z).
   * @param params - EOS parameters including A, B, sigma, epsilon.
   * @returns Polynomial evaluation result (should be ~0 at real roots).
   */
  eosEquation(x: number, params: { A: number; B: number; sigma: number; epsilon: number }): number {
    return (x ** 3) + this.eosAlpha(params.B, params) * (x ** 2) + this.eosBeta(params.A, params.B, params) * x + this.eosGamma(params.A, params.B, params);
  }

  /**
   * Returns the cubic EOS polynomial coefficients for single-component systems.
   *
   * @param params - EOS parameters including A, B, sigma, epsilon.
   * @returns Coefficient array: [1, alpha, beta, gamma] for Z³ + alpha·Z² + beta·Z + gamma = 0.
   */
  eosEquationCoefficient(params: { A: number; B: number; sigma: number; epsilon: number }): [number, number, number, number] {
    return [1, this.eosAlpha(params.B, params), this.eosBeta(params.A, params.B, params), this.eosGamma(params.A, params.B, params)];
  }

  /**
   * Evaluates the cubic EOS polynomial for mixture systems at a given compressibility factor.
   *
   * @param x - Compressibility factor (Z).
   * @param params - Mixture EOS parameters including A, B, sigma, epsilon.
   * @returns Polynomial evaluation result (should be ~0 at real roots).
   */
  eosEquationMixture(x: number, params: MixtureEosParams): number {
    return (x ** 3) + this.eosAlpha(params.B, params) * (x ** 2) + this.eosBeta(params.A, params.B, params) * x + this.eosGamma(params.A, params.B, params);
  }

  /**
   * Returns the cubic EOS polynomial coefficients for mixture systems.
   *
   * @param params - Mixture EOS parameters including A, B, sigma, epsilon.
   * @returns Coefficient array: [1, alpha, beta, gamma] for Z³ + alpha·Z² + beta·Z + gamma = 0.
   */
  eosEquationCoefficientMixture(params: MixtureEosParams): [number, number, number, number] {
    return [1, this.eosAlpha(params.B, params), this.eosBeta(params.A, params.B, params), this.eosGamma(params.A, params.B, params)];
  }

  /**
   * Reads a required property from component datasource and converts to target unit.
   *
   * @param node - Component property map.
   * @param symbol - Property symbol (for example: Pc, Tc, AcFa).
   * @param outUnit - Target unit for unit conversion.
   * @returns Converted property value.
   * @throws {ThermoModelError} `MISSING_PROPERTY` when property symbol is not found.
   */
  protected readProp(node: ComponentDataMap, symbol: string, outUnit: string): number {
    const entry = node[symbol];
    if (!entry) throw new ThermoModelError(`Required property ${symbol} not found`, "MISSING_PROPERTY");
    return this.convertEntry(entry, outUnit);
  }

  /**
   * Reads an optional property from component datasource and converts to target unit.
   *
   * @param node - Component property map.
   * @param symbol - Property symbol (for example: Zc).
   * @param outUnit - Target unit for unit conversion.
   * @returns Converted property value, or `undefined` if property is absent.
   */
  protected readOptionalProp(node: ComponentDataMap, symbol: string, outUnit: string): number | undefined {
    const entry = node[symbol];
    if (!entry) return undefined;
    return this.convertEntry(entry, outUnit);
  }

  /**
   * Converts a property node value to the target unit.
   *
   * @param entry - Property node with value and unit metadata.
   * @param outUnit - Target unit. Use `"-"` for dimensionless properties (no conversion).
   * @returns Converted numeric value.
   */
  protected convertEntry(entry: PropertyNode, outUnit: string): number {
    const val = Number(entry.value);
    if (outUnit === "-" || String(entry.unit) === outUnit) return val;
    return convertFromTo(val, String(entry.unit), String(outUnit));
  }
}

/**
 * Backward-compatible lowercase class alias for {@link EOSModels}.
 */
export class eosModels extends EOSModels { }
