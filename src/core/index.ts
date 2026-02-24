import { create_mixture_id, set_component_id } from "mozithermodb-settings";
import type { ComponentInput, ComponentKey, MixtureKey, EosModelName, NumericProperty, ComponentEosRootResult, MixtureEosRootResult, ComponentGasFugacityResult, MixtureFugacityResult } from "../types";
import { PENG_ROBINSON, REDLICH_KWONG, SOAVE_REDLICH_KWONG, VAN_DER_WAALS } from "../configs/constants";

export class ThermoModelError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code = "THERMO_MODEL_ERROR", cause?: unknown) {
    super(message);
    this.name = "ThermoModelError";
    this.code = code;
    this.cause = cause;
  }
}

export function setComponentId(component: ComponentInput, componentKey: ComponentKey = "Name-State"): string {
  return set_component_id(component, componentKey);
}

export function createMixtureId(components: ComponentInput[], mixtureKey: MixtureKey = "Name", delimiter = "|"): string {
  return create_mixture_id(components, mixtureKey, delimiter);
}

export function normalizeEosModelName(modelName: string): EosModelName {
  const raw = String(modelName ?? "").trim();
  const upper = raw.toUpperCase();
  if (upper === "PR" || raw === PENG_ROBINSON) return "PR";
  if (upper === "SRK" || raw === SOAVE_REDLICH_KWONG) return "SRK";
  if (upper === "RK" || raw === REDLICH_KWONG) return "RK";
  if (upper === "VDW" || raw === VAN_DER_WAALS) return "vdW";
  throw new ThermoModelError(`Invalid EOS model name: ${modelName}`, "INVALID_EOS_MODEL");
}

export function setFeedSpecification(input: any): Record<string, number> {
  if (typeof input === "object" && input && !Array.isArray(input) && "components" in input && "mole_fraction" in input) {
    const components = Array.isArray(input.components) ? input.components as string[] : [];
    const moleFraction = Array.isArray(input.mole_fraction) ? input.mole_fraction as number[] : [];
    const map = Object.fromEntries(components.map((c, i) => [c, Number(moleFraction[i] ?? 0)]));
    return normalizeFractions(map);
  }
  if (typeof input === "object" && input && !Array.isArray(input) && "feedSpecification" in input && input.feedSpecification) {
    return normalizeFractions(input.feedSpecification as Record<string, number>);
  }
  return normalizeFractions((input ?? {}) as Record<string, number>);
}

function normalizeFractions(feed: Record<string, number>): Record<string, number> {
  const entries = Object.entries(feed).map(([k, v]) => [k, Number(v ?? 0)] as const);
  let sum = entries.reduce((s, [, v]) => s + v, 0);
  if (!(sum > 0)) sum = 1;
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

export function toNumericProperty(value: number, unit: string, symbol?: string): NumericProperty {
  return { value: Number(value), unit, ...(symbol ? { symbol } : {}) };
}

export function parseComponentEosRootResult(res: ComponentEosRootResult): ComponentEosRootResult {
  return res;
}

export function parseMixtureEosRootResult(res: MixtureEosRootResult): MixtureEosRootResult {
  return res;
}

export function parseGasFugacityCalcResult(res: ComponentGasFugacityResult): ComponentGasFugacityResult {
  return res;
}

export function parseLiquidFugacityCalcResult(res: ComponentGasFugacityResult): ComponentGasFugacityResult {
  return res;
}

export function parseMixtureFugacityCalcResult(res: MixtureFugacityResult): MixtureFugacityResult {
  return res;
}

export * from "./eos-methods";
