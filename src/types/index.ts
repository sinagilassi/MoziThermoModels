export type PhaseName = "VAPOR" | "LIQUID" | "SUPERCRITICAL" | "VAPOR-LIQUID";
export type EosModelName = "PR" | "SRK" | "RK" | "vdW";
export type EosModelNameInput = EosModelName | "VDW" | "pr" | "srk" | "rk" | "vdw";
export type SolverMethod = "ls" | "newton" | "fsolve" | "root";
export type LiquidFugacityMode = "EOS" | "Poynting";
export type ComponentKey = "Name-State" | "Formula-State";
export type MixtureKey = "Name" | "Formula";

export interface ComponentLike {
  name?: string;
  formula?: string;
  state?: string;
  mole_fraction?: number;
  moleFraction?: number;
  [key: string]: unknown;
}

export interface PropertyValue<T extends number | number[] = number | number[]> {
  value: T;
  unit: string;
  symbol?: string;
}

export interface ScalarWithUnit {
  value: number;
  unit: string;
  symbol?: string;
}

export interface ModelSourceLike {
  dataSource?: Record<string, unknown>;
  equationSource?: Record<string, unknown>;
  datasource?: Record<string, unknown>;
  equationsource?: Record<string, unknown>;
}

export interface ComponentEosRootResult {
  component_name: string;
  pressure: PropertyValue<number>;
  temperature: PropertyValue<number>;
  root: number;
  root_no: string;
  phase: PhaseName;
  vapor_pressure: PropertyValue<number>;
  critical_temperature: PropertyValue<number>;
  critical_pressure: PropertyValue<number>;
  tolerance: number;
  vapor_pressure_check: number;
  temperature_equality_value: number;
  pressure_equality_check: boolean;
  temperature_equality_check: boolean;
  message: string;
}

export interface MixtureEosRootResult {
  mixture_name: string;
  pressure: PropertyValue<number>;
  temperature: PropertyValue<number>;
  bubble_pressure: PropertyValue<number>;
  dew_point_pressure: PropertyValue<number>;
  bubble_point_temperature: PropertyValue<number>;
  dew_point_temperature: PropertyValue<number>;
  phase: PhaseName;
  tolerance: number;
  message: string;
}

export interface ComponentGasFugacityPhaseResult {
  mole_fraction: number;
  temperature: PropertyValue<number>;
  pressure: PropertyValue<number>;
  molar_volume: PropertyValue<number>;
  compressibility_coefficient: PropertyValue<number>;
  fugacity_coefficient: PropertyValue<number>;
  fugacity: PropertyValue<number>;
  roots: PropertyValue<number[]>;
  mode: "SINGLE" | "MIXTURE";
  phase: PhaseName;
  eos_model: string;
}

export interface ComponentLiquidFugacityPhaseResult extends ComponentGasFugacityPhaseResult {
  vapor_pressure: PropertyValue<number>;
  fugacity_coefficient_sat: PropertyValue<number>;
  Poynting_term: PropertyValue<number>;
  fugacity_sat: PropertyValue<number>;
}

export interface ComponentGasFugacityResult {
  phase: string[];
  component: string[];
  results: Record<string, ComponentGasFugacityPhaseResult>;
}

export interface ComponentLiquidFugacityResult {
  phase: string[];
  component: string[];
  results: Record<string, ComponentGasFugacityPhaseResult | ComponentLiquidFugacityPhaseResult>;
}

export interface MixtureFugacityResult {
  phase: string[];
  components: string[];
  results: Record<string, Record<string, ComponentGasFugacityPhaseResult>>;
}

export interface ActivityCoefficientResult {
  property_name: string;
  components: string[];
  mole_fraction: Record<string, number> | number[];
  value: Record<string, number>;
  unit: string;
  symbol: string;
  message: string;
}

export interface ExcessGibbsResult {
  property_name: string;
  components: string[];
  mole_fraction: Record<string, number> | number[];
  value: number;
  unit: string;
  symbol: string;
  message: string;
  activity_coefficients?: Record<string, number> | number[];
}

export type {
  RawThermoRecord,
  Eq,
  ConfigParamMap,
  ConfigArgMap,
  ConfigRetMap,
  ModelSource,
  ComponentData,
  Equation,
  ComponentEquation,
  LaunchEquation,
  LaunchEquationAsync,
  ComponentEquationSource,
  CalcEqResult,
  ExecEqResult,
} from "mozithermodb";
