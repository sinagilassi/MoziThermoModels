import * as mz from "mozithermodb";

// SECTION: Exports
export * from "./app";
export * from "mozithermodb";
export * from "./types";
export * from "./configs";
export * from "./core";
export * from "./docs";
export * from "./eos";
export * from "./activity";
export {
  loadUnifacDataFromJson,
  type UnifacModelGroupData,
  type UnifacModelInteractionData,
} from "./utils";

// NOTE: eos eq solver
export * from "./core/main";

type LooseComponent = {
  name: string;
  formula: string;
  state: string;
  mole_fraction?: number;
  [key: string]: unknown;
};

export const buildComponentData = (
  component: LooseComponent,
  data: Parameters<typeof mz.buildComponentData>[1],
  componentKey?: Parameters<typeof mz.buildComponentData>[2],
  enableDataComponentMatchCheck?: Parameters<typeof mz.buildComponentData>[3],
  dataComponentMatchKey?: Parameters<typeof mz.buildComponentData>[4]
) => mz.buildComponentData(component as any, data, componentKey as any, enableDataComponentMatchCheck, dataComponentMatchKey as any);

export const buildComponentEquation = (
  component: LooseComponent,
  equation: Parameters<typeof mz.buildComponentEquation>[1],
  data: Parameters<typeof mz.buildComponentEquation>[2],
  componentKey?: Parameters<typeof mz.buildComponentEquation>[3],
  enableDataComponentMatchCheck?: Parameters<typeof mz.buildComponentEquation>[4],
  dataComponentMatchKey?: Parameters<typeof mz.buildComponentEquation>[5]
) => mz.buildComponentEquation(component as any, equation, data, componentKey as any, enableDataComponentMatchCheck, dataComponentMatchKey as any);

export const buildComponentsData = (
  components: LooseComponent[],
  data: Parameters<typeof mz.buildComponentsData>[1],
  componentKey?: Parameters<typeof mz.buildComponentsData>[2],
  enableDataComponentMatchCheck?: Parameters<typeof mz.buildComponentsData>[3],
  dataComponentMatchKey?: Parameters<typeof mz.buildComponentsData>[4]
) => mz.buildComponentsData(components as any, data, componentKey as any, enableDataComponentMatchCheck, dataComponentMatchKey as any);

export const buildComponentsEquation = (
  components: LooseComponent[],
  equation: Parameters<typeof mz.buildComponentsEquation>[1],
  data: Parameters<typeof mz.buildComponentsEquation>[2],
  componentKey?: Parameters<typeof mz.buildComponentsEquation>[3],
  enableDataComponentMatchCheck?: Parameters<typeof mz.buildComponentsEquation>[4],
  dataComponentMatchKey?: Parameters<typeof mz.buildComponentsEquation>[5]
) => mz.buildComponentsEquation(components as any, equation, data, componentKey as any, enableDataComponentMatchCheck, dataComponentMatchKey as any);

export class Source extends mz.Source {
  override eqBuilder(components: LooseComponent[], propName: string) {
    return super.eqBuilder(components as any, propName);
  }

  override execEq(components: LooseComponent[], eqSrcComp: Parameters<mz.Source["execEq"]>[1], argsValues?: Parameters<mz.Source["execEq"]>[2]) {
    return super.execEq(components as any, eqSrcComp, argsValues);
  }
}

export const mkdt = (component: LooseComponent, modelSource: Parameters<typeof mz.mkdt>[1], componentKey?: Parameters<typeof mz.mkdt>[2]) =>
  mz.mkdt(component as any, modelSource, componentKey as any);
export const mkeq = (name: string, component: LooseComponent, modelSource: Parameters<typeof mz.mkeq>[2], componentKey?: Parameters<typeof mz.mkeq>[3]) =>
  mz.mkeq(name, component as any, modelSource, componentKey as any);
export const mkeqs = (component: LooseComponent, modelSource: Parameters<typeof mz.mkeqs>[1], componentKey?: Parameters<typeof mz.mkeqs>[2]) =>
  mz.mkeqs(component as any, modelSource, componentKey as any);
