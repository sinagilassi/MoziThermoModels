import type { ModelSource } from "mozithermodb";
import { set_component_id } from "mozithermodb-settings";
// ! LOCALS
import type {
  ComponentKey,
  ComponentEosRootResult,
  ComponentGasFugacityResult,
  ComponentLiquidFugacityResult,
  EosModelName,
  FugacityPhaseMode,
  MixtureEosRootResult,
  MixtureFugacityResult,
  PhaseName,
  Pressure,
  PureComponentFugacityInput,
  RootAnalysisEntry,
  Temperature,
  Component,
} from "@/types";
import { ThermoModelCore } from "@/docs/thermomodelcore";
import { validateComponent, validatePressure, validateTemperature, normalizeModelSource, setFeedSpecification } from "@/utils";
import { ThermoModelError } from "@/errors";

const parseComponentEosRootResult = (res: ComponentEosRootResult): ComponentEosRootResult => res;
const parseGasFugacityCalcResult = (res: ComponentGasFugacityResult): ComponentGasFugacityResult => res;
const parseLiquidFugacityCalcResult = (res: ComponentGasFugacityResult): ComponentGasFugacityResult => res;
const parseMixtureEosRootResult = (res: MixtureEosRootResult): MixtureEosRootResult => res;
const parseMixtureFugacityCalcResult = (res: MixtureFugacityResult): MixtureFugacityResult => res;

type Preclassification = "supercritical" | "gas-like-single-phase" | "subcritical" | "critical";

type ClassifiedPhaseInfo = {
  preclassification: Preclassification;
  rootPhase: PhaseName;
  rootAnalysisId: number;
  rootAnalysisEntry?: RootAnalysisEntry;
  critical: { temperature?: number; pressure?: number };
  operating: { temperature: number; pressure: number };
  isAmbiguousSubcritical: boolean;
  recommendedPhase: "VAPOR" | "LIQUID" | "SUPERCRITICAL" | "CRITICAL";
  message: string;
};

function phaseModeOrDefault(mode: FugacityPhaseMode | undefined): FugacityPhaseMode {
  const resolved = (mode ?? "auto").toLowerCase();
  if (resolved === "auto" || resolved === "gas" || resolved === "liquid" || resolved === "both") return resolved;
  throw new ThermoModelError(`Invalid phaseMode: ${String(mode)}`, "INVALID_PHASE_MODE");
}

function classifyPureComponentPhase(
  root: ComponentEosRootResult,
  criticalTolerance: { temperature?: number; pressure?: number } = {}
): ClassifiedPhaseInfo {
  const row = root.root_analysis?.[0];
  const T = Number(root.temperature?.value ?? NaN);
  const P = Number(root.pressure?.value ?? NaN);
  const Tc = Number(row?.critical_temperature?.value ?? NaN);
  const Pc = Number(row?.critical_pressure?.value ?? NaN);
  const tolT = Number(criticalTolerance.temperature ?? 1e-6);
  const tolP = Number(criticalTolerance.pressure ?? 1e-3);

  const tAbove = Number.isFinite(T) && Number.isFinite(Tc) ? T > Tc + tolT : false;
  const tBelow = Number.isFinite(T) && Number.isFinite(Tc) ? T < Tc - tolT : false;
  const pAbove = Number.isFinite(P) && Number.isFinite(Pc) ? P > Pc + tolP : false;
  const pBelowOrEq = Number.isFinite(P) && Number.isFinite(Pc) ? P <= Pc + tolP : false;

  let preclassification: Preclassification = "subcritical";
  if (tAbove && pAbove) preclassification = "supercritical";
  else if (tAbove && pBelowOrEq) preclassification = "gas-like-single-phase";
  else if (!tAbove && !tBelow) preclassification = "critical";

  const rootAnalysisId = Number(row?.root_analysis ?? -1);
  const rootPhase = root.phase;
  const isAmbiguousSubcritical = preclassification === "subcritical" && rootAnalysisId === 1;

  let recommendedPhase: "VAPOR" | "LIQUID" | "SUPERCRITICAL" | "CRITICAL" = "VAPOR";
  if (preclassification === "supercritical") recommendedPhase = "SUPERCRITICAL";
  else if (rootPhase === "LIQUID") recommendedPhase = "LIQUID";
  else if (rootPhase === "CRITICAL" || preclassification === "critical") recommendedPhase = "CRITICAL";
  else if (rootPhase === "SUPERCRITICAL") recommendedPhase = "SUPERCRITICAL";

  return {
    preclassification,
    rootPhase,
    rootAnalysisId,
    rootAnalysisEntry: row,
    critical: {
      temperature: Number.isFinite(Tc) ? Tc : undefined,
      pressure: Number.isFinite(Pc) ? Pc : undefined
    },
    operating: { temperature: T, pressure: P },
    isAmbiguousSubcritical,
    recommendedPhase,
    message: `preclassification=${preclassification}; rootPhase=${rootPhase}; rootAnalysis=${rootAnalysisId}`
  };
}

function mergePhaseResults(
  gas: ComponentGasFugacityResult,
  liquid: ComponentGasFugacityResult,
  message: string,
  diagnostics: Record<string, unknown>
): ComponentGasFugacityResult {
  return {
    component: gas.component,
    pressure: gas.pressure,
    temperature: gas.temperature,
    results: {
      ...liquid.results,
      ...gas.results
    },
    message,
    diagnostics
  };
}

function withDiagnostics(
  res: ComponentGasFugacityResult,
  message: string,
  diagnostics: Record<string, unknown>
): ComponentGasFugacityResult {
  return { ...res, message, diagnostics };
}

/**
 * Analyze EOS root behavior for a single component at a given pressure/temperature.
 *
 * This is the high-level public wrapper around `ThermoModelCore.checkEosRootsSingleComponent(...)`.
 * It validates the inputs, resolves the component id using the selected `componentKey`,
 * normalizes the `modelSource` shape (`dataSource/equationSource` vs `datasource/equationsource`),
 * and returns a parsed/typed root-analysis result.
 *
 * Notes
 * - Pressure and temperature can be supplied in any unit supported by `mozicuc`.
 * - Internal EOS logic converts to SI (`Pa`, `K`) before performing the analysis.
 * - If `kwargs.phase` is provided, it is forwarded as a hint to the lower layer.
 *
 * @param component Component (`mozithermodb-settings`) used to look up thermo data/equations.
 * @param pressure Pressure object (`value`, `unit`), e.g. `{ value: 10, unit: "bar" }`.
 * @param temperature Temperature object (`value`, `unit`), e.g. `{ value: 300.15, unit: "K" }`.
 * @param modelSource MoziThermoDB-compatible model source containing component `dataSource` and `equationSource`.
 * @param modelName EOS model name (`"SRK" | "PR" | "RK" | "vdW"`). Defaults to `"SRK"`.
 * @param componentKey Component identifier strategy used to build the lookup id. Defaults to `"Name-State"`.
 * @param kwargs Optional advanced options (e.g. `phase`, `tolerance`) forwarded to the EOS layer.
 * @returns Structured single-component EOS root analysis result with detected phase and SI operating conditions.
 * @throws {ThermoModelError} If component/unit/modelSource inputs are invalid.
 */
export function checkComponentEosRoots(
  component: Component,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): ComponentEosRootResult {
  validateComponent(component);
  validatePressure(pressure);
  validateTemperature(temperature);
  const componentId = set_component_id(component as any, componentKey);
  const modelInput = {
    component: componentId,
    phase: kwargs.phase as string | undefined,
    pressure: [pressure.value, pressure.unit] as [number, string],
    temperature: [temperature.value, temperature.unit] as [number, string]
  };
  const core = new ThermoModelCore();
  return parseComponentEosRootResult(core.checkEosRootsSingleComponent(modelName, modelInput, normalizeModelSource(modelSource), kwargs));
}

/**
 * Calculate pure-component fugacity with automatic phase orchestration.
 *
 * This high-level API wraps existing low-level EOS calls (`checkComponentEosRoots`,
 * `calcGasFugacity`, `calcLiquidFugacity`) and selects execution flow based on:
 * - operating state (`T`, `P`) versus critical properties (`Tc`, `Pc`)
 * - EOS root-analysis classification
 * - requested `phaseMode`
 *
 * Phase-mode behavior:
 * - `"gas"`: force vapor-like branch (`SUPERCRITICAL` phase is used when preclassified as supercritical).
 * - `"liquid"`: force liquid-like branch.
 * - `"both"`: return both vapor/liquid candidates only for ambiguous subcritical states (`root_analysis === 1`);
 *   otherwise collapse to a single physically consistent branch.
 * - `"auto"`: supercritical single-phase when above critical region, single-phase when unambiguous,
 *   and both candidates in ambiguous subcritical region.
 *
 * Numerical options are shared for all candidate evaluations (single solver configuration), and
 * no hidden stability winner (`fL` vs `fV`) is applied in this wrapper.
 *
 * @param component Component definition (`name`, `formula`, `state`, ...).
 * @param pressure Operating pressure with unit.
 * @param temperature Operating temperature with unit.
 * @param modelSource MoziThermoDB-compatible source (`dataSource`, `equationSource`).
 * @param modelName EOS model (`"SRK" | "PR" | "RK" | "vdW"`). Defaults to `"SRK"`.
 * @param componentKey Component-id strategy for source lookup. Defaults to `"Name-State"`.
 * @param phaseMode Phase orchestration mode. Defaults to `"auto"`.
 * @param solverMethod Numerical root-solver method. Defaults to `"ls"`.
 * @param tolerance Root-analysis tolerance forwarded to lower EOS analysis.
 * @param criticalTolerance Critical-region tolerance overrides (`temperature`, `pressure`).
 * @param liquidFugacityMode Liquid fugacity mode (`"EOS"` or `"Poynting"`). Defaults to `"EOS"`.
 * @returns Single-component fugacity payload with one or two phase entries in `results`,
 * plus informative top-level `message` and `diagnostics`.
 * @throws {ThermoModelError} `INVALID_INPUT` for malformed input object.
 * @throws {ThermoModelError} `INVALID_PHASE_MODE` for unsupported `phaseMode`.
 */
export function calcFugacity({
  component,
  pressure,
  temperature,
  modelSource,
  modelName = "SRK",
  componentKey = "Name-State",
  phaseMode,
  solverMethod = "ls",
  solverOptions,
  solver_options,
  tolerance,
  criticalTolerance,
  liquidFugacityMode = "EOS"
}: PureComponentFugacityInput): ComponentGasFugacityResult {
  if (!component || !pressure || !temperature || !modelSource) {
    throw new ThermoModelError("input must include component, pressure, temperature, and modelSource", "INVALID_INPUT");
  }

  const resolvedMode = phaseModeOrDefault(phaseMode);
  const sharedOptions: Record<string, unknown> = {
    solver_method: solverMethod,
    solver_options: solverOptions ?? solver_options,
    liquid_fugacity_mode: liquidFugacityMode
  };
  if (typeof tolerance === "number") sharedOptions.tolerance = tolerance;

  const root = checkComponentEosRoots(
    component,
    pressure,
    temperature,
    modelSource,
    modelName,
    componentKey,
    typeof tolerance === "number" ? { tolerance } : {}
  );

  const classified = classifyPureComponentPhase(root, criticalTolerance);
  const diagnostics = {
    phase_mode: resolvedMode,
    solver_method: solverMethod,
    liquid_fugacity_mode: liquidFugacityMode,
    tolerance: tolerance ?? null,
    critical_tolerance: {
      temperature: criticalTolerance?.temperature ?? 1e-6,
      pressure: criticalTolerance?.pressure ?? 1e-3
    },
    classification: classified
  };

  const callGas = (phase: "VAPOR" | "SUPERCRITICAL" | "CRITICAL") =>
    calcGasFugacity(component, pressure, temperature, modelSource, modelName, componentKey, { ...sharedOptions, phase });
  const callLiquid = () =>
    calcLiquidFugacity(component, pressure, temperature, modelSource, modelName, componentKey, { ...sharedOptions, phase: "LIQUID" });

  if (resolvedMode === "gas") {
    const phase = classified.preclassification === "supercritical" ? "SUPERCRITICAL" : "VAPOR";
    return withDiagnostics(callGas(phase), `Forced gas mode resolved with phase=${phase}`, diagnostics);
  }

  if (resolvedMode === "liquid") {
    return withDiagnostics(callLiquid(), "Forced liquid mode resolved with phase=LIQUID", diagnostics);
  }

  if (resolvedMode === "both") {
    if (classified.isAmbiguousSubcritical) {
      const gas = callGas("VAPOR");
      const liquid = callLiquid();
      return mergePhaseResults(gas, liquid, "Ambiguous subcritical region detected; returning both vapor-like and liquid-like candidates.", diagnostics);
    }
    const phase = classified.recommendedPhase;
    const single = phase === "LIQUID" ? callLiquid() : callGas(phase);
    return withDiagnostics(single, `phaseMode=both collapsed to single-phase (${phase}) because the EOS root analysis is not ambiguous.`, diagnostics);
  }

  if (classified.preclassification === "supercritical") {
    return withDiagnostics(callGas("SUPERCRITICAL"), "Auto mode selected supercritical single-phase branch.", diagnostics);
  }
  if (classified.isAmbiguousSubcritical) {
    const gas = callGas("VAPOR");
    const liquid = callLiquid();
    return mergePhaseResults(gas, liquid, "Auto mode detected subcritical ambiguity; returning both liquid and vapor candidates.", diagnostics);
  }
  if (classified.recommendedPhase === "LIQUID") {
    return withDiagnostics(callLiquid(), "Auto mode selected liquid branch.", diagnostics);
  }
  return withDiagnostics(callGas(classified.recommendedPhase), `Auto mode selected ${classified.recommendedPhase} branch.`, diagnostics);
}

/**
 * Analyze EOS root behavior for a multi-component mixture at a given pressure/temperature.
 *
 * This wrapper builds a feed specification from `components[].mole_fraction` (normalized if needed),
 * resolves component ids using `componentKey`, and delegates to
 * `ThermoModelCore.checkEosRootsMultiComponent(...)`.
 *
 * Notes
 * - Components must include `name`, `formula`, and `state`.
 * - Mole fractions are read from `mole_fraction`; missing values are treated as `0` before normalization.
 * - `bubblePointPressureMode` / `dewPointPressureMode` are currently forwarded for API parity.
 *
 * @param components Mixture components (`mozithermodb-settings` `Component[]`) with `mole_fraction`.
 * @param pressure Mixture pressure (`value`, `unit`).
 * @param temperature Mixture temperature (`value`, `unit`).
 * @param modelSource MoziThermoDB-compatible model source.
 * @param modelName EOS model name. Defaults to `"SRK"`.
 * @param bubblePointPressureMode Bubble-point mode hint (currently `"Raoult"` parity option).
 * @param dewPointPressureMode Dew-point mode hint (currently `"Raoult"` parity option).
 * @param componentKey Component identifier strategy for model-source lookup. Defaults to `"Name-State"`.
 * @param kwargs Optional advanced EOS options (e.g. `tolerance`).
 * @returns Structured mixture EOS root analysis result with detected phase and per-component root summaries.
 * @throws {ThermoModelError} If components are empty or inputs/units are invalid.
 */
export function checkMultiComponentEosRoots(
  components: Component[],
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName = "SRK",
  bubblePointPressureMode = "Raoult",
  dewPointPressureMode = "Raoult",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): MixtureEosRootResult {
  if (!Array.isArray(components) || components.length === 0) throw new ThermoModelError("components must be a non-empty array", "INVALID_COMPONENTS");
  components.forEach(validateComponent);
  validatePressure(pressure);
  validateTemperature(temperature);

  const feed = setFeedSpecification(Object.fromEntries(components.map((c) => [set_component_id(c as any, componentKey), Number(c.mole_fraction ?? 0)])));

  const modelInput = {
    "feed-specification": feed,
    pressure: [pressure.value, pressure.unit] as [number, string],
    temperature: [temperature.value, temperature.unit] as [number, string]
  };

  const core = new ThermoModelCore();
  return parseMixtureEosRootResult(core.checkEosRootsMultiComponent(modelName, modelInput, normalizeModelSource(modelSource), {
    ...kwargs,
    bubble_point_pressure_mode: bubblePointPressureMode,
    dew_point_pressure_mode: dewPointPressureMode
  }));
}

/**
 * Calculate gas-phase fugacity for a single component using an EOS model.
 *
 * This is a convenience wrapper around the shared single-component calculator (`calcSingle`) that
 * defaults the requested phase to `"VAPOR"` unless explicitly overridden in `kwargs.phase`.
 *
 * @param component Component (`mozithermodb-settings`) used to resolve thermo properties and EOS equations.
 * @param pressure Operating pressure (`value`, `unit`).
 * @param temperature Operating temperature (`value`, `unit`).
 * @param modelSource MoziThermoDB-compatible model source.
 * @param modelName EOS model name. Defaults to `"SRK"`.
 * @param componentKey Component identifier strategy. Defaults to `"Name-State"`.
 * @param kwargs Optional EOS options (`solver_method`, `phase`, `tolerance`, etc.).
 * @returns Single-component gas fugacity result, including phase-keyed output (`results.VAPOR` etc.).
 * @throws {ThermoModelError} If inputs are invalid or EOS calculation fails.
 */
export function calcGasFugacity(
  component: Component,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): ComponentGasFugacityResult {
  return parseGasFugacityCalcResult(calcSingle(component, pressure, temperature, modelSource, modelName, componentKey, { ...kwargs, phase: kwargs.phase ?? "VAPOR" }));
}

/**
 * Calculate liquid-phase fugacity for a single component using an EOS model.
 *
 * This wrapper defaults the requested phase to `"LIQUID"` unless overridden in `kwargs.phase`.
 * The lower EOS layer may use either direct EOS liquid-root selection or the Poynting correction path,
 * depending on `kwargs.liquid_fugacity_mode`.
 *
 * @param component Component (`mozithermodb-settings`) used to resolve thermo properties and EOS equations.
 * @param pressure Operating pressure (`value`, `unit`).
 * @param temperature Operating temperature (`value`, `unit`).
 * @param modelSource MoziThermoDB-compatible model source.
 * @param modelName EOS model name. Defaults to `"SRK"`.
 * @param componentKey Component identifier strategy. Defaults to `"Name-State"`.
 * @param kwargs Optional EOS options (e.g. `liquid_fugacity_mode: "EOS" | "Poynting"`).
 * @returns Single-component liquid fugacity result.
 * @throws {ThermoModelError} If inputs are invalid or EOS calculation fails.
 */
export function calcLiquidFugacity(
  component: Component,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): ComponentLiquidFugacityResult {
  return parseLiquidFugacityCalcResult(calcSingle(component, pressure, temperature, modelSource, modelName, componentKey, { ...kwargs, phase: kwargs.phase ?? "LIQUID" }));
}

/**
 * Calculate fugacity for a multi-component mixture using an EOS model.
 *
 * This wrapper validates the mixture components, builds and normalizes a feed specification from
 * `components[].mole_fraction`, and delegates to `ThermoModelCore.calFugacityMixture(...)`.
 *
 * Notes
 * - The returned object is phase-keyed (for example `results.VAPOR`) and includes:
 *   compressibility factor, fugacity coefficients (`phi_i`), and fugacities (`f_i`).
 * - If `kwargs.phase` is omitted, the lower layer may perform EOS root analysis to infer phase.
 *
 * @param components Mixture components (`mozithermodb-settings` `Component[]`) with `mole_fraction`.
 * @param pressure Mixture pressure (`value`, `unit`).
 * @param temperature Mixture temperature (`value`, `unit`).
 * @param modelSource MoziThermoDB-compatible model source.
 * @param modelName EOS model name. Defaults to `"SRK"`.
 * @param componentKey Component identifier strategy for source lookup. Defaults to `"Name-State"`.
 * @param kwargs Optional EOS options (`solver_method`, `phase`, `k_ij`, etc.).
 * @returns Mixture fugacity result with phase-keyed outputs and per-component fugacity maps.
 * @throws {ThermoModelError} If the component list is empty, inputs are invalid, or calculation fails.
 */
export function calcMixtureFugacity(
  components: Component[],
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): MixtureFugacityResult {
  if (!Array.isArray(components) || !components.length) throw new ThermoModelError("components must be a non-empty array", "INVALID_COMPONENTS");
  components.forEach(validateComponent);
  validatePressure(pressure);
  validateTemperature(temperature);
  const feed = setFeedSpecification(Object.fromEntries(components.map((c) => [set_component_id(c as any, componentKey), Number(c.mole_fraction ?? 0)])));
  const core = new ThermoModelCore();
  const res = core.calFugacityMixture(
    modelName,
    {
      "feed-specification": feed,
      phase: (kwargs.phase as string | undefined)?.toUpperCase() ?? undefined,
      pressure: [pressure.value, pressure.unit],
      temperature: [temperature.value, temperature.unit]
    },
    normalizeModelSource(modelSource),
    (kwargs.solver_method as any) ?? "ls",
    kwargs
  );
  return parseMixtureFugacityCalcResult(res);
}

function calcSingle(
  component: Component,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: EosModelName,
  componentKey: ComponentKey,
  kwargs: Record<string, unknown>
): ComponentGasFugacityResult {
  validateComponent(component);
  validatePressure(pressure);
  validateTemperature(temperature);
  const componentId = set_component_id(component as any, componentKey);
  const core = new ThermoModelCore();
  return core.calFugacity(
    modelName,
    {
      component: componentId,
      phase: (kwargs.phase as string | undefined)?.toUpperCase() ?? undefined,
      pressure: [pressure.value, pressure.unit],
      temperature: [temperature.value, temperature.unit]
    },
    normalizeModelSource(modelSource),
    (kwargs.solver_method as any) ?? "ls",
    (kwargs.liquid_fugacity_mode as any) ?? "EOS",
    kwargs
  );
}

export const check_component_eos_roots = checkComponentEosRoots;
export const check_multi_component_eos_roots = checkMultiComponentEosRoots;
export const calc_gas_fugacity = calcGasFugacity;
export const calc_liquid_fugacity = calcLiquidFugacity;
export const calc_mixture_fugacity = calcMixtureFugacity;
export const calFugacity = calcFugacity;
export const calc_fugacity = calcFugacity;
export const cal_fugacity = calcFugacity;
