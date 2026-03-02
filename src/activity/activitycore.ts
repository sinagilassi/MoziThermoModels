import type { Component, ExcessGibbsResult } from "../types";
import { ThermoModelError } from "../errors";
import { generalExcessMolarGibbsFreeEnergy } from "./_shared";
import { NRTL } from "./nrtl";
import { UNIQUAC } from "./uniquac";
import { UNIFAC } from "./unifac";

/**
 * ActivityCore serves as a centralized class for managing activity models and their shared data sources.
 * It initializes instances of NRTL, UNIQUAC, and UNIFAC models based on provided component lists and data sources.
 * The class also provides utility methods for computing excess Gibbs free energy and selecting specific models.
 */
export class ActivityCore {
  // SECTION: properties
  datasource: Record<string, unknown>;
  equationsource: Record<string, unknown>;
  components: string[];
  private __nrtl: NRTL | null;
  private __uniquac: UNIQUAC | null;
  private __unifac: UNIFAC | null;
  private _mixture_id?: string;

  /**
   * Creates a new activity-model core with shared data/equation sources.
   * @param datasource Parameter source used by activity models.
   * @param equationsource Equation metadata source used by activity models.
   * @param components Ordered list of mixture component identifiers.
   * @param kwargs Optional construction options such as `mixture_id`.
   */
  constructor(
    datasource: Record<string, unknown>,
    equationsource: Record<string, unknown>,
    components: string[],
    kwargs: { mixture_id?: string } = {}
  ) {
    // NOTE: model source
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};

    // NOTE: components and models
    this.components = [...(components ?? [])];

    // NOTE: mixture id is optional, but can be useful for tracking and debugging
    this._mixture_id = kwargs.mixture_id;

    // SECTION: initialize models
    // ! NRTL
    this.__nrtl = new NRTL(this.components, this.datasource, this.equationsource);
    // ! UNIQUAC
    this.__uniquac = new UNIQUAC(this.components, this.datasource, this.equationsource);
    // ! UNIFAC
    this.__unifac = new UNIFAC(this.components, this.datasource, this.equationsource);
  }

  /**
   * Returns the optional mixture identifier used for tracking/debugging.
   * Falls back to `"unknown"` when no identifier is provided.
   */
  get mixture_id(): string {
    return this._mixture_id ?? "unknown";
  }

  /**
   * Gets the initialized NRTL model instance.
   * @throws {ThermoModelError} If the model is not initialized.
   */
  get nrtl(): NRTL {
    if (!this.__nrtl) throw new ThermoModelError("NRTL model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__nrtl;
  }

  /**
   * Gets the initialized UNIQUAC model instance.
   * @throws {ThermoModelError} If the model is not initialized.
   */
  get uniquac(): UNIQUAC {
    if (!this.__uniquac) throw new ThermoModelError("UNIQUAC model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__uniquac;
  }

  /**
   * Gets the initialized UNIFAC model instance.
   * @throws {ThermoModelError} If the model is not initialized.
   */
  get unifac(): UNIFAC {
    if (!this.__unifac) throw new ThermoModelError("UNIFAC model not initialized.", "INVALID_ACTIVITY_INPUT");
    return this.__unifac;
  }

  /**
   * Creates and returns a fresh activity-model instance by name.
   * @param model_name Target model type (`NRTL`, `UNIQUAC`, or `UNIFAC`).
   * @throws {ThermoModelError} If the requested model is not supported.
   */
  select(model_name: "NRTL" | "UNIQUAC" | "UNIFAC") {
    if (model_name === "NRTL") return new NRTL(this.components, this.datasource, this.equationsource);
    if (model_name === "UNIQUAC") return new UNIQUAC(this.components, this.datasource, this.equationsource);
    if (model_name === "UNIFAC") return new UNIFAC(this.components, this.datasource, this.equationsource);
    throw new ThermoModelError(`Model ${String(model_name)} not supported.`, "INVALID_ACTIVITY_MODEL");
  }

  /**
   * Computes the general excess molar Gibbs free energy from mole fractions
   * and activity coefficients.
   * @param mole_fraction Component mole fractions as an object map or ordered array.
   * @param activity_coefficients Activity coefficients as an object map or ordered array.
   * @param message Optional context message to include in the result.
   * @returns Computed excess Gibbs-energy payload.
   */
  general_excess_molar_gibbs_free_energy(
    mole_fraction: Record<string, number> | number[],
    activity_coefficients: Record<string, number> | number[],
    message?: string
  ): ExcessGibbsResult {
    return generalExcessMolarGibbsFreeEnergy(mole_fraction, activity_coefficients, message);
  }
}

// SECTION: Set types
export type ActivityModel = NRTL | UNIQUAC | UNIFAC;
export type ActivityCoreComponent = Component;
