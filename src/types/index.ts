export * from "mozithermodb";
export type * from "mozithermodb";

export type {
  Component as StrictComponent,
  ComponentInput,
  ComponentKey,
  MixtureKey,
  Pressure,
  Temperature,
  CustomProp,
  CustomProperty
} from "mozithermodb-settings";

export type Component = Omit<import("mozithermodb-settings").ComponentInput, "mole_fraction"> & {
  mole_fraction?: number;
  moleFraction?: number;
};

export type PhaseName = "VAPOR" | "LIQUID" | "VAPOR-LIQUID" | "SUPERCRITICAL" | "CRITICAL" | "SOLID";

export type ComponentLike = import("mozithermodb-settings").Component & {
  moleFraction?: number;
};

export type ModelSourceLike = {
  dataSource?: Record<string, unknown>;
  equationSource?: Record<string, unknown>;
  datasource?: Record<string, unknown>;
  equationsource?: Record<string, unknown>;
};

export interface NumericProperty {
  value: number | Record<string, number>;
  unit: string;
  symbol?: string;
}

export interface RootAnalysisEntry {
  component_name: string;
  pressure: NumericProperty;
  temperature: NumericProperty;
  vapor_pressure?: NumericProperty;
  critical_pressure?: NumericProperty;
  critical_temperature?: NumericProperty;
  root_analysis: number;
  root: string;
  message?: string;
}

export interface ComponentEosRootResult {
  component: string;
  phase: PhaseName;
  pressure: NumericProperty;
  temperature: NumericProperty;
  root_analysis: RootAnalysisEntry[];
  message?: string;
}

export interface MixtureEosRootResult {
  components: string[];
  phase: PhaseName;
  pressure: NumericProperty;
  temperature: NumericProperty;
  root_analysis: RootAnalysisEntry[];
  message?: string;
}

export interface FugacityPhaseResult {
  phase: PhaseName;
  compressibility_factor: NumericProperty;
  fugacity_coefficient: NumericProperty | { value: Record<string, number>; unit: string; symbol?: string };
  fugacity: NumericProperty | { value: Record<string, number>; unit: string; symbol?: string };
  selected_root?: number;
  roots?: number[];
  solver_method?: string;
  calculation_mode?: string;
  message?: string;
}

export interface ComponentGasFugacityResult {
  component: string;
  pressure: NumericProperty;
  temperature: NumericProperty;
  results: Record<string, FugacityPhaseResult>;
  message?: string;
}

export type ComponentLiquidFugacityResult = ComponentGasFugacityResult;

export interface MixtureFugacityResult {
  components: string[];
  pressure: NumericProperty;
  temperature: NumericProperty;
  results: Record<string, FugacityPhaseResult>;
  message?: string;
}

export interface ExcessGibbsResult {
  property_name: string;
  components: string[];
  mole_fraction: Record<string, number> | number[];
  value: number;
  unit: string;
  symbol: string;
  message?: string;
  activity_coefficients: Record<string, number> | number[];
}

export interface ActivityCoefficientResult {
  property_name: string;
  components: string[];
  mole_fraction: Record<string, number>;
  value: Record<string, number>;
  unit: string;
  symbol: string;
  message?: string;
}

export type EosModelName = "SRK" | "PR" | "RK" | "vdW";
export type SolverMethod = "ls" | "newton" | "fsolve" | "root";
export type LiquidFugacityMode = "EOS" | "Poynting";
