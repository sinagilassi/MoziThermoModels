import { to } from "mozicuc";
import { R_CONST } from "../configs/constants";
import { ThermoModelError } from "../core";
import type { PhaseName, RootAnalysisEntry } from "../types";

type Structure = { symbol: string; unit: string; name?: string };
type ComponentDataMap = Record<string, { value: number; unit: string; symbol?: string }>;

type RootAnalysisSummary = {
  phase: PhaseName;
  root: number[];
  root_no: string[];
  root_analysis: number[];
  root_analysis_list: RootAnalysisEntry[];
  message?: string;
};

export class EOSUtils {
  constructor(
    protected readonly datasource: Record<string, ComponentDataMap>,
    protected readonly equationsource: Record<string, Record<string, any>>
  ) {}

  rackett(Zc: number, Pc: number, Tc: number, T: number): number {
    const Vc = (Zc * R_CONST * T) / Pc;
    const Tr = T / Tc;
    return Vc * Math.pow(Zc, Math.pow(1 - Tr, 0.2857));
  }

  poynting(V: number, Psat: number, P: number, T: number): number {
    return Math.exp(V * (P - Psat) / (R_CONST * T));
  }

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
      const VaPr = to(Number(vaPrRaw.value), `${vaPrRaw.unit ?? "Pa"} => Pa`);
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

  checkArgs(args: Record<string, Structure>, componentDatasource: ComponentDataMap): Record<string, Structure> {
    const out: Record<string, Structure> = {};
    for (const [key, spec] of Object.entries(args ?? {})) {
      if (["T", "P"].includes(spec.symbol)) continue;
      if (componentDatasource[spec.symbol]) out[key] = spec;
    }
    return out;
  }

  buildArgs(args: Record<string, Structure>, componentDatasource: ComponentDataMap): Record<string, { value: number; unit: string; symbol: string }> {
    const out: Record<string, { value: number; unit: string; symbol: string }> = {};
    for (const [key, spec] of Object.entries(args ?? {})) {
      const rec = componentDatasource[spec.symbol];
      if (!rec) continue;
      out[key] = { value: Number(rec.value), unit: rec.unit, symbol: spec.symbol };
    }
    return out;
  }

  protected readData(node: ComponentDataMap, symbol: string, outUnit: string): number {
    const item = node[symbol];
    if (!item) throw new ThermoModelError(`Missing ${symbol}`, "MISSING_PROPERTY");
    if (outUnit === "-" || item.unit === outUnit) return Number(item.value);
    return to(Number(item.value), `${item.unit} => ${outUnit}`);
  }

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
