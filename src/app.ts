// export all core functions and types
export * from "./core/eos-methods";

import type { ModelSource } from "./types";
import { ThermoModelError } from "./errors";
import { ThermoModelCore } from "./docs/thermomodelcore";
import { ActivityCore, NRTL, UNIQUAC, UNIFAC } from "./activity";

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

function splitActivityArgs(args: ActivityAppArgs) {
  const { components, model_name, model_source, ...kwargs } = args;
  const { datasource, equationsource } = normalizeActivityModelSource(model_source);
  return { components, model_name, datasource, equationsource, kwargs };
}

export function init(): ThermoModelCore {
  return new ThermoModelCore();
}

export function eos(kwargs: Record<string, unknown> = {}) {
  const core = new ThermoModelCore();
  return core.init_eos(kwargs);
}

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
