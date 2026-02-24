import { ThermoModelError } from "../core";
import type { EosModelName, LiquidFugacityMode, SolverMethod } from "../types";
import { EosCore } from "../eos/eoscore";

export class ThermoModelCore {
  calFugacity(
    modelName: EosModelName,
    modelInput: Record<string, any>,
    modelSource: Record<string, any>,
    solverMethod: SolverMethod = "ls",
    liquidFugacityMode: LiquidFugacityMode = "EOS",
    kwargs: Record<string, unknown> = {}
  ) {
    return this.initEos(kwargs).calFugacity(modelName, modelInput, modelSource, solverMethod, liquidFugacityMode, kwargs);
  }

  checkEosRootsSingleComponent(modelName: EosModelName, modelInput: Record<string, any>, modelSource: Record<string, any>, kwargs: Record<string, unknown> = {}) {
    return this.initEos(kwargs).checkEosRootsSingleComponent(modelName, modelInput, modelSource, kwargs);
  }

  calFugacityMixture(modelName: EosModelName, modelInput: Record<string, any>, modelSource: Record<string, any>, solverMethod: SolverMethod = "ls", kwargs: Record<string, unknown> = {}) {
    return this.initEos(kwargs).calFugacityMixture(modelName, modelInput, modelSource, solverMethod, kwargs);
  }

  checkEosRootsMultiComponent(modelName: EosModelName, modelInput: Record<string, any>, modelSource: Record<string, any>, kwargs: Record<string, unknown> = {}) {
    return this.initEos(kwargs).checkEosRootsMultiComponent(modelName, modelInput, modelSource, kwargs);
  }

  initEos(_kwargs: Record<string, unknown> = {}) {
    return new EosCore();
  }

  init_activity(): never { throw new ThermoModelError("Activity initialization is out of scope in ThermoModelCore TS EOS port", "NOT_IMPLEMENTED"); }
  init_activities(): never { throw new ThermoModelError("Activity initialization is out of scope in ThermoModelCore TS EOS port", "NOT_IMPLEMENTED"); }
  select_activities(): never { throw new ThermoModelError("Activity selection is out of scope in ThermoModelCore TS EOS port", "NOT_IMPLEMENTED"); }

  cal_fugacity(...args: Parameters<ThermoModelCore["calFugacity"]>) { return this.calFugacity(...args); }
  check_eos_roots_single_component(...args: Parameters<ThermoModelCore["checkEosRootsSingleComponent"]>) { return this.checkEosRootsSingleComponent(...args); }
  cal_fugacity_mixture(...args: Parameters<ThermoModelCore["calFugacityMixture"]>) { return this.calFugacityMixture(...args); }
  check_eos_roots_multi_component(...args: Parameters<ThermoModelCore["checkEosRootsMultiComponent"]>) { return this.checkEosRootsMultiComponent(...args); }
  init_eos(...args: Parameters<ThermoModelCore["initEos"]>) { return this.initEos(...args); }
}
