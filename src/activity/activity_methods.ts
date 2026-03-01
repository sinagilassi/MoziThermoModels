import type {
  ActivityCoefficientResult,
  Component,
  ComponentKey,
  ExcessGibbsResult,
  MixtureKey,
  ModelSource,
  Pressure,
  Temperature
} from "../types";
import { createMixtureId, ThermoModelError } from "../core";
import { normalizeModelSource, validateComponent, validatePressure, validateTemperature } from "@/utils";
import { normalizeComponents } from "./_shared";
import { NRTL } from "./nrtl";
import { UNIQUAC } from "./uniquac";
import {
  calcTauIjWithDgIjUsingNrtlModel,
  calcTauIjWithDUijUsingUniquacModel
} from "./main";

function maybeExtractActivityParams(
  modelSource: ModelSource,
  mixtureId: string,
  keys: string[]
): Record<string, number> | undefined {
  const raw = (modelSource as any).dataSource ?? (modelSource as any).datasource;
  if (!raw || typeof raw !== "object") return undefined;
  const node = (raw as Record<string, unknown>)[mixtureId] as Record<string, unknown> | undefined;
  if (!node || typeof node !== "object") return undefined;

  // TODO: consider mixture model source, there are different scenarios:
  // 1. object with keys like "tau_ij", "alpha_ij", they contain arrays or objects with component-wise values
  // 2. object with keys like ""tau_ij", "alpha_ij", they contain "mozimatrixdata""

  // NOTE: extract data
  for (const target of keys) {
    const matched = Object.keys(node).find((k) => k.toLowerCase() === target.toLowerCase());
    const value = matched ? node[matched] : undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, Number(v ?? 0)]));
    }
  }
  return undefined;
}

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
  void componentKey;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components);
  const model = new NRTL(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, alpha_ij }, message);
}

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
  void componentKey;
  void mixtureKey;
  void separatorSymbol;
  void delimiter;
  void verbose;
  const { names, moleFraction } = normalizeComponents(components);
  const model = new UNIQUAC(names);
  return model.cal({ mole_fraction: moleFraction, tau_ij, r_i, q_i }, message);
}

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
      maybeExtractActivityParams(normalizedModelSource, mixtureId, ["alpha_ij", "alpha"]);
    if (!tau_ij && dg_ij) {
      const converted = calcTauIjWithDgIjUsingNrtlModel(components, temperature, dg_ij, { mixture_delimiter: "|" });
      tau_ij = converted.tau_ij_comp;
    }
    if (!tau_ij) tau_ij = maybeExtractActivityParams(normalizedModelSource, mixtureId, ["tau_ij", "tau"]);
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
  if (!tau_ij) tau_ij = maybeExtractActivityParams(normalizedModelSource, mixtureId, ["tau_ij", "tau"]);
  const r_i = (kwargs.r_i as Record<string, number> | undefined) ?? maybeExtractActivityParams(normalizedModelSource, mixtureId, ["r_i", "r"]);
  const q_i = (kwargs.q_i as Record<string, number> | undefined) ?? maybeExtractActivityParams(normalizedModelSource, mixtureId, ["q_i", "q"]);
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

