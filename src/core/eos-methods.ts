import { to } from "mozicuc";
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
  Temperature
} from "../types";
import { ThermoModelCore } from "../docs/thermomodelcore";
import {
  parseComponentEosRootResult,
  parseGasFugacityCalcResult,
  parseLiquidFugacityCalcResult,
  parseMixtureEosRootResult,
  parseMixtureFugacityCalcResult,
  setFeedSpecification,
  ThermoModelError
} from "./index";

type InputComponent = { name: string; formula: string; state: string; mole_fraction?: number; moleFraction?: number; [key: string]: unknown };

export function checkComponentEosRoots(
  component: InputComponent,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
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

export function checkMultiComponentEosRoots(
  components: InputComponent[],
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
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

export function calcGasFugacity(
  component: InputComponent,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): ComponentGasFugacityResult {
  return parseGasFugacityCalcResult(calcSingle(component, pressure, temperature, modelSource, modelName, componentKey, { ...kwargs, phase: kwargs.phase ?? "VAPOR" }));
}

export function calcLiquidFugacity(
  component: InputComponent,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
  modelName: EosModelName = "SRK",
  componentKey: ComponentKey = "Name-State",
  kwargs: Record<string, unknown> = {}
): ComponentLiquidFugacityResult {
  return parseLiquidFugacityCalcResult(calcSingle(component, pressure, temperature, modelSource, modelName, componentKey, { ...kwargs, phase: kwargs.phase ?? "LIQUID" }));
}

export function calcMixtureFugacity(
  components: InputComponent[],
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
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
  component: InputComponent,
  pressure: Pressure,
  temperature: Temperature,
  modelSource: { dataSource?: Record<string, unknown>; equationSource?: Record<string, unknown>; datasource?: Record<string, unknown>; equationsource?: Record<string, unknown> },
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

function normalizeModelSource(modelSource: any) {
  if (!modelSource || typeof modelSource !== "object") throw new ThermoModelError("Invalid model_source input", "INVALID_MODEL_SOURCE");
  return {
    datasource: (modelSource.dataSource ?? modelSource.datasource) as Record<string, unknown>,
    equationsource: (modelSource.equationSource ?? modelSource.equationsource) as Record<string, unknown>
  };
}

function validateComponent(component: InputComponent): void {
  if (!component || typeof component !== "object") throw new ThermoModelError("Invalid component input", "INVALID_COMPONENT");
  if (!component.name || !component.formula || !component.state) throw new ThermoModelError("Component must include name/formula/state", "INVALID_COMPONENT");
  if (!["g", "l", "s", "aq"].includes(component.state)) throw new ThermoModelError("Component state must be one of g|l|s|aq", "INVALID_COMPONENT_STATE");
}

function validatePressure(pressure: Pressure): void {
  if (!pressure || typeof pressure.value !== "number" || !pressure.unit) throw new ThermoModelError("Invalid pressure input", "INVALID_PRESSURE");
  void to(pressure.value, `${pressure.unit} => Pa`);
}

function validateTemperature(temperature: Temperature): void {
  if (!temperature || typeof temperature.value !== "number" || !temperature.unit) throw new ThermoModelError("Invalid temperature input", "INVALID_TEMPERATURE");
  void to(temperature.value, `${temperature.unit} => K`);
}

export const check_component_eos_roots = checkComponentEosRoots;
export const check_multi_component_eos_roots = checkMultiComponentEosRoots;
export const calc_gas_fugacity = calcGasFugacity;
export const calc_liquid_fugacity = calcLiquidFugacity;
export const calc_mixture_fugacity = calcMixtureFugacity;
