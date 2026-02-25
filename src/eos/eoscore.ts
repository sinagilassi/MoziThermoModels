import { convertFromTo } from "mozicuc";
import type { ModelSource } from "mozithermodb";
import type {
  EosModelName,
  LiquidFugacityMode,
  MixtureEosRootResult,
  MixtureFugacityResult,
  PhaseName,
  SolverMethod,
  ComponentEosRootResult,
  ComponentGasFugacityResult
} from "@/types";
import { normalizeEosModelName, setFeedSpecification } from "@/utils";
import { ThermoModelError } from "@/errors";
import { FugacityCore } from "./fugacitycore";
import { EOSUtils } from "./eosutils";

type ModelInput = {
  component?: string;
  "feed-specification"?: Record<string, number>;
  phase?: PhaseName;
  pressure?: [number, string];
  temperature?: [number, string];
};

/**
 * Core EOS execution service for parsing inputs, root analysis, and fugacity calculations.
 *
 * `EosCore` is the primary EOS computation facade in the TypeScript port. It validates model inputs,
 * normalizes model names, resolves phase when not explicitly provided, and delegates numerical EOS work
 * to lower-level helpers (`FugacityCore` and `EOSUtils`).
 *
 * Supported workflows:
 * - Single-component fugacity (`calFugacity` / `calcFugacity`)
 * - Single-component root analysis (`checkEosRootsSingleComponent`)
 * - Mixture fugacity (`calFugacityMixture` / `calcFugacityMixture`)
 * - Mixture root analysis (`checkEosRootsMultiComponent`)
 */
export class EosCore {
  /**
   * Parses model inputs from a JSON string.
   *
   * Only JSON-string input is supported in this TypeScript port. Python-style object string forms
   * (for example, non-JSON literals) are rejected.
   *
   * @param modelInputs - JSON text representing model input fields.
   * @returns Parsed key-value object.
   * @throws {ThermoModelError} `MISSING_MODEL_INPUT` when input is empty or equals `"None"`.
   * @throws {ThermoModelError} `PARSE_MODEL_INPUT_FAILED` when JSON parsing fails.
   */
  parseModelInputs(modelInputs: string): Record<string, unknown> {
    if (!modelInputs || modelInputs === "None") throw new ThermoModelError("Model inputs are not provided", "MISSING_MODEL_INPUT");
    const txt = modelInputs.trim();
    try {
      return JSON.parse(txt);
    } catch {
      throw new ThermoModelError("Parsing model inputs failed: only JSON strings are supported in TS port", "PARSE_MODEL_INPUT_FAILED");
    }
  }

  /**
   * Calculates fugacity for a single component using the selected EOS model.
   *
   * The method validates required fields, resolves phase when omitted via root analysis, executes
   * EOS fugacity calculation, converts operating units to SI, and formats a typed result payload.
   *
   * @param modelName - EOS model identifier.
   * @param modelInput - Single-component operating input (component, pressure, temperature, optional phase).
   * @param modelSource - Data/equation source provider used by EOS engines.
   * @param solverMethod - Root solver method for EOS calculations. Defaults to `"ls"`.
   * @param liquidFugacityMode - Liquid fugacity handling mode. Defaults to `"EOS"`.
   * @param kwargs - Optional controls (for example: `k_ij`, `tolerance`, phase-analysis options).
   * @returns Single-component gas fugacity result with SI-normalized pressure/temperature.
   * @throws {ThermoModelError} `MISSING_COMPONENT` when component name is absent.
   * @throws {ThermoModelError} `MISSING_OPERATING_CONDITIONS` when pressure/temperature are missing.
   * @throws {ThermoModelError} `MISSING_MODEL_SOURCE` when model source payload is incomplete.
   */
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
    const P = convertFromTo(Number(modelInput.pressure[0]), String(modelInput.pressure[1]), "Pa");
    const T = convertFromTo(Number(modelInput.temperature[0]), String(modelInput.temperature[1]), "K");
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

  /**
   * Compatibility alias for {@link calFugacity}.
   *
   * @param args - Forwarded arguments for {@link calFugacity}.
   * @returns The same result as {@link calFugacity}.
   */
  calcFugacity(...args: Parameters<EosCore["calFugacity"]>): ComponentGasFugacityResult {
    return this.calFugacity(...args);
  }

  /**
   * Performs EOS root analysis for a single-component system.
   *
   * This method converts operating conditions to SI, runs root analysis via `EOSUtils`, and returns
   * phase decision metadata used by downstream fugacity workflows.
   *
   * @param modelName - EOS model identifier (currently preserved for compatibility).
   * @param modelInput - Single-component operating input including component, pressure, and temperature.
   * @param modelSource - Data/equation source provider used by EOS utilities.
   * @param kwargs - Optional root-analysis controls (`tolerance`, dew/bubble-point modes).
   * @returns Single-component root analysis result including selected phase and roots.
   * @throws {ThermoModelError} `MISSING_COMPONENT` when component name is absent.
   * @throws {ThermoModelError} `MISSING_OPERATING_CONDITIONS` when pressure/temperature are missing.
   * @throws {ThermoModelError} `MISSING_MODEL_SOURCE` when model source payload is incomplete.
   */
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
    const P = convertFromTo(Number(modelInput.pressure[0]), String(modelInput.pressure[1]), "Pa");
    const T = convertFromTo(Number(modelInput.temperature[0]), String(modelInput.temperature[1]), "K");
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

  /**
   * Calculates fugacity for a mixture system using the selected EOS model.
   *
   * The method validates operating conditions and feed specification, resolves phase when omitted,
   * executes mixture fugacity, and returns SI-normalized output fields.
   *
   * @param modelName - EOS model identifier.
   * @param modelInput - Mixture operating input including feed specification, pressure, and temperature.
   * @param modelSource - Data/equation source provider used by EOS engines.
   * @param solverMethod - Root solver method for EOS calculations. Defaults to `"ls"`.
   * @param kwargs - Optional controls (for example: `k_ij`, `liquid_fugacity_mode`, `tolerance`).
   * @returns Mixture fugacity result keyed by resolved phase with component-wise properties.
   * @throws {ThermoModelError} `MISSING_FEED_SPECIFICATION` when feed composition is empty.
   * @throws {ThermoModelError} `MISSING_OPERATING_CONDITIONS` when pressure/temperature are missing.
   * @throws {ThermoModelError} `MISSING_MODEL_SOURCE` when model source payload is incomplete.
   */
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
    const P = convertFromTo(Number(modelInput.pressure[0]), String(modelInput.pressure[1]), "Pa");
    const T = convertFromTo(Number(modelInput.temperature[0]), String(modelInput.temperature[1]), "K");
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

  /**
   * Compatibility alias for {@link calFugacityMixture}.
   *
   * @param args - Forwarded arguments for {@link calFugacityMixture}.
   * @returns The same result as {@link calFugacityMixture}.
   */
  calcFugacityMixture(...args: Parameters<EosCore["calFugacityMixture"]>): MixtureFugacityResult {
    return this.calFugacityMixture(...args);
  }

  /**
   * Performs EOS root analysis for a mixture system.
   *
   * This method computes normalized mixture composition from feed specification, converts operating
   * conditions to SI, and returns phase/root diagnostics used by mixture fugacity workflows.
   *
   * @param modelName - EOS model identifier (currently preserved for compatibility).
   * @param modelInput - Mixture operating input including feed specification, pressure, and temperature.
   * @param modelSource - Data/equation source provider used by EOS utilities.
   * @param kwargs - Optional root-analysis controls (for example: `tolerance`).
   * @returns Mixture root analysis result including selected phase and roots.
   * @throws {ThermoModelError} `MISSING_OPERATING_CONDITIONS` when pressure/temperature are missing.
   * @throws {ThermoModelError} `MISSING_MODEL_SOURCE` when model source payload is incomplete.
   */
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
    const P = convertFromTo(Number(modelInput.pressure[0]), String(modelInput.pressure[1]), "Pa");
    const T = convertFromTo(Number(modelInput.temperature[0]), String(modelInput.temperature[1]), "K");
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

/**
 * Backward-compatible lowercase class alias for {@link EosCore}.
 */
export class eosCore extends EosCore { }

function getDataSource(modelSource: ModelSource): Record<string, any> {
  const ds = modelSource.dataSource;
  if (!ds) throw new ThermoModelError("Missing dataSource in modelSource", "MISSING_MODEL_SOURCE");
  return ds as Record<string, any>;
}

function getEquationSource(modelSource: ModelSource): Record<string, any> {
  const es = modelSource.equationSource;
  if (!es) throw new ThermoModelError("Missing equationSource in modelSource", "MISSING_MODEL_SOURCE");
  return es as Record<string, any>;
}
