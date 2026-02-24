import { to } from "mozicuc";
import { ThermoModelError } from "../core";
import type { EosModelName, LiquidFugacityMode, PhaseName } from "../types";
import { EOSManager } from "./eosmanager";
import { EOSUtils } from "./eosutils";

type ComponentDataMap = Record<string, { value: number; unit: string; symbol?: string }>;

export class FugacityCore extends EOSManager {
  override datasource: Record<string, ComponentDataMap>;
  override equationsource: Record<string, any>;
  components: string[];
  P: number;
  T: number;
  private _phase!: PhaseName;
  eos_model: EosModelName;
  mode: "single" | "mixture";
  liquid_fugacity_calculation_method: LiquidFugacityMode;
  componentsNo: number;
  system_type: "SINGLE" | "MIXTURE";
  root_analysis_set: number;
  private eosUtils: EOSUtils;

  constructor(
    datasource: Record<string, ComponentDataMap>,
    equationsource: Record<string, any>,
    components: string[],
    operating_conditions: { pressure: [number, string]; temperature: [number, string] },
    eos_parms: { phase: PhaseName; "eos-model": EosModelName; mode: "single" | "mixture"; "liquid-fugacity-mode": LiquidFugacityMode },
    kwargs: { k_ij?: number[][] } = {}
  ) {
    super(datasource, equationsource, kwargs);
    this.datasource = datasource;
    this.equationsource = equationsource;
    this.components = components;
    this.P = to(Number(operating_conditions.pressure[0]), `${operating_conditions.pressure[1]} => Pa`);
    this.T = to(Number(operating_conditions.temperature[0]), `${operating_conditions.temperature[1]} => K`);
    this.phase = eos_parms.phase;
    this.eos_model = eos_parms["eos-model"];
    this.mode = eos_parms.mode;
    this.liquid_fugacity_calculation_method = eos_parms["liquid-fugacity-mode"];
    this.componentsNo = components.length;
    this.system_type = this.componentsNo === 1 ? "SINGLE" : "MIXTURE";
    this.root_analysis_set = this.rootAnalysisMode(this.phase);
    this.eosUtils = new EOSUtils(datasource, equationsource);
  }

  get phase(): PhaseName { return this._phase; }
  set phase(value: PhaseName) {
    if (!["VAPOR", "LIQUID", "VAPOR-LIQUID", "SUPERCRITICAL", "SOLID", "CRITICAL"].includes(value)) {
      throw new ThermoModelError(`Invalid phase: ${value}`, "INVALID_PHASE");
    }
    this._phase = value;
  }

  rootAnalysisMode(phase: PhaseName): number {
    if (phase === "VAPOR-LIQUID") return 1;
    if (phase === "LIQUID" && this.liquid_fugacity_calculation_method === "EOS") return 2;
    if (phase === "LIQUID" && this.liquid_fugacity_calculation_method === "Poynting") return 1;
    if (phase === "VAPOR") return 3;
    if (phase === "SUPERCRITICAL" || phase === "CRITICAL") return 4;
    if (phase === "SOLID") return 4;
    throw new ThermoModelError(`Invalid phase: ${phase}`, "INVALID_PHASE");
  }

  fugacityCal(yi: number[], solverMethod: string) {
    if (this.phase === "SOLID") return this.solidFugacity();
    if (this.phase === "LIQUID" && this.system_type === "SINGLE" && this.liquid_fugacity_calculation_method === "Poynting") {
      return this.liquidFugacity({ yi, solver_method: solverMethod, root_analysis_set: this.root_analysis_set });
    }
    return this.gasFugacity(yi, { solver_method: solverMethod, root_analysis_set: this.root_analysis_set });
  }

  gasFugacity(yi: number[] = [], kwargs: { solver_method?: string; root_analysis_set?: number } = {}) {
    const rootAnalysis = {
      root: [kwargs.root_analysis_set ?? this.root_analysis_set],
      phase: this.phase
    };
    const res = this.eosFugacity({
      P: this.P,
      T: this.T,
      components: this.components,
      yi,
      eosModel: this.eos_model,
      mode: this.mode,
      rootAnalysis,
      solverMethod: kwargs.solver_method ?? "ls"
    });

    return {
      phase: this.phase,
      Z: res.Z,
      roots: res.roots,
      phi: res.phi,
      fugacity: res.fugacity,
      solver_method: res.solver_method,
      solver_note: res.solver_note,
      calculation_mode: this.mode
    };
  }

  liquidFugacity(kwargs: { yi?: number[]; solver_method?: string; root_analysis_set?: number } = {}) {
    if (this.components.length !== 1) {
      return this.gasFugacity(kwargs.yi ?? [], kwargs);
    }

    if (this.liquid_fugacity_calculation_method === "EOS") {
      return this.gasFugacity(kwargs.yi ?? [1], { ...kwargs, root_analysis_set: 2 });
    }

    const comp = this.components[0];
    const data = this.datasource[comp];
    if (!data) throw new ThermoModelError(`Missing data for ${comp}`, "MISSING_COMPONENT_DATASOURCE");

    const root = this.eosUtils.eosRootAnalysis(this.P, this.T, [comp], 1e-3);
    const Psat = Number(root.root_analysis_list[0]?.vapor_pressure?.value ?? this.P);
    const Tc = Number(root.root_analysis_list[0]?.critical_temperature?.value ?? this.T);
    const Pc = Number(root.root_analysis_list[0]?.critical_pressure?.value ?? this.P);
    const Zc = data.Zc ? Number(data.Zc.value) : 0.27;
    const Vsat = this.eosUtils.rackett(Zc, Pc, Tc, this.T);
    const poy = this.eosUtils.poynting(Vsat, Psat, this.P, this.T);
    const vaporRef = this.gasFugacity([1], { ...kwargs, root_analysis_set: 3 });
    const phiV = typeof vaporRef.phi === "number" ? vaporRef.phi : 1;
    const fL = phiV * Psat * poy;

    return {
      phase: "LIQUID" as PhaseName,
      Z: vaporRef.Z,
      roots: vaporRef.roots,
      phi: fL / Math.max(this.P, 1e-30),
      fugacity: fL,
      poynting_term: poy,
      Psat,
      solver_method: vaporRef.solver_method,
      solver_note: vaporRef.solver_note,
      calculation_mode: this.mode
    };
  }

  solidFugacity(): never {
    throw new ThermoModelError("Solid fugacity calculation is not implemented", "NOT_IMPLEMENTED");
  }
}
