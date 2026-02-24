import type { ComponentKey, ComponentLike, MixtureKey, ModelSourceLike } from "../types";

export class ThermoModelError extends Error {
  constructor(message: string, public code = "THERMO_MODEL_ERROR") {
    super(message);
    this.name = "ThermoModelError";
  }
}

export function invariant(condition: unknown, message: string, code?: string): asserts condition {
  if (!condition) throw new ThermoModelError(message, code);
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

export function setComponentId(component: ComponentLike, key: ComponentKey | "Name" | "Formula" = "Name-State", separator = "-"): string {
  const name = clean(component.name);
  const formula = clean(component.formula);
  const state = clean(component.state);
  if (key === "Name") return name;
  if (key === "Formula") return formula;
  if (key === "Formula-State") return `${formula}${separator}${state}`;
  return `${name}${separator}${state}`;
}

export function setFeedSpecification(components: ComponentLike[], key: ComponentKey | "Name" | "Formula" = "Name"): Record<string, number> {
  invariant(Array.isArray(components) && components.length > 0, "Components list is empty", "EMPTY_COMPONENTS");
  const out: Record<string, number> = {};
  let sum = 0;
  for (const c of components) {
    const id = setComponentId(c, key as any);
    const x = Number(c.mole_fraction ?? c.moleFraction ?? 0);
    invariant(Number.isFinite(x), `Invalid mole fraction for ${id}`, "INVALID_MOLE_FRACTION");
    out[id] = x;
    sum += x;
  }
  invariant(sum > 0, "Sum of mole fractions must be > 0", "INVALID_MOLE_FRACTIONS");
  if (Math.abs(sum - 1) > 1e-10) {
    for (const k of Object.keys(out)) out[k] /= sum;
  }
  return out;
}

export function createMixtureId(components: ComponentLike[], key: MixtureKey = "Name", delimiter = "|"): string {
  return components.map((c) => setComponentId(c, key as any)).join(` ${delimiter} `);
}

type MozicucLike = { to?: (value: number, expr: string) => number };
let mozicucRef: MozicucLike | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mozicucRef = require("mozicuc");
} catch {
  mozicucRef = undefined;
}

function nu(u: string): string {
  return u.replace(/\s+/g, "").toLowerCase();
}

function fallbackConvert(value: number, fromUnit: string, toUnit: string): number {
  const from = nu(fromUnit);
  const to = nu(toUnit);
  if (from === to) return value;
  const p: Record<string, number> = { pa: 1, kpa: 1e3, mpa: 1e6, bar: 1e5, atm: 101325 };
  if (from in p && to in p) return (value * p[from]) / p[to];
  if (to === "k") {
    if (from === "c" || from === "degc" || from === "°c") return value + 273.15;
    if (from === "f" || from === "degf" || from === "°f") return (value - 32) * 5 / 9 + 273.15;
  }
  if (from === "k") {
    if (to === "c" || to === "degc" || to === "°c") return value - 273.15;
    if (to === "f" || to === "degf" || to === "°f") return (value - 273.15) * 9 / 5 + 32;
  }
  throw new ThermoModelError(`Unsupported unit conversion: ${fromUnit} => ${toUnit}`, "UNSUPPORTED_UNIT");
}

export function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  if (nu(fromUnit) === nu(toUnit)) return value;
  if (mozicucRef?.to) {
    try {
      return Number(mozicucRef.to(value, `${fromUnit} => ${toUnit}`));
    } catch {}
  }
  return fallbackConvert(value, fromUnit, toUnit);
}

export const toPa = (value: number, unit: string) => convertUnit(value, unit, "Pa");
export const toK = (value: number, unit: string) => convertUnit(value, unit, "K");

export function normalizeModelSource(modelSource: ModelSourceLike): { dataSource: Record<string, unknown>; equationSource: Record<string, unknown> } {
  const dataSource = (modelSource.dataSource ?? modelSource.datasource) as Record<string, unknown> | undefined;
  const equationSource = (modelSource.equationSource ?? modelSource.equationsource) as Record<string, unknown> | undefined;
  invariant(dataSource && equationSource, "modelSource must include dataSource/equationSource", "INVALID_MODEL_SOURCE");
  return { dataSource, equationSource };
}
