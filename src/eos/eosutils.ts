import { convertFromTo } from "mozicuc";
import { R_CONST } from "../configs/constants";
import { ThermoModelError } from "@/errors";
import type { PhaseName, RootAnalysisEntry } from "@/types";

/** Property metadata structure used in equation argument specifications. */
type Structure = { symbol: string; unit: string; name?: string };
/** Component property dictionary mapping property symbols to property nodes. */
type ComponentDataMap = Record<string, { value: number; unit: string; symbol?: string }>;

/**
 * Root analysis result summarizing phase determination and root diagnostics.
 *
 * Includes resolved phase, root selection indices, descriptions, and detailed per-component analysis.
 */
type RootAnalysisSummary = {
  phase: PhaseName;
  root: number[];
  root_no: string[];
  root_analysis: number[];
  root_analysis_list: RootAnalysisEntry[];
  message?: string;
};

/**
 * EOS utility service for phase analysis, vapor pressure evaluation, and auxiliary property calculations.
 *
 * `EOSUtils` provides:
 * - Root analysis for phase determination based on operating conditions vs. saturation properties.
 * - Rackett correlation for saturated liquid molar volume.
 * - Poynting correction factor for pressure effects on fugacity.
 * - Equation evaluation framework using datasource and equationsource.
 *
 * Requires external datasource (component properties) and equationsource (correlation objects with `.calc` methods).
 */
export class EOSUtils {
  /**
     * Initializes EOS utilities with component and equation data sources.
     *
     * @param datasource - Component property maps keyed by component name.
     * @param equationsource - Equation objects (each with `.calc` method) keyed by component and correlation name.
     */
  constructor(
    protected readonly datasource: Record<string, ComponentDataMap>,
    protected readonly equationsource: Record<string, Record<string, any>>
  ) { }

  /**
   * Calculates saturated liquid molar volume using the Rackett correlation.
   *
   * The correlation relates liquid density to critical compression factor and reduced temperature.
   *
   * @param Zc - Critical compression factor (dimensionless).
   * @param Pc - Critical pressure in Pa.
   * @param Tc - Critical temperature in K.
   * @param T - Operating temperature in K.
   * @returns Saturated liquid molar volume in m³/mol.
   */
  rackett(Zc: number, Pc: number, Tc: number, T: number): number {
    const Vc = (Zc * R_CONST * T) / Pc;
    const Tr = T / Tc;
    return Vc * Math.pow(Zc, Math.pow(1 - Tr, 0.2857));
  }

  /**
   * Calculates the Poynting correction factor for liquid fugacity.
   *
   * Accounts for pressure effects on condensed-phase fugacity above saturation pressure.
   *
   * @param V - Molar volume in m³/mol.
   * @param Psat - Saturation (vapor) pressure in Pa.
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @returns Poynting correction factor (dimensionless, typically ≥ 1).
   */
  poynting(V: number, Psat: number, P: number, T: number): number {
    return Math.exp(V * (P - Psat) / (R_CONST * T));
  }

  /**
   * Performs EOS root analysis to determine phase and root selection strategy.
   *
   * Evaluates vapor pressure for each component, compares with operating conditions, and assigns
   * phase labels and root-count metadata for downstream EOS root solving.
   *
   * Root analysis codes:
   * - `1`: Three real roots (vapor-liquid equilibrium)
   * - `2`: One real root (liquid)
   * - `3`: One real root (vapor)
   * - `4`: One real root (supercritical fluid)
   * - `5`: One real root (critical point)
   *
   * @param P - Operating pressure in Pa.
   * @param T - Operating temperature in K.
   * @param components - Component names for datasource lookup.
   * @param tolerance - Pressure/temperature equality tolerance. Defaults to `1e-3`.
   * @param kwargs - Optional controls (reserved for bubble/dew point modes and mole fractions).
   * @returns Root analysis summary with resolved phase, root indices, and per-component diagnostics.
   * @throws {ThermoModelError} `MISSING_COMPONENT_DATASOURCE` when component data is absent.
   * @throws {ThermoModelError} `MISSING_VAPR_EQUATION` when vapor pressure equation (VaPr) is missing.
   * @throws {ThermoModelError} `EOS_ROOT_ANALYSIS_FAILED` when root analysis falls outside known cases.
   */
  eosRootAnalysis(
    P: number,
    T: number,
    components: string[],
    tolerance = 1e-3,
    kwargs: { bubble_point_pressure_mode?: string; dew_point_pressure_mode?: string; mole_fraction?: number[] } = {}
  ): RootAnalysisSummary {
    void kwargs;
    const rows: RootAnalysisEntry[] = [];
    const rootIds: number[] = [];
    const rootNo: string[] = [];
    let phase: PhaseName = "VAPOR";
    let message = "";

    for (const component of components) {
      const data = this.datasource[component];
      if (!data) throw new ThermoModelError(`Component data not found: ${component}`, "MISSING_COMPONENT_DATASOURCE");

      const eq = this.equationsource?.[component]?.VaPr;
      if (!eq) throw new ThermoModelError(`Vapor pressure equation VaPr not found for ${component}`, "MISSING_VAPR_EQUATION");

      const vaPrRaw = this.evalEquation(eq, data, { T, P });
      const VaPr = convertFromTo(Number(vaPrRaw.value), String(vaPrRaw.unit ?? "Pa"), "Pa");
      const Tc = this.readData(data, "Tc", "K");
      const Pc = this.readData(data, "Pc", "Pa");

      const pressureEqual = Math.abs(VaPr - P) < tolerance;
      const temperatureEqual = Math.abs(Tc - T) < tolerance;
      let rootAnalysis = 3;
      let rootDesc = "1 real root (vapor)";

      if (pressureEqual && T < Tc) {
        rootAnalysis = 1;
        rootDesc = "3 real roots";
        phase = "VAPOR-LIQUID";
        message = `Component ${component} at T=${T} K and P=${P} Pa is at vapor-liquid equilibrium.`;
      } else if (P >= VaPr && T < Tc) {
        rootAnalysis = 2;
        rootDesc = "1 real root (liquid)";
        phase = "LIQUID";
        message = `Component ${component} at T=${T} K and P=${P} Pa is in liquid phase.`;
      } else if (P <= VaPr && T < Tc) {
        rootAnalysis = 3;
        rootDesc = "1 real root (vapor)";
        phase = "VAPOR";
        message = `Component ${component} at T=${T} K and P=${P} Pa is in vapor phase.`;
      } else if (T > Tc) {
        rootAnalysis = 4;
        rootDesc = "1 real root (supercritical fluid)";
        phase = "SUPERCRITICAL";
        message = `Component ${component} at T=${T} K and P=${P} Pa is in supercritical phase.`;
      } else if (temperatureEqual) {
        rootAnalysis = 5;
        rootDesc = "1 real root (critical point)";
        phase = "CRITICAL";
        message = `Component ${component} at T=${T} K and P=${P} Pa is at critical point.`;
      } else {
        throw new ThermoModelError(`Unknown root analysis for ${component}`, "EOS_ROOT_ANALYSIS_FAILED");
      }

      rootIds.push(rootAnalysis);
      rootNo.push(rootDesc);
      rows.push({
        component_name: component,
        pressure: { value: P, unit: "Pa", symbol: "P" },
        temperature: { value: T, unit: "K", symbol: "T" },
        vapor_pressure: { value: VaPr, unit: "Pa", symbol: "VaPr" },
        critical_pressure: { value: Pc, unit: "Pa", symbol: "Pc" },
        critical_temperature: { value: Tc, unit: "K", symbol: "Tc" },
        root_analysis: rootAnalysis,
        root: rootDesc,
        message
      });
    }

    return {
      phase,
      root: rootIds,
      root_no: rootNo,
      root_analysis: rootIds,
      root_analysis_list: rows,
      message
    };
  }

  /**
   * Filters equation argument specifications to retain only datasource-backed symbols.
   *
   * Excludes operating variables (T, P) and returns only symbols present in component datasource.
   *
   * @param args - Argument specification map.
   * @param componentDatasource - Component property map.
   * @returns Filtered argument specifications.
   */
  checkArgs(args: Record<string, Structure>, componentDatasource: ComponentDataMap): Record<string, Structure> {
    const out: Record<string, Structure> = {};
    for (const [key, spec] of Object.entries(args ?? {})) {
      if (["T", "P"].includes(spec.symbol)) continue;
      if (componentDatasource[spec.symbol]) out[key] = spec;
    }
    return out;
  }

  /**
   * Builds argument value map from datasource for equation evaluation.
   *
   * Populates argument values with component property data based on symbol matching.
   *
   * @param args - Argument specification map.
   * @param componentDatasource - Component property map.
   * @returns Argument value map ready for equation execution.
   */
  buildArgs(args: Record<string, Structure>, componentDatasource: ComponentDataMap): Record<string, { value: number; unit: string; symbol: string }> {
    const out: Record<string, { value: number; unit: string; symbol: string }> = {};
    for (const [key, spec] of Object.entries(args ?? {})) {
      const rec = componentDatasource[spec.symbol];
      if (!rec) continue;
      out[key] = { value: Number(rec.value), unit: rec.unit, symbol: spec.symbol };
    }
    return out;
  }

  /**
   * Reads a property from component datasource and converts to target unit.
   *
   * @param node - Component property map.
   * @param symbol - Property symbol (for example: Tc, Pc, Zc).
   * @param outUnit - Target unit for unit conversion. Use `"-"` for dimensionless properties.
   * @returns Converted numeric value.
   * @throws {ThermoModelError} `MISSING_PROPERTY` when property symbol is not found.
   */
  protected readData(node: ComponentDataMap, symbol: string, outUnit: string): number {
    const item = node[symbol];
    if (!item) throw new ThermoModelError(`Missing ${symbol}`, "MISSING_PROPERTY");
    if (outUnit === "-" || item.unit === outUnit) return Number(item.value);
    return convertFromTo(Number(item.value), String(item.unit), String(outUnit));
  }

  /**
   * Evaluates an equation object using datasource and operating condition variables.
   *
   * Resolves equation arguments from datasource properties or runtime variables (P, T), then
   * calls the equation's `.calc` method.
   *
   * @param eq - Equation object with `.argumentSymbolList` or `.configArguments` and `.calc(argMap)`.
   * @param data - Component property map.
   * @param vars - Runtime variables (typically `{ T, P }`).
   * @returns Equation result with numeric value and unit.
   * @throws {ThermoModelError} `EQUATION_EXEC_FAILED` when equation execution fails or returns invalid data.
   */
  protected evalEquation(eq: any, data: ComponentDataMap, vars: Record<string, number>): { value: number; unit: string } {
    const argSymbols: string[] = Array.isArray(eq?.argumentSymbolList)
      ? eq.argumentSymbolList
      : Object.keys(eq?.configArguments ?? {});
    const argMap: Record<string, { value: number; unit: string; symbol: string }> = {};
    for (const sym of argSymbols) {
      if (Object.prototype.hasOwnProperty.call(vars, sym)) {
        argMap[sym] = { value: vars[sym], unit: sym === "P" ? "Pa" : sym === "T" ? "K" : "-", symbol: sym };
        continue;
      }
      const rec = data[sym];
      if (rec) argMap[sym] = { value: Number(rec.value), unit: rec.unit, symbol: sym };
    }
    const res = typeof eq?.calc === "function" ? eq.calc(argMap) : null;
    if (!res || typeof res.value !== "number") {
      throw new ThermoModelError("Equation execution failed", "EQUATION_EXEC_FAILED");
    }
    return { value: Number(res.value), unit: String(res.unit ?? "-") };
  }
}
