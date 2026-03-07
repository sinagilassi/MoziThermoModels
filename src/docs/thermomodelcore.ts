import type { ModelSource } from "mozithermodb";
// ! LOCALS
import type { Component, EosModelName, LiquidFugacityMode, SolverMethod } from "@/types";
import { EosCore } from "@/eos/eoscore";
import { ActivityCore } from "@/activity/activitycore";
import { calcActivityCoefficient as calcActivityCoefficientActivity } from "@/activity/activity_methods";
import { normalizeModelSource } from "@/utils";

/**
 * EOS-focused thermodynamic facade for fugacity and root-solving workflows.
 *
 * `ThermoModelCore` provides a stable orchestration layer around `EosCore` so callers can execute
 * single-component and mixture EOS operations through a consistent high-level API. The class is part
 * of the TypeScript EOS port and intentionally limits scope to EOS paths.
 *
 * Key characteristics:
 * - Delegates all EOS numerics to freshly initialized `EosCore` instances.
 * - Supports camelCase primary methods and snake_case aliases for compatibility.
 * - Preserves extensibility via `kwargs` pass-through options on EOS-facing operations.
 * - Explicitly rejects activity-model initialization/selection in this port via `NOT_IMPLEMENTED` errors.
 */
export class ThermoModelCore {
  private _input: Record<string, unknown> = {};
  private _results: Record<string, unknown> = {};
  get input() { return this._input; }
  get results() { return this._results; }
  /**
   * Calculates fugacity for a single-component system using the selected equation of state (EOS).
   *
   * This method delegates to an internally initialized `EosCore` instance and forwards all inputs,
   * including optional solver and liquid-phase fugacity handling controls.
   *
   * @param modelName - EOS model identifier (for example: PR, SRK) used by the core calculator.
   * @param modelInput - Thermodynamic input payload consumed by the selected EOS implementation.
   * @param modelSource - Data source/provider that resolves model constants and fluid metadata.
   * @param solverMethod - Numerical solver strategy for EOS root solving. Defaults to `"ls"`.
   * @param liquidFugacityMode - Liquid fugacity handling mode. Defaults to `"EOS"`.
   * @param kwargs - Optional extensible options forwarded unchanged to EOS initialization and execution.
   * @returns The fugacity calculation result as produced by `EosCore.calFugacity`.
   */
  calFugacity(
    modelName: EosModelName,
    modelInput: Record<string, any>,
    modelSource: ModelSource,
    solverMethod: SolverMethod = "ls",
    liquidFugacityMode: LiquidFugacityMode = "EOS",
    kwargs: Record<string, unknown> = {}
  ) {
    return this.initEos(kwargs).calFugacity(modelName, modelInput, modelSource, solverMethod, liquidFugacityMode, kwargs);
  }

  /**
   * Computes the real EOS roots for a single-component system.
   *
   * Use this for diagnostics/phase analysis when root multiplicity is important (e.g., vapor/liquid root checks).
   *
   * @param modelName - EOS model identifier used for root solving.
   * @param modelInput - Input state and composition payload required by the EOS routine.
   * @param modelSource - Data source/provider for model parameters.
   * @param kwargs - Optional extensible options forwarded to EOS initialization and root computation.
   * @returns Root-solving result from `EosCore.checkEosRootsSingleComponent`.
   */
  checkEosRootsSingleComponent(modelName: EosModelName, modelInput: Record<string, any>, modelSource: ModelSource, kwargs: Record<string, unknown> = {}) {
    return this.initEos(kwargs).checkEosRootsSingleComponent(modelName, modelInput, modelSource, kwargs);
  }

  /**
   * Calculates fugacity for a multi-component (mixture) system using the selected EOS.
   *
   * This method is intended for mixture workflows and delegates execution to `EosCore`.
   *
   * @param modelName - EOS model identifier for mixture calculations.
   * @param modelInput - Mixture thermodynamic input payload (state, composition, and any EOS-specific values).
   * @param modelSource - Data source/provider for component and EOS parameters.
   * @param solverMethod - Numerical solver strategy for EOS root solving. Defaults to `"ls"`.
   * @param kwargs - Optional extensible options forwarded to EOS initialization and execution.
   * @returns Mixture fugacity result from `EosCore.calFugacityMixture`.
   */
  calFugacityMixture(modelName: EosModelName, modelInput: Record<string, any>, modelSource: ModelSource, solverMethod: SolverMethod = "ls", kwargs: Record<string, unknown> = {}) {
    return this.initEos(kwargs).calFugacityMixture(modelName, modelInput, modelSource, solverMethod, kwargs);
  }

  /**
   * Computes EOS roots for a multi-component (mixture) system.
   *
   * This method is useful for mixture phase diagnostics where root structure impacts phase selection.
   *
   * @param modelName - EOS model identifier used for mixture root solving.
   * @param modelInput - Mixture input payload required by the EOS routine.
   * @param modelSource - Data source/provider for model and component properties.
   * @param kwargs - Optional extensible options forwarded to EOS initialization and root computation.
   * @returns Root-solving result from `EosCore.checkEosRootsMultiComponent`.
   */
  checkEosRootsMultiComponent(
    modelName: EosModelName,
    modelInput: Record<string, any>,
    modelSource: ModelSource,
    kwargs: Record<string, unknown> = {}
  ) {
    return this.initEos(kwargs).checkEosRootsMultiComponent(modelName, modelInput, modelSource, kwargs);
  }

  /**
   * Creates and returns the EOS engine instance used by this adapter.
   *
   * The current TypeScript port always constructs a new `EosCore` instance and ignores `kwargs`.
   * The parameter is preserved for API compatibility and future extension.
   *
   * @param _kwargs - Optional initialization options (currently unused).
   * @returns A new `EosCore` instance.
   */
  initEos(_kwargs: Record<string, unknown> = {}) {
    return new EosCore();
  }

  initActivity(args: {
    datasource?: Record<string, unknown>;
    equationsource?: Record<string, unknown>;
    dataSource?: Record<string, unknown>;
    equationSource?: Record<string, unknown>;
    components: string[];
    mixture_id?: string;
  }) {
    const datasource = (args.datasource ?? args.dataSource ?? {}) as Record<string, unknown>;
    const equationsource = (args.equationsource ?? args.equationSource ?? {}) as Record<string, unknown>;
    return new ActivityCore(datasource, equationsource, args.components, { mixture_id: args.mixture_id });
  }

  initActivities(args: Parameters<ThermoModelCore["initActivity"]>[0]) {
    const core = this.initActivity(args);
    return {
      nrtl: core.nrtl,
      uniquac: core.uniquac,
      unifac: core.unifac,
      activity_core: core
    };
  }

  selectActivities(args: {
    model_name: "NRTL" | "UNIQUAC" | "UNIFAC";
    datasource?: Record<string, unknown>;
    equationsource?: Record<string, unknown>;
    dataSource?: Record<string, unknown>;
    equationSource?: Record<string, unknown>;
    components: string[];
    mixture_id?: string;
  }) {
    const core = this.initActivity(args);
    return core.select(args.model_name);
  }

  calcActivityCoefficient(
    components: Component[],
    pressure: { value: number; unit: string },
    temperature: { value: number; unit: string },
    modelSource: ModelSource,
    modelName: "NRTL" | "UNIQUAC",
    kwargs: Record<string, unknown> = {}
  ) {
    const normalized = normalizeModelSource(modelSource);
    const result = calcActivityCoefficientActivity(components, pressure as any, temperature as any, normalized, modelName, "Name-State", "Name", "-", "|", undefined, false, kwargs);
    this._results.activity = result;
    return result;
  }

  init_activity(...args: Parameters<ThermoModelCore["initActivity"]>) { return this.initActivity(...args); }
  init_activities(...args: Parameters<ThermoModelCore["initActivities"]>) { return this.initActivities(...args); }
  select_activities(...args: Parameters<ThermoModelCore["selectActivities"]>) { return this.selectActivities(...args); }

  /**
   * Snake-case compatibility alias for {@link calFugacity}.
   *
   * @param args - Forwarded arguments for {@link calFugacity}.
   * @returns The same result as {@link calFugacity}.
   */
  cal_fugacity(...args: Parameters<ThermoModelCore["calFugacity"]>) { return this.calFugacity(...args); }
  /**
   * Snake-case compatibility alias for {@link checkEosRootsSingleComponent}.
   *
   * @param args - Forwarded arguments for {@link checkEosRootsSingleComponent}.
   * @returns The same result as {@link checkEosRootsSingleComponent}.
   */
  check_eos_roots_single_component(...args: Parameters<ThermoModelCore["checkEosRootsSingleComponent"]>) { return this.checkEosRootsSingleComponent(...args); }
  /**
   * Snake-case compatibility alias for {@link calFugacityMixture}.
   *
   * @param args - Forwarded arguments for {@link calFugacityMixture}.
   * @returns The same result as {@link calFugacityMixture}.
   */
  cal_fugacity_mixture(...args: Parameters<ThermoModelCore["calFugacityMixture"]>) { return this.calFugacityMixture(...args); }
  /**
   * Snake-case compatibility alias for {@link checkEosRootsMultiComponent}.
   *
   * @param args - Forwarded arguments for {@link checkEosRootsMultiComponent}.
   * @returns The same result as {@link checkEosRootsMultiComponent}.
   */
  check_eos_roots_multi_component(...args: Parameters<ThermoModelCore["checkEosRootsMultiComponent"]>) { return this.checkEosRootsMultiComponent(...args); }
  /**
   * Snake-case compatibility alias for {@link initEos}.
   *
   * @param args - Forwarded arguments for {@link initEos}.
   * @returns The same result as {@link initEos}.
   */
  init_eos(...args: Parameters<ThermoModelCore["initEos"]>) { return this.initEos(...args); }
}
