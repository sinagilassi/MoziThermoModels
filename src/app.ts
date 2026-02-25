// export all core functions and types
export * from "@/core/eos-methods";
import type { ModelSource } from "@/types";
import { ThermoModelError } from "@/errors";
import { ThermoModelCore } from "@/docs/thermomodelcore";
import { ActivityCore, NRTL, UNIQUAC, UNIFAC } from "@/activity";

export const EQUATION_OF_STATE_MODELS = ["SRK", "PR", "RK", "vdW"] as const;
export const ACTIVITY_MODELS = ["NRTL", "UNIQUAC", "UNIFAC"] as const;

type ActivityModelName = typeof ACTIVITY_MODELS[number];
type ActivitySourceInput =
  | Partial<ModelSource>
  | {
    datasource?: Record<string, unknown>;
    equationsource?: Record<string, unknown>;
  };

type ActivityAppArgs = {
  components: string[];
  model_name: ActivityModelName;
  model_source?: ActivitySourceInput;
} & Record<string, unknown>;

/**
 * Normalizes the optional `model_source` object used by activity-model initialization.
 *
 * This helper accepts either canonical snake_case keys (`datasource`, `equationsource`)
 * or camelCase aliases (`dataSource`, `equationSource`) and guarantees both fields are
 * always returned as objects.
 *
 * @param modelSource - Optional model source payload.
 * @returns A normalized source object containing `datasource` and `equationsource`.
 * @throws {ThermoModelError} When `model_source` is not a plain object.
 */
function normalizeActivityModelSource(modelSource?: ActivitySourceInput) {
  if (modelSource == null) {
    return {
      datasource: {} as Record<string, unknown>,
      equationsource: {} as Record<string, unknown>
    };
  }
  if (typeof modelSource !== "object" || Array.isArray(modelSource)) {
    throw new ThermoModelError("model_source must be an object", "INVALID_MODEL_SOURCE");
  }

  const ms = modelSource as Record<string, unknown>;
  const datasource = (ms.datasource ?? ms.dataSource ?? {}) as Record<string, unknown>;
  const equationsource = (ms.equationsource ?? ms.equationSource ?? {}) as Record<string, unknown>;

  return { datasource, equationsource };
}

/**
 * Splits top-level activity app arguments into explicit required fields and residual kwargs.
 *
 * This function mirrors the Python-style `**kwargs` flow used throughout the project, while
 * normalizing `model_source` into predictable source objects for downstream initialization.
 *
 * @param args - Full argument bag passed to `activity()` / `activities()`.
 * @returns Parsed fields containing components, model name, normalized sources, and extra kwargs.
 */
function splitActivityArgs(args: ActivityAppArgs) {
  const { components, model_name, model_source, ...kwargs } = args;
  const { datasource, equationsource } = normalizeActivityModelSource(model_source);
  return { components, model_name, datasource, equationsource, kwargs };
}

/**
 * Creates and returns a new `ThermoModelCore` instance.
 *
 * Use this when you need direct access to the core API for custom workflows,
 * instead of using the higher-level convenience wrappers (`eos`, `activity`, `activities`).
 *
 * @returns A fresh `ThermoModelCore` object.
 */
export function init(): ThermoModelCore {
  return new ThermoModelCore();
}

/**
 * Initializes and returns an equation-of-state (EOS) manager from input options.
 *
 * The provided `kwargs` are forwarded directly to `ThermoModelCore.init_eos`.
 * Supported model names are exposed at runtime via `eos.metadata`.
 *
 * @param kwargs - EOS configuration options.
 * @returns The initialized EOS entry point returned by `init_eos`.
 */
export function eos(kwargs: Record<string, unknown> = {}) {
  const core = new ThermoModelCore();
  return core.init_eos(kwargs);
}

/**
 * Initializes and returns an `ActivityCore` instance for mixture activity modeling.
 *
 * Required fields include `components` and `model_name`. Additional keys are passed through
 * as keyword-like options to match the Python-facing API behavior.
 *
 * @param args - Activity initialization arguments.
 * @returns An initialized `ActivityCore` instance.
 */
export function activity(args: ActivityAppArgs): ActivityCore {
  const { components, datasource, equationsource, kwargs } = splitActivityArgs(args);
  const core = new ThermoModelCore();
  return core.init_activity({
    components,
    datasource,
    equationsource,
    ...(kwargs as Record<string, unknown>)
  });
}

/**
 * Initializes activity modeling and returns a concrete activity model implementation.
 *
 * This convenience API first creates an `ActivityCore` and then selects one of
 * `NRTL`, `UNIQUAC`, or `UNIFAC` using `model_name`.
 *
 * Behavior is intentionally aligned with the Python `app.py` interface, even if
 * lower-level initialization may evolve.
 *
 * @param args - Activity initialization arguments, including target `model_name`.
 * @returns The selected concrete activity model instance.
 */
export function activities(args: ActivityAppArgs & { check_reference?: boolean }): NRTL | UNIQUAC | UNIFAC {
  const { components, model_name, datasource, equationsource, kwargs } = splitActivityArgs(args);
  const core = new ThermoModelCore();

  // Keep Python app.py behavior stable even if init_activities returns a convenience bundle.
  const activityCore = core.init_activity({
    components,
    datasource,
    equationsource,
    ...(kwargs as Record<string, unknown>)
  });

  return activityCore.select(model_name);
}

(eos as any).metadata = EQUATION_OF_STATE_MODELS;
(activity as any).metadata = ACTIVITY_MODELS;
(activities as any).metadata = ACTIVITY_MODELS;

export { ThermoModelCore };
export { ActivityCore, NRTL, UNIQUAC, UNIFAC };
