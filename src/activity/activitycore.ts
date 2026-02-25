import type { Component, ExcessGibbsResult } from "../types";
import { ThermoModelError } from "../core";
import { generalExcessMolarGibbsFreeEnergy } from "./_shared";
import { NRTL } from "./nrtl";
import { UNIQUAC } from "./uniquac";
import { UNIFAC } from "./unifac";

export class ActivityCore {
  datasource: Record<string, unknown>;
  equationsource: Record<string, unknown>;
  components: string[];
  private __nrtl: NRTL | null;
  private __uniquac: UNIQUAC | null;
  private __unifac: UNIFAC | null;
  private _mixture_id?: string;

  constructor(
    datasource: Record<string, unknown>,
    equationsource: Record<string, unknown>,
    components: string[],
    kwargs: { mixture_id?: string } = {}
  ) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.components = [...(components ?? [])];
    this._mixture_id = kwargs.mixture_id;
    this.__nrtl = new NRTL(this.components, this.datasource, this.equationsource);
    this.__uniquac = new UNIQUAC(this.components, this.datasource, this.equationsource);
    this.__unifac = new UNIFAC(this.components, this.datasource, this.equationsource);
  }

  get mixture_id(): string {
    return this._mixture_id ?? "unknown";
  }

  get nrtl(): NRTL {
    if (!this.__nrtl) throw new ThermoModelError("NRTL model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__nrtl;
  }

  get uniquac(): UNIQUAC {
    if (!this.__uniquac) throw new ThermoModelError("UNIQUAC model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__uniquac;
  }

  get unifac(): UNIFAC {
    if (!this.__unifac) throw new ThermoModelError("UNIFAC model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__unifac;
  }

  select(model_name: "NRTL" | "UNIQUAC" | "UNIFAC") {
    if (model_name === "NRTL") return new NRTL(this.components, this.datasource, this.equationsource);
    if (model_name === "UNIQUAC") return new UNIQUAC(this.components, this.datasource, this.equationsource);
    if (model_name === "UNIFAC") return new UNIFAC(this.components, this.datasource, this.equationsource);
    throw new ThermoModelError(`Model ${String(model_name)} not supported.`, "INVALID_ACTIVITY_MODEL");
  }

  general_excess_molar_gibbs_free_energy(
    mole_fraction: Record<string, number> | number[],
    activity_coefficients: Record<string, number> | number[],
    message?: string
  ): ExcessGibbsResult {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, message);
  }
}

export type ActivityModel = NRTL | UNIQUAC | UNIFAC;
export type ActivityCoreComponent = Component;

