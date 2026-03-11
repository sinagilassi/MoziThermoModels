// import libs
export * from "mozithermodb";
export type * from "mozithermodb";
import { ModelSource } from "mozithermodb";

// NOTE: EOS Model Names
export type EosModelName = "SRK" | "PR" | "RK" | "vdW";

// NOTE: Solver Methods
export type SolverMethod = "ls" | "newton" | "fsolve" | "root" | "qr";

export interface QrSolverOptions {
    max_iter?: number;
    tol?: number;
    polish_newton?: boolean;
}

export interface IterativeSolverOptions {
    guessNo?: number;
    bounds?: [number, number, number];
    maxIter?: number;
    ftol?: number;
    xtol?: number;
}

export interface EosSolverOptions {
    ls?: IterativeSolverOptions;
    newton?: IterativeSolverOptions;
    fsolve?: IterativeSolverOptions;
    qr?: QrSolverOptions;
}

// NOTE: Liquid Fugacity Calculation Modes
export type LiquidFugacityMode = "EOS" | "Poynting";

// NOTE: mozithermodb-settings types
import type {
    Component,
    ComponentKey,
    Pressure,
    Temperature,
} from "mozithermodb-settings";

export type {
    Component,
    ComponentInput,
    ComponentKey,
    MixtureKey,
    Pressure,
    Temperature,
    CustomProp,
    CustomProperty
} from "mozithermodb-settings";

export type PhaseName = "VAPOR" | "LIQUID" | "VAPOR-LIQUID" | "SUPERCRITICAL" | "CRITICAL" | "SOLID";

export type ComponentLike = Component;
export type FugacityPhaseMode = "auto" | "gas" | "liquid" | "both";

export interface CriticalTolerance {
    temperature?: number;
    pressure?: number;
}

export interface PureComponentFugacityInput {
    component: Component;
    pressure: Pressure;
    temperature: Temperature;
    modelSource: ModelSource;
    modelName?: EosModelName;
    componentKey?: ComponentKey;
    phaseMode?: FugacityPhaseMode;
    solverMethod?: SolverMethod;
    solverOptions?: EosSolverOptions;
    solver_options?: EosSolverOptions;
    solverFallback?: boolean;
    solver_fallback?: boolean;
    tolerance?: number;
    criticalTolerance?: CriticalTolerance;
    liquidFugacityMode?: LiquidFugacityMode;
}

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
    diagnostics?: Record<string, unknown>;
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
