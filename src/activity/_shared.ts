import { convertFromTo } from "mozicuc";
// ! LOCALS
import type {
  ActivityCoefficientResult,
  Component,
  ComponentKey,
  ComponentLike,
  ExcessGibbsResult,
  MixtureKey,
  Pressure,
  Temperature
} from "@/types";
import { create_mixture_id, set_component_id } from "mozithermodb-settings";
import { ThermoModelError } from "@/errors";

const setComponentId = (component: ComponentLike, componentKey: ComponentKey = "Name-State") =>
  set_component_id(component as any, componentKey as any);

const createMixtureId = (components: Component[], mixtureKey: MixtureKey = "Name", delimiter = "|") =>
  create_mixture_id(components as any, mixtureKey as any, delimiter);

export const R_ACTIVITY = 8.314462618;

export type PairDict = Record<string, number>;
export type MatrixLike = number[][] | PairDict;
export type VectorLike = number[] | Record<string, number>;

export function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ThermoModelError(message, "INVALID_ACTIVITY_INPUT");
  }
}

export function toKelvin(temperature: Temperature | number): number {
  if (typeof temperature === "number") return Number(temperature);
  return convertFromTo(Number(temperature.value), String(temperature.unit), "K");
}

export function toPascal(pressure: Pressure | number): number {
  if (typeof pressure === "number") return Number(pressure);
  return convertFromTo(Number(pressure.value), String(pressure.unit), "Pa");
}

export function normalizeComponents(components: ComponentLike[], componentNameKey: ComponentKey = "Name") {
  const names = components.map((c) => setComponentId(c, componentNameKey));
  const xPairs = components.map((c, i) => [names[i], Number((c as any).mole_fraction ?? (c as any).moleFraction ?? 0)] as const);
  let sum = xPairs.reduce((s, [, x]) => s + x, 0);
  if (!(sum > 0)) sum = 1;
  const moleFraction = Object.fromEntries(xPairs.map(([k, x]) => [k, x / sum]));
  return { names, moleFraction };
}

export function normalizeFractionMap(data: Record<string, number>) {
  const entries = Object.entries(data).map(([k, v]) => [k, Number(v ?? 0)] as const);
  let sum = entries.reduce((s, [, v]) => s + v, 0);
  if (!(sum > 0)) sum = 1;
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

export function toMatrixFromPairDict(components: string[], data: PairDict, delimiter = "|"): number[][] {
  const idx = new Map(components.map((c, i) => [String(c).trim(), i] as const));
  const out = Array.from({ length: components.length }, () => Array.from({ length: components.length }, () => 0));
  for (const [k, v] of Object.entries(data ?? {})) {
    const parts = String(k)
      .split(delimiter)
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length !== 2) continue;
    const i = idx.get(parts[0]);
    const j = idx.get(parts[1]);
    if (i == null || j == null) continue;
    out[i][j] = Number(v);
  }
  return out;
}

export function toPairDict(components: string[], matrix: number[][], delimiter = "|"): PairDict {
  const out: PairDict = {};
  for (let i = 0; i < components.length; i++) {
    for (let j = 0; j < components.length; j++) {
      out[`${components[i]} ${delimiter} ${components[j]}`] = Number(matrix[i]?.[j] ?? 0);
    }
  }
  return out;
}

export function toVectorFromDict(components: string[], data: Record<string, number>): number[] {
  return components.map((c) => Number(data?.[c] ?? 0));
}

export function toVectorDict(components: string[], values: number[]): Record<string, number> {
  return Object.fromEntries(components.map((c, i) => [c, Number(values[i] ?? 0)]));
}

export function ensureMatrix(value: MatrixLike, components: string[], delimiter = "|"): number[][] {
  return Array.isArray(value) ? value.map((row) => row.map(Number)) : toMatrixFromPairDict(components, value, delimiter);
}

export function ensureVector(value: VectorLike, components: string[]): number[] {
  return Array.isArray(value) ? value.map(Number) : toVectorFromDict(components, value);
}

export function parseModelInputObject(modelInputs: unknown): Record<string, unknown> {
  if (typeof modelInputs === "string") {
    const raw = modelInputs.trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ThermoModelError("Failed to parse model inputs as JSON", "INVALID_ACTIVITY_INPUT");
    }
  }
  if (modelInputs && typeof modelInputs === "object" && !Array.isArray(modelInputs)) return modelInputs as Record<string, unknown>;
  throw new ThermoModelError("Model inputs must be a JSON string or object", "INVALID_ACTIVITY_INPUT");
}

export function generalExcessMolarGibbsFreeEnergy(
  mole_fraction: Record<string, number> | number[],
  activity_coefficients: Record<string, number> | number[],
  message?: string
): ExcessGibbsResult {
  let names: string[];
  let x: number[];
  let gamma: number[];

  if (Array.isArray(mole_fraction) && Array.isArray(activity_coefficients)) {
    // TODO: mole fraction key is based on "componentKey"
    names = mole_fraction.map((_, i) => `component_${i + 1}`);
    x = mole_fraction.map(Number);
    gamma = activity_coefficients.map(Number);
  } else if (!Array.isArray(mole_fraction) && !Array.isArray(activity_coefficients)) {
    names = Object.keys(mole_fraction);
    x = names.map((k) => Number(mole_fraction[k] ?? 0));
    gamma = names.map((k) => Number((activity_coefficients as Record<string, number>)[k] ?? 0));
  } else if (!Array.isArray(mole_fraction) && Array.isArray(activity_coefficients)) {
    names = Object.keys(mole_fraction);
    x = names.map((k) => Number(mole_fraction[k] ?? 0));
    gamma = activity_coefficients.map(Number);
  } else {
    const ac = activity_coefficients as Record<string, number>;
    names = Object.keys(ac);
    x = (mole_fraction as number[]).map(Number);
    gamma = names.map((k) => Number(ac[k] ?? 0));
  }
  const value = x.reduce((s, xi, i) => s + xi * Math.log(Math.max(Number(gamma[i] ?? 0), 1e-15)), 0);
  return {
    property_name: "Excess Molar Gibbs Free Energy (G^E/RT)",
    components: names,
    mole_fraction,
    value,
    unit: "dimensionless",
    symbol: "ExMoGiFrEn",
    message: message ?? "General excess Gibbs free energy",
    activity_coefficients
  };
}

export function buildActivityCoefficientResult(
  components: string[],
  moleFraction: Record<string, number>,
  values: number[],
  message: string
): ActivityCoefficientResult {
  return {
    property_name: "Activity Coefficient",
    components: [...components],
    mole_fraction: moleFraction,
    value: toVectorDict(components, values),
    unit: "dimensionless",
    symbol: "AcCo_i",
    message
  };
}

export function remapPairDictKeys(
  pairDict: PairDict,
  components: Component[],
  mixtureDelimiter: "|" | "_" = "|",
  componentKey: ComponentKey = "Name",
  componentDelimiter = "-"
): PairDict {
  const byName = new Map(components.map((c) => [String(c.name).trim().toLowerCase(), c] as const));
  const out: PairDict = {};
  for (const [key, value] of Object.entries(pairDict)) {
    const [ciRaw, cjRaw] = String(key).split(mixtureDelimiter).map((x) => x.trim());
    const ci = byName.get(ciRaw?.toLowerCase?.() ?? "");
    const cj = byName.get(cjRaw?.toLowerCase?.() ?? "");
    const left = ci ? setComponentId(ci, componentKey as ComponentKey).replace(/-/g, componentDelimiter) : ciRaw;
    const right = cj ? setComponentId(cj, componentKey as ComponentKey).replace(/-/g, componentDelimiter) : cjRaw;
    out[`${left}${mixtureDelimiter}${right}`] = Number(value);
  }
  return out;
}

export function modelSourceMixtureId(
  components: Component[],
  mixtureKey: MixtureKey = "Name",
  delimiter = "|"
): string {
  return createMixtureId(components, mixtureKey, delimiter);
}
