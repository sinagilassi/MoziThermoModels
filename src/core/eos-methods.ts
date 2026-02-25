import type { ModelSource } from "mozithermodb";
import { set_component_id } from "mozithermodb-settings";
import type {
  ComponentKey,
  ComponentEosRootResult,
  ComponentGasFugacityResult,
  ComponentLiquidFugacityResult,
  EosModelName,
  MixtureEosRootResult,
  MixtureFugacityResult,
  Pressure,
  Temperature,
  Component
} from "../types";
import { ThermoModelCore } from "../docs/thermomodelcore";
import {
  parseComponentEosRootResult,
  parseGasFugacityCalcResult,
  parseLiquidFugacityCalcResult,
  parseMixtureEosRootResult,
  parseMixtureFugacityCalcResult,
} from "./index";
import { validateComponent, validatePressure, validateTemperature, normalizeModelSource, setFeedSpecification } from "@/utils";
import { ThermoModelError } from "@/errors";


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
