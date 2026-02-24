import type { ComponentKey, ComponentLike, ModelSourceLike, PropertyValue } from "../types";
import { normalizeModelSource, setComponentId } from "../core";
export * from "./equation";
export * from "./data";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function resolveComponentIds(component: string | ComponentLike, componentKey: ComponentKey = "Name-State"): string[] {
  if (typeof component === "string") return [component];
  const ids = new Set<string>();
  for (const k of [componentKey, "Name-State", "Formula-State", "Name", "Formula"] as const) {
    try { ids.add(setComponentId(component, k as any)); } catch {}
  }
  return [...ids];
}

export function findComponentNode<T = unknown>(
  source: Record<string, unknown>,
  component: string | ComponentLike,
  componentKey: ComponentKey = "Name-State"
): T | undefined {
  const ids = resolveComponentIds(component, componentKey);
  for (const id of ids) {
    if (id in source) return source[id] as T;
    const ci = Object.keys(source).find((k) => k.toLowerCase() === id.toLowerCase());
    if (ci) return source[ci] as T;
  }
  return undefined;
}

export function extractScalarRecord(
  dataSource: Record<string, unknown>,
  component: string | ComponentLike,
  symbol: string,
  componentKey: ComponentKey = "Name-State"
): PropertyValue<number> | undefined {
  const node = findComponentNode(dataSource, component, componentKey);
  if (!node) return undefined;
  const target = symbol.toLowerCase();
  if (Array.isArray(node)) {
    for (const rec of node) {
      if (!isRecord(rec)) continue;
      if (String(rec.symbol ?? "").toLowerCase() === target) {
        const value = Number(rec.value);
        if (Number.isFinite(value)) return { value, unit: String(rec.unit ?? "-"), symbol: String(rec.symbol ?? symbol) };
      }
    }
  }
  if (isRecord(node)) {
    const key = Object.keys(node).find((k) => k.toLowerCase() === target);
    if (key) {
      const v = node[key];
      if (isRecord(v) && Number.isFinite(Number(v.value))) {
        return { value: Number(v.value), unit: String(v.unit ?? "-"), symbol: String(v.symbol ?? key) };
      }
      if (Number.isFinite(Number(v))) return { value: Number(v), unit: "-", symbol };
    }
  }
  return undefined;
}

type EqNode = { calc?: (args: Record<string, { value: number; symbol?: string; unit?: string }>) => unknown; cal?: (...args: any[]) => unknown };

export function extractEquation(
  equationSource: Record<string, unknown>,
  component: string | ComponentLike,
  symbol: string,
  componentKey: ComponentKey = "Name-State"
): EqNode | undefined {
  const node = findComponentNode<Record<string, unknown>>(equationSource, component, componentKey);
  if (!node) return undefined;
  const key = Object.keys(node).find((k) => k.toLowerCase() === symbol.toLowerCase());
  return key ? (node[key] as EqNode) : undefined;
}

export function evaluateEquation(
  equationSource: Record<string, unknown>,
  component: string | ComponentLike,
  symbol: string,
  args: Record<string, number>,
  componentKey: ComponentKey = "Name-State"
): PropertyValue<number> | undefined {
  const eq = extractEquation(equationSource, component, symbol, componentKey);
  if (!eq) return undefined;
  if (typeof eq.calc === "function") {
    const payload = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, { value: v, symbol: k }]));
    const out = eq.calc(payload) as any;
    if (out && Number.isFinite(Number(out.value))) return { value: Number(out.value), unit: String(out.unit ?? "-"), symbol: String(out.symbol ?? symbol) };
  }
  if (typeof eq.cal === "function") {
    try {
      const out = eq.cal(args) as any;
      if (typeof out === "number") return { value: out, unit: "-", symbol };
      if (out && Number.isFinite(Number(out.value))) return { value: Number(out.value), unit: String(out.unit ?? "-"), symbol: String(out.symbol ?? symbol) };
    } catch {}
  }
  return undefined;
}

export function modelSourceAccess(modelSource: ModelSourceLike) {
  return normalizeModelSource(modelSource);
}
