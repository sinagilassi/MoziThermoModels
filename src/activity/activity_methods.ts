// import libs
// ! LOCALS
import type {
  ActivityCoefficientResult,
  Component,
  ComponentKey,
  ExcessGibbsResult,
  MixtureKey,
  ModelSource,
  Pressure,
  Temperature
} from "@/types";
import { createMixtureId, setComponentId, ThermoModelError } from "@/core";
import { normalizeModelSource, validateComponent, validatePressure, validateTemperature } from "@/utils";
import { normalizeComponents } from "./_shared";
import { NRTL } from "./nrtl";
import { UNIQUAC } from "./uniquac";
import {
  calcTauIjWithDgIjUsingNrtlModel,
  calcTauIjWithDUijUsingUniquacModel
} from "./main";

/**
 * Attempts to extract activity-model parameter maps for a specific mixture.
 *
 * It looks up `mixtureId` inside the normalized model source data and matches
 * any of the provided `keys` case-insensitively. When a matching object is
 * found, values are coerced to numbers.
 */
function maybeExtractActivityParams(
  modelSource: ModelSource,
  mixtureId: string,
  keys: string[],
  components: Component[],
  componentKey: ComponentKey,
  targetKind: "matrix" | "vector"
): Record<string, number> | undefined {
  const raw = (modelSource as any).dataSource ?? (modelSource as any).datasource;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  // SECTION: find mixture node
  const node = findMixtureNode(raw as Record<string, unknown>, mixtureId);
  if (!node) return undefined;

  for (const target of keys) {
    const value = findParamValue(node, [target]);
    if (targetKind === "vector") {
      const vectorRecord = value == null ? undefined : extractVectorByComponentKey(value, components, componentKey);
      if (vectorRecord) return vectorRecord;
      const componentVectorRecord = extractVectorFromComponentNodes(raw as Record<string, unknown>, components, componentKey, [target]);
      if (componentVectorRecord) return componentVectorRecord;
      continue;
    }

    if (value == null) continue;
    const matrixRecord = extractFromMoziMatrixData(value, target, mixtureId, components, componentKey);
    if (matrixRecord) return matrixRecord;

    const plainRecord = coerceRecordToNumberMap(value);
    if (plainRecord) return plainRecord;
  }

  return undefined;
}

function normalizeMixtureKeyForLookup(key: string): string {
  return String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\|\s*/g, "|");
}

function canonicalizeMixtureKey(key: string): string {
  const normalized = normalizeMixtureKeyForLookup(key);
  const parts = normalized
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return normalized;
  return [...parts].sort().join("|");
}

/**
 * Find the mixture node in the data source that matches the given mixtureId.
 * @param dataSource The data source to search for the mixture node.
 * @param mixtureId The mixture identifier to look for in the data source.
 * @returns The mixture node if found, otherwise undefined.
 */
function findMixtureNode(
  dataSource: Record<string, unknown>,
  mixtureId: string
): Record<string, unknown> | undefined {
  const direct = dataSource[mixtureId];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const target = normalizeMixtureKeyForLookup(mixtureId);

  for (const [key, value] of Object.entries(dataSource)) {
    if (
      normalizeMixtureKeyForLookup(key) === target &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }
  }

  const canonicalTarget = canonicalizeMixtureKey(mixtureId);
  for (const [key, value] of Object.entries(dataSource)) {
    if (
      canonicalizeMixtureKey(key) === canonicalTarget &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }
  }

  return undefined;
}

function findParamValue(node: Record<string, unknown>, keys: string[]): unknown {
  const targetNormSet = new Set<string>();
  const targetCompactSet = new Set<string>();

  for (const key of keys) {
    for (const alias of matrixSymbolCandidates(key)) {
      targetNormSet.add(normalizeMatrixSymbolKey(alias));
      targetCompactSet.add(compactMatrixSymbolKey(alias));
    }
  }

  for (const [key, value] of Object.entries(node)) {
    const normalized = normalizeMatrixSymbolKey(key);
    if (targetNormSet.has(normalized)) return value;
    if (targetCompactSet.has(compactMatrixSymbolKey(key))) return value;
  }
  return undefined;
}

function coerceRecordToNumberMap(obj: unknown): Record<string, number> | undefined {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length) return undefined;

  const out: Record<string, number> = {};
  for (const [key, value] of entries) {
    if (value && typeof value === "object") return undefined;
    const numberValue = Number(value ?? 0);
    if (!Number.isFinite(numberValue)) return undefined;
    out[key] = numberValue;
  }

  return out;
}

function extractFromMoziMatrixData(
  wrapper: unknown,
  targetKey: string,
  mixtureId: string,
  components: Component[],
  componentKey: ComponentKey
): Record<string, number> | undefined {
  const matrixSource = resolveMatrixSource(wrapper);
  if (!matrixSource) return undefined;

  const candidates = matrixSymbolCandidates(targetKey);
  for (const candidate of candidates) {
    try {
      const matrixDict = matrixSource.matDict(candidate, components, componentKey, "|");
      const coerced = coerceRecordToNumberMap(matrixDict);
      if (coerced && Object.keys(coerced).length) return coerced;
    } catch {
      continue;
    }
  }

  void mixtureId;
  return undefined;
}

function normalizeMatrixSymbolKey(key: string): string {
  return String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "_");
}

function compactMatrixSymbolKey(key: string): string {
  const normalized = normalizeMatrixSymbolKey(key);
  return normalized.replace(/_i_j$/i, "").replace(/_ij$/i, "");
}

function matrixSymbolCandidates(targetKey: string): string[] {
  const normalized = normalizeMatrixSymbolKey(targetKey);
  const compact = normalized.replace(/_i_j$/i, "").replace(/_ij$/i, "");
  const out = new Set<string>();

  const add = (value: string) => {
    const next = String(value ?? "").trim();
    if (!next) return;
    out.add(next);
  };

  add(targetKey);
  add(normalized);
  add(normalized.replace(/_i_j$/i, "_ij"));
  add(normalized.replace(/_ij$/i, "_i_j"));
  add(compact);
  add(`${compact}_i_j`);
  add(`${compact}_ij`);

  return [...out];
}

function resolveMatrixSource(wrapper: unknown): { matDict: (propertySymbol: string, components: Component[], componentKey?: ComponentKey, keyDelimiter?: string) => Record<string, number> } | undefined {
  if (!wrapper || typeof wrapper !== "object") return undefined;

  const direct = wrapper as Record<string, unknown>;
  if (typeof (direct as any).matDict === "function") return direct as any;

  const nested = findNestedMoziMatrixData(wrapper);
  if (!nested || typeof nested !== "object") return undefined;
  if (typeof (nested as any).matDict === "function") return nested as any;
  return undefined;
}

function findNestedMoziMatrixData(wrapper: unknown): unknown {
  if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)) return undefined;
  for (const [key, value] of Object.entries(wrapper as Record<string, unknown>)) {
    const normalized = String(key ?? "")
      .toLowerCase()
      .replace(/[_\s-]+/g, "");
    if (normalized === "mozimatrixdata") return value;
  }
  return undefined;
}

function extractVectorByComponentKey(
  value: unknown,
  components: Component[],
  componentKey: ComponentKey
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const out: Record<string, number> = {};

  for (const component of components) {
    const key = setComponentId(component, componentKey);
    const parsed = Number(source[key]);
    if (!Number.isFinite(parsed)) return undefined;
    out[key] = parsed;
  }

  return out;
}

function extractVectorFromComponentNodes(
  dataSource: Record<string, unknown>,
  components: Component[],
  componentKey: ComponentKey,
  propKeys: string[]
): Record<string, number> | undefined {
  const out: Record<string, number> = {};

  for (const component of components) {
    const componentId = setComponentId(component, componentKey);
    const node = dataSource[componentId];
    if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;

    const value = findParamValue(node as Record<string, unknown>, propKeys);
    const scalar = coerceScalarValue(value);
    if (!Number.isFinite(scalar)) return undefined;
    out[componentId] = scalar;
  }

  return out;
}

function coerceScalarValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return Number.NaN;

  const rec = value as Record<string, unknown>;
  if ("value" in rec) {
    const parsed = Number(rec.value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

/**
 * Calculates activity coefficients and excess Gibbs free energy using NRTL.
 *
 * @param components Mixture components with mole-fraction information.
 * @param pressure System pressure (validated upstream; unused in this helper).
 * @param temperature System temperature (validated upstream; unused in this helper).
 * @param tau_ij Binary NRTL interaction parameter map.
 * @param alpha_ij Binary NRTL non-randomness parameter map.
 * @param componentKey Component identity format used across model tooling.
 * @param mixtureKey Mixture identity strategy used across model tooling.
 * @param separatorSymbol Component name/state separator.
 * @param delimiter Pair key delimiter for binary parameters.
 * @param message Optional message propagated to model output.
 * @param verbose Enables verbose behavior in higher-level flows.
 * @returns Tuple of activity coefficients, raw details, and excess Gibbs result.
 */
export function calcActivityCoefficientUsingNrtlModel(
  components: Component[],
  pressure: Pressure,
  temperature: Temperature,
  tau_ij: Record<string, number>,
  alpha_ij: Record<string, number>,
  componentKey: ComponentKey = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  void pressure;
  void temperature;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components, componentKey);
  const model = new NRTL(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, alpha_ij }, message);
}

/**
 * Calculates activity coefficients and excess Gibbs free energy using UNIQUAC.
 *
 * @param components Mixture components with mole-fraction information.
 * @param pressure System pressure (validated upstream; unused in this helper).
 * @param temperature System temperature (validated upstream; unused in this helper).
 * @param tau_ij Binary UNIQUAC interaction parameter map.
 * @param r_i UNIQUAC component volume parameters.
 * @param q_i UNIQUAC component surface-area parameters.
 * @param componentKey Component identity format used across model tooling.
 * @param mixtureKey Mixture identity strategy used across model tooling.
 * @param separatorSymbol Component name/state separator.
 * @param delimiter Pair key delimiter for binary parameters.
 * @param message Optional message propagated to model output.
 * @param verbose Enables verbose behavior in higher-level flows.
 * @returns Tuple of activity coefficients, raw details, and excess Gibbs result.
 */
export function calcActivityCoefficientUsingUniquacModel(
  components: Component[],
  pressure: Pressure,
  temperature: Temperature,
  tau_ij: Record<string, number>,
  r_i: Record<string, number>,
  q_i: Record<string, number>,
  componentKey: ComponentKey = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  void pressure;
  void temperature;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components, componentKey);
  const model = new UNIQUAC(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, r_i, q_i }, message);
}

/**
 * Unified activity-coefficient entry point for NRTL and UNIQUAC models.
 *
 * The function validates inputs, resolves/normalizes model parameters from
 * `kwargs` and/or `modelSource`, performs optional parameter conversions
 * (`dg_ij -> tau_ij` for NRTL, `dU_ij -> tau_ij` for UNIQUAC), and delegates
 * to the corresponding model-specific calculator.
 *
 * @throws {ThermoModelError} When components are invalid or required
 * parameters for the selected model are missing.
 */
export function calcActivityCoefficient(
  components: Component[],
  pressure: Pressure,
  temperature: Temperature,
  modelSource: ModelSource,
  modelName: "NRTL" | "UNIQUAC",
  componentKey: ComponentKey = "Name-State",
  mixtureKey: MixtureKey = "Name",
  separatorSymbol = "-",
  delimiter = "|",
  message?: string,
  verbose = false,
  kwargs: Record<string, unknown> = {}
): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
  if (!Array.isArray(components) || !components.length) throw new ThermoModelError("components must be a non-empty array", "INVALID_COMPONENTS");
  components.forEach(validateComponent);
  validatePressure(pressure);
  validateTemperature(temperature);
  const normalizedModelSource = normalizeModelSource(modelSource);
  const mixtureId = createMixtureId(components, mixtureKey, delimiter);

  if (modelName === "NRTL") {
    let tau_ij = kwargs.tau_ij as Record<string, number> | undefined;
    const dg_ij = kwargs.dg_ij as Record<string, number> | undefined;
    const alpha_ij =
      (kwargs.alpha_ij as Record<string, number> | undefined) ??
      maybeExtractActivityParams(normalizedModelSource, mixtureId, ["alpha_ij", "alpha"], components, componentKey, "matrix");
    if (!tau_ij && dg_ij) {
      const converted = calcTauIjWithDgIjUsingNrtlModel(components, temperature, dg_ij, { mixture_delimiter: "|" });
      tau_ij = converted.tau_ij_comp;
    }
    if (!tau_ij) tau_ij = maybeExtractActivityParams(normalizedModelSource, mixtureId, ["tau_ij", "tau"], components, componentKey, "matrix");
    if (!tau_ij || !alpha_ij) {
      throw new ThermoModelError("NRTL requires tau_ij+alpha_ij (or dg_ij+alpha_ij)", "INVALID_ACTIVITY_INPUT");
    }
    return calcActivityCoefficientUsingNrtlModel(
      components,
      pressure,
      temperature,
      tau_ij,
      alpha_ij,
      componentKey,
      mixtureKey,
      separatorSymbol,
      delimiter,
      message,
      verbose
    );
  }

  let tau_ij = kwargs.tau_ij as Record<string, number> | undefined;
  const dU_ij = kwargs.dU_ij as Record<string, number> | undefined;
  if (!tau_ij && dU_ij) {
    const converted = calcTauIjWithDUijUsingUniquacModel(components, temperature, dU_ij, { mixture_delimiter: "|" });
    tau_ij = converted.tau_ij_comp;
  }
  if (!tau_ij) tau_ij = maybeExtractActivityParams(normalizedModelSource, mixtureId, ["tau_ij", "tau"], components, componentKey, "matrix");
  const r_i =
    (kwargs.r_i as Record<string, number> | undefined) ??
    maybeExtractActivityParams(normalizedModelSource, mixtureId, ["r_i", "r"], components, componentKey, "vector");
  const q_i =
    (kwargs.q_i as Record<string, number> | undefined) ??
    maybeExtractActivityParams(normalizedModelSource, mixtureId, ["q_i", "q"], components, componentKey, "vector");
  if (!tau_ij || !r_i || !q_i) {
    throw new ThermoModelError("UNIQUAC requires tau_ij+r_i+q_i (or dU_ij+r_i+q_i)", "INVALID_ACTIVITY_INPUT");
  }
  return calcActivityCoefficientUsingUniquacModel(
    components,
    pressure,
    temperature,
    tau_ij,
    r_i,
    q_i,
    componentKey,
    mixtureKey,
    separatorSymbol,
    delimiter,
    message,
    verbose
  );
}

export const calc_activity_coefficient = calcActivityCoefficient;
export const calc_activity_coefficient_using_nrtl_model = calcActivityCoefficientUsingNrtlModel;
export const calc_activity_coefficient_using_uniquac_model = calcActivityCoefficientUsingUniquacModel;

