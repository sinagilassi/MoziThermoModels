import { to } from "mozicuc";
import type { Component, EosModelName, LiquidFugacityMode, MixtureEosRootResult, MixtureFugacityResult, PhaseName, SolverMethod, ComponentEosRootResult, ComponentGasFugacityResult } from "../types";
import { normalizeEosModelName, setFeedSpecification, ThermoModelError } from "../core";
import { FugacityCore } from "./fugacitycore";
import { EOSUtils } from "./eosutils";

type ModelInput = {
  component?: string;
  "feed-specification"?: Record<string, number>;
  phase?: PhaseName;
  pressure?: [number, string];
  temperature?: [number, string];
};

type ModelSource = {
  datasource?: Record<string, any>;
  equationsource?: Record<string, any>;
  dataSource?: Record<string, any>;
  equationSource?: Record<string, any>;
};

export class EosCore {
  parseModelInputs(modelInputs: string): Record<string, unknown> {
    if (!modelInputs || modelInputs === "None") throw new ThermoModelError("Model inputs are not provided", "MISSING_MODEL_INPUT");
    const txt = modelInputs.trim();
    try {
      return JSON.parse(txt);
    } catch {
      throw new ThermoModelError("Parsing model inputs failed: only JSON strings are supported in TS port", "PARSE_MODEL_INPUT_FAILED");
    }
  }

  calFugacity(
    modelName: EosModelName,
    modelInput: ModelInput,
    modelSource: ModelSource,
    solverMethod: SolverMethod = "ls",
    liquidFugacityMode: LiquidFugacityMode = "EOS",
    kwargs: Record<string, unknown> = {}
  ): ComponentGasFugacityResult {
    const datasource = getDataSource(modelSource);
    const equationsource = getEquationSource(modelSource);
    const eos_model = normalizeEosModelName(modelName);
    const phase = (modelInput.phase?.toUpperCase?.() as PhaseName | undefined) ?? undefined;
    const component = modelInput.component?.trim();
    if (!component) throw new ThermoModelError("Component name is not provided", "MISSING_COMPONENT");
    if (!modelInput.pressure || !modelInput.temperature) throw new ThermoModelError("Missing operating conditions", "MISSING_OPERATING_CONDITIONS");

    let phaseResolved = phase;
    if (!phaseResolved) {
      phaseResolved = this.checkEosRootsSingleComponent(eos_model, modelInput, modelSource, kwargs).phase;
    }

    const fc = new FugacityCore(
      datasource,
      equationsource,
      [component],
      { pressure: modelInput.pressure, temperature: modelInput.temperature },
      { phase: phaseResolved, "eos-model": eos_model, mode: "single", "liquid-fugacity-mode": liquidFugacityMode },
      { k_ij: kwargs.k_ij as number[][] | undefined }
    );

    const fug = fc.fugacityCal([1], solverMethod);
    const P = to(Number(modelInput.pressure[0]), `${modelInput.pressure[1]} => Pa`);
    const T = to(Number(modelInput.temperature[0]), `${modelInput.temperature[1]} => K`);
    const phaseKey = String(fug.phase ?? phaseResolved) as PhaseName;
    const phiVal = typeof fug.phi === "number" ? fug.phi : 1;
    const fVal = typeof fug.fugacity === "number" ? fug.fugacity : phiVal * P;

    return {
      component,
      pressure: { value: P, unit: "Pa", symbol: "P" },
      temperature: { value: T, unit: "K", symbol: "T" },
      results: {
        [phaseKey]: {
          phase: phaseKey,
          compressibility_factor: { value: Number(fug.Z), unit: "-", symbol: "Z" },
          fugacity_coefficient: { value: Number(phiVal), unit: "-", symbol: "phi" },
          fugacity: { value: Number(fVal), unit: "Pa", symbol: "f" },
          selected_root: Number(fug.Z),
          roots: Array.isArray(fug.roots) ? fug.roots.map(Number) : undefined,
          solver_method: String(fug.solver_method ?? solverMethod),
          calculation_mode: String(fug.calculation_mode ?? "single"),
          message: typeof fug.solver_note === "string" ? fug.solver_note : undefined
        }
      }
    };
  }

  calcFugacity(...args: Parameters<EosCore["calFugacity"]>): ComponentGasFugacityResult {
    return this.calFugacity(...args);
  }

  checkEosRootsSingleComponent(
    modelName: EosModelName,
    modelInput: ModelInput,
    modelSource: ModelSource,
    kwargs: Record<string, unknown> = {}
  ): ComponentEosRootResult {
    const datasource = getDataSource(modelSource);
    const equationsource = getEquationSource(modelSource);
    const component = modelInput.component?.trim();
    if (!component) throw new ThermoModelError("Component name is not provided", "MISSING_COMPONENT");
    if (!modelInput.pressure || !modelInput.temperature) throw new ThermoModelError("Missing operating conditions", "MISSING_OPERATING_CONDITIONS");
    const P = to(Number(modelInput.pressure[0]), `${modelInput.pressure[1]} => Pa`);
    const T = to(Number(modelInput.temperature[0]), `${modelInput.temperature[1]} => K`);
    const util = new EOSUtils(datasource, equationsource);
    const root = util.eosRootAnalysis(P, T, [component], Number(kwargs.tolerance ?? 1e-3), {
      bubble_point_pressure_mode: kwargs.bubble_point_pressure_mode as string | undefined,
      dew_point_pressure_mode: kwargs.dew_point_pressure_mode as string | undefined,
      mole_fraction: [1]
    });
    void modelName;
    return {
      component,
      phase: root.phase,
      pressure: { value: P, unit: "Pa", symbol: "P" },
      temperature: { value: T, unit: "K", symbol: "T" },
      root_analysis: root.root_analysis_list,
      message: root.message
    };
  }

  calFugacityMixture(
    modelName: EosModelName,
    modelInput: ModelInput,
    modelSource: ModelSource,
    solverMethod: SolverMethod = "ls",
    kwargs: Record<string, unknown> = {}
  ): MixtureFugacityResult {
    const datasource = getDataSource(modelSource);
    const equationsource = getEquationSource(modelSource);
    const eos_model = normalizeEosModelName(modelName);
    if (!modelInput.pressure || !modelInput.temperature) throw new ThermoModelError("Missing operating conditions", "MISSING_OPERATING_CONDITIONS");
    const feed = setFeedSpecification({ "feed-specification": modelInput["feed-specification"] ?? {} });
    const components = Object.keys(feed);
    const yi = Object.values(feed);
    if (!components.length) throw new ThermoModelError("Feed specification is empty", "MISSING_FEED_SPECIFICATION");

    let phaseResolved = (modelInput.phase?.toUpperCase?.() as PhaseName | undefined) ?? undefined;
    if (!phaseResolved) {
      phaseResolved = this.checkEosRootsMultiComponent(eos_model, modelInput, modelSource, kwargs).phase;
    }

    const fc = new FugacityCore(
      datasource,
      equationsource,
      components,
      { pressure: modelInput.pressure, temperature: modelInput.temperature },
      { phase: phaseResolved, "eos-model": eos_model, mode: "mixture", "liquid-fugacity-mode": (kwargs.liquid_fugacity_mode as LiquidFugacityMode | undefined) ?? "EOS" },
      { k_ij: kwargs.k_ij as number[][] | undefined }
    );

    const fug = fc.fugacityCal(yi, solverMethod);
    const P = to(Number(modelInput.pressure[0]), `${modelInput.pressure[1]} => Pa`);
    const T = to(Number(modelInput.temperature[0]), `${modelInput.temperature[1]} => K`);
    const phaseKey = String(fug.phase ?? phaseResolved) as PhaseName;

    return {
      components,
      pressure: { value: P, unit: "Pa", symbol: "P" },
      temperature: { value: T, unit: "K", symbol: "T" },
      results: {
        [phaseKey]: {
          phase: phaseKey,
          compressibility_factor: { value: Number(fug.Z), unit: "-", symbol: "Z" },
          fugacity_coefficient: { value: (fug.phi as Record<string, number>) ?? {}, unit: "-", symbol: "phi_i" },
          fugacity: { value: (fug.fugacity as Record<string, number>) ?? {}, unit: "Pa", symbol: "f_i" },
          selected_root: Number(fug.Z),
          roots: Array.isArray(fug.roots) ? fug.roots.map(Number) : undefined,
          solver_method: String(fug.solver_method ?? solverMethod),
          calculation_mode: String(fug.calculation_mode ?? "mixture"),
          message: typeof fug.solver_note === "string" ? fug.solver_note : undefined
        }
      }
    };
  }

  calcFugacityMixture(...args: Parameters<EosCore["calFugacityMixture"]>): MixtureFugacityResult {
    return this.calFugacityMixture(...args);
  }

  checkEosRootsMultiComponent(
    modelName: EosModelName,
    modelInput: ModelInput,
    modelSource: ModelSource,
    kwargs: Record<string, unknown> = {}
  ): MixtureEosRootResult {
    const datasource = getDataSource(modelSource);
    const equationsource = getEquationSource(modelSource);
    if (!modelInput.pressure || !modelInput.temperature) throw new ThermoModelError("Missing operating conditions", "MISSING_OPERATING_CONDITIONS");
    const feed = setFeedSpecification({ "feed-specification": modelInput["feed-specification"] ?? {} });
    const components = Object.keys(feed);
    const yi = Object.values(feed);
    const P = to(Number(modelInput.pressure[0]), `${modelInput.pressure[1]} => Pa`);
    const T = to(Number(modelInput.temperature[0]), `${modelInput.temperature[1]} => K`);
    const util = new EOSUtils(datasource, equationsource);
    const root = util.eosRootAnalysis(P, T, components, Number(kwargs.tolerance ?? 1e-3), { mole_fraction: yi });
    void modelName;
    return {
      components,
      phase: root.phase,
      pressure: { value: P, unit: "Pa", symbol: "P" },
      temperature: { value: T, unit: "K", symbol: "T" },
      root_analysis: root.root_analysis_list,
      message: root.message
    };
  }
}

export class eosCore extends EosCore {}

function getDataSource(modelSource: ModelSource): Record<string, any> {
  const ds = modelSource.dataSource ?? modelSource.datasource;
  if (!ds) throw new ThermoModelError("Missing datasource in model_source", "MISSING_MODEL_SOURCE");
  return ds;
}

function getEquationSource(modelSource: ModelSource): Record<string, any> {
  const es = modelSource.equationSource ?? modelSource.equationsource;
  if (!es) throw new ThermoModelError("Missing equationsource in model_source", "MISSING_MODEL_SOURCE");
  return es;
}
