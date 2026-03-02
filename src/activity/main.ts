import { ThermoModelError } from "@/errors";
import type { Component, ComponentKey, Temperature } from "@/types";
import { NRTL } from "./nrtl";
import { UNIQUAC } from "./uniquac";
import { remapPairDictKeys, toKelvin } from "./_shared";

export type PairOrMatrix = Record<string, number> | number[][];

type PairUpdateOptions = {
  mixture_delimiter?: "|" | "_";
  component_key?: ComponentKey;
  component_delimiter?: string;
};

function componentNames(components: Component[]): string[] {
  return components.map((c) => String(c.name).trim());
}

function updateKeysIfRequested(
  pairDict: Record<string, number>,
  components: Component[],
  opts: PairUpdateOptions
) {
  return remapPairDictKeys(
    pairDict,
    components,
    opts.mixture_delimiter ?? "|",
    opts.component_key ?? "Name",
    opts.component_delimiter ?? "-"
  );
}

export function calcDgIjUsingNrtlModel(
  components: Component[],
  temperature: Temperature,
  tau_ij: PairOrMatrix,
  opts: PairUpdateOptions = {}
) {
  const model = new NRTL(componentNames(components));
  const [dg_ij, dg_ij_comp] = model.cal_dg_ij_M1(toKelvin(temperature), tau_ij, opts.mixture_delimiter ?? "|");
  return { dg_ij, dg_ij_comp, dg_ij_comp_upd: updateKeysIfRequested(dg_ij_comp, components, opts) };
}

export function calcTauIjWithDgIjUsingNrtlModel(
  components: Component[],
  temperature: Temperature,
  dg_ij: PairOrMatrix,
  opts: PairUpdateOptions = {}
) {
  const model = new NRTL(componentNames(components));
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(toKelvin(temperature), dg_ij, opts.mixture_delimiter ?? "|");
  return { tau_ij, tau_ij_comp, tau_ij_comp_upd: updateKeysIfRequested(tau_ij_comp, components, opts) };
}

export function calcDUijUsingUniquacModel(
  components: Component[],
  temperature: Temperature,
  tau_ij: PairOrMatrix,
  opts: PairUpdateOptions = {}
) {
  const model = new UNIQUAC(componentNames(components));
  const [dU_ij, dU_ij_comp] = model.cal_dU_ij_M1(toKelvin(temperature), tau_ij, opts.mixture_delimiter ?? "|");
  return { dU_ij, dU_ij_comp, dU_ij_comp_upd: updateKeysIfRequested(dU_ij_comp, components, opts) };
}

export function calcTauIjWithDUijUsingUniquacModel(
  components: Component[],
  temperature: Temperature,
  dU_ij: PairOrMatrix,
  opts: PairUpdateOptions = {}
) {
  const model = new UNIQUAC(componentNames(components));
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(toKelvin(temperature), dU_ij, opts.mixture_delimiter ?? "|");
  return { tau_ij, tau_ij_comp, tau_ij_comp_upd: updateKeysIfRequested(tau_ij_comp, components, opts) };
}

export function calcTauIjByCoefficients(args: {
  components: Component[];
  temperature: Temperature;
  a_ij: PairOrMatrix;
  b_ij: PairOrMatrix;
  c_ij: PairOrMatrix;
  d_ij: PairOrMatrix;
  model?: "NRTL" | "UNIQUAC";
} & PairUpdateOptions) {
  const names = componentNames(args.components);
  const T = toKelvin(args.temperature);
  const delimiter = args.mixture_delimiter ?? "|";
  if ((args.model ?? "NRTL") === "NRTL") {
    const model = new NRTL(names);
    const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M2(T, args.a_ij, args.b_ij, args.c_ij, args.d_ij, delimiter);
    return { tau_ij, tau_ij_comp, tau_ij_comp_upd: updateKeysIfRequested(tau_ij_comp, args.components, args) };
  }
  const model = new UNIQUAC(names);
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M2(T, args.a_ij, args.b_ij, args.c_ij, args.d_ij, delimiter);
  return { tau_ij, tau_ij_comp, tau_ij_comp_upd: updateKeysIfRequested(tau_ij_comp, args.components, args) };
}

export function calcTauIj(args: {
  modelName: "NRTL" | "UNIQUAC";
  temperature: number;
  dg_ij?: Record<string, number>;
  dU_ij?: Record<string, number>;
  components: string[];
}) {
  if (args.modelName === "NRTL") {
    if (!args.dg_ij) throw new ThermoModelError("dg_ij is required for NRTL", "INVALID_ACTIVITY_INPUT");
    const model = new NRTL(args.components);
    const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(args.temperature, args.dg_ij);
    return { tau_ij, tau_ij_comp };
  }
  if (!args.dU_ij) throw new ThermoModelError("dU_ij is required for UNIQUAC", "INVALID_ACTIVITY_INPUT");
  const model = new UNIQUAC(args.components);
  const [tau_ij, tau_ij_comp] = model.cal_tau_ij_M1(args.temperature, args.dU_ij);
  return { tau_ij, tau_ij_comp };
}

export const calc_dg_ij_using_nrtl_model = calcDgIjUsingNrtlModel;
export const calc_tau_ij_with_dg_ij_using_nrtl_model = calcTauIjWithDgIjUsingNrtlModel;
export const calc_dU_ij_using_uniquac_model = calcDUijUsingUniquacModel;
export const calc_tau_ij_with_dU_ij_using_uniquac_model = calcTauIjWithDUijUsingUniquacModel;
export const calc_tau_ij_by_coefficients = calcTauIjByCoefficients;
