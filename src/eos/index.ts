import type {
  ComponentEosRootResult,
  ComponentGasFugacityPhaseResult,
  ComponentGasFugacityResult,
  ComponentKey,
  ComponentLike,
  ComponentLiquidFugacityPhaseResult,
  ComponentLiquidFugacityResult,
  EosModelName,
  EosModelNameInput,
  LiquidFugacityMode,
  MixtureEosRootResult,
  MixtureFugacityResult,
  ModelSourceLike,
  PhaseName,
  PropertyValue,
  SolverMethod
} from "../types";
import { createMixtureId, setComponentId, setFeedSpecification, ThermoModelError, toK, toPa } from "../core";
import { extractScalarRecord, evaluateEquation, modelSourceAccess } from "../docs";

const R = 8.314462618;
const DEFAULT_PHASES: PhaseName[] = ["VAPOR", "LIQUID", "SUPERCRITICAL", "VAPOR-LIQUID"];

type EosSpec = {
  name: EosModelName;
  u: number;
  w: number;
  omegaA: number;
  omegaB: number;
  alpha: (Tr: number, omega: number) => number;
};

type CriticalProps = { Tc: number; Pc: number; omega: number };

function pv<T extends number | number[]>(value: T, unit: string, symbol?: string): PropertyValue<T> {
  return { value, unit, symbol };
}

function normalizeModelName(modelName: EosModelNameInput = "SRK"): EosModelName {
  const m = String(modelName).toUpperCase();
  if (m === "PR") return "PR";
  if (m === "SRK") return "SRK";
  if (m === "RK") return "RK";
  if (m === "VDW") return "vdW";
  throw new ThermoModelError(`Unsupported EOS model: ${modelName}`, "UNSUPPORTED_EOS_MODEL");
}

function eosSpec(modelName: EosModelNameInput = "SRK"): EosSpec {
  const m = normalizeModelName(modelName);
  if (m === "PR") {
    return {
      name: "PR",
      u: 2,
      w: -1,
      omegaA: 0.45724,
      omegaB: 0.0778,
      alpha: (Tr, omega) => {
        const k = 0.37464 + 1.54226 * omega - 0.26992 * omega * omega;
        return (1 + k * (1 - Math.sqrt(Math.max(Tr, 1e-15)))) ** 2;
      }
    };
  }
  if (m === "SRK") {
    return {
      name: "SRK",
      u: 1,
      w: 0,
      omegaA: 0.42748,
      omegaB: 0.08664,
      alpha: (Tr, omega) => {
        const k = 0.480 + 1.574 * omega - 0.176 * omega * omega;
        return (1 + k * (1 - Math.sqrt(Math.max(Tr, 1e-15)))) ** 2;
      }
    };
  }
  if (m === "RK") {
    return {
      name: "RK",
      u: 1,
      w: 0,
      omegaA: 0.42748,
      omegaB: 0.08664,
      alpha: (Tr) => 1 / Math.sqrt(Math.max(Tr, 1e-15))
    };
  }
  return {
    name: "vdW",
    u: 0,
    w: 0,
    omegaA: 27 / 64,
    omegaB: 1 / 8,
    alpha: () => 1
  };
}

function cubicCbrt(x: number): number {
  return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}

function solveCubicRealMonic(a2: number, a1: number, a0: number): number[] {
  const p = a1 - (a2 * a2) / 3;
  const q = (2 * a2 ** 3) / 27 - (a2 * a1) / 3 + a0;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  const shift = a2 / 3;
  let roots: number[] = [];

  if (disc > 1e-14) {
    roots = [cubicCbrt(-q / 2 + Math.sqrt(disc)) + cubicCbrt(-q / 2 - Math.sqrt(disc)) - shift];
  } else if (Math.abs(disc) <= 1e-14) {
    const s = cubicCbrt(-q / 2);
    roots = [2 * s - shift, -s - shift];
  } else {
    const r = Math.sqrt(-(p ** 3) / 27);
    const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
    const m = 2 * Math.sqrt(-p / 3);
    roots = [
      m * Math.cos(phi / 3) - shift,
      m * Math.cos((phi + 2 * Math.PI) / 3) - shift,
      m * Math.cos((phi + 4 * Math.PI) / 3) - shift
    ];
  }
  return [...new Set(roots.map((r) => Number(r.toPrecision(15))))].sort((a, b) => a - b);
}

function cubicZRoots(A: number, B: number, u: number, w: number): number[] {
  const a2 = -(1 + B - u * B);
  const a1 = A - u * B - (u - w) * B * B;
  const a0 = -(A * B + w * B * B + w * B * B * B);
  const roots = solveCubicRealMonic(a2, a1, a0).filter((z) => Number.isFinite(z));
  if (!roots.length) throw new ThermoModelError("Failed to compute EOS roots", "EOS_ROOTS_FAILED");
  return roots;
}

function selectRoot(roots: number[], phase: PhaseName): number {
  const pos = roots.filter((z) => z > 0);
  const r = pos.length ? pos : roots;
  return phase === "LIQUID" ? r[0] : r[r.length - 1];
}

function pureParams(spec: EosSpec, props: CriticalProps, T: number, P: number) {
  const Tr = T / props.Tc;
  const alpha = spec.alpha(Tr, props.omega);
  const a = spec.omegaA * (R * R * props.Tc * props.Tc / props.Pc) * alpha;
  const b = spec.omegaB * (R * props.Tc / props.Pc);
  const A = a * P / (R * R * T * T);
  const B = b * P / (R * T);
  return { a, b, A, B };
}

function generalLnPhi(spec: EosSpec, A: number, B: number, Z: number, delta = 1): number {
  if (spec.name === "vdW") {
    return Z - 1 - Math.log(Math.max(Z - B, 1e-15)) - (A / Math.max(Z, 1e-15)) * delta;
  }
  const d2 = spec.u * spec.u - 4 * spec.w;
  const d = Math.sqrt(Math.max(d2, 0));
  const term = Math.log((2 * Z + B * (spec.u + d)) / (2 * Z + B * (spec.u - d)));
  return Z - 1 - Math.log(Math.max(Z - B, 1e-15)) - (A / Math.max(B * d, 1e-15)) * delta * term;
}

function pureFugacityState(
  modelName: EosModelNameInput,
  props: CriticalProps,
  T: number,
  P: number,
  phase: PhaseName,
  mode: "SINGLE" | "MIXTURE",
  moleFraction = 1
): ComponentGasFugacityPhaseResult {
  const spec = eosSpec(modelName);
  const { A, B } = pureParams(spec, props, T, P);
  const roots = cubicZRoots(A, B, spec.u, spec.w);
  const Z = selectRoot(roots, phase);
  const lnPhi = generalLnPhi(spec, A, B, Z, 1);
  const phi = Math.exp(lnPhi);
  return {
    mole_fraction: moleFraction,
    temperature: pv(T, "K", "T"),
    pressure: pv(P, "Pa", "P"),
    molar_volume: pv(Z * R * T / P, "m3/mol", "MoVo"),
    compressibility_coefficient: pv(Z, "dimensionless", "Z"),
    fugacity_coefficient: pv(phi, "dimensionless", "phi"),
    fugacity: pv(phi * moleFraction * P, "Pa", mode === "SINGLE" ? "Fug_PURE" : "Fug_MIX"),
    roots: pv(roots, "dimensionless", "Z_i"),
    mode,
    phase,
    eos_model: spec.name
  };
}

function pairMixA(ai: number[], k_ij?: number[][]): number[][] {
  const n = ai.length;
  const aij = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aij[i][j] = Math.sqrt(Math.max(ai[i], 0) * Math.max(ai[j], 0)) * (1 - (k_ij?.[i]?.[j] ?? 0));
    }
  }
  return aij;
}

function mixtureFugacityState(args: {
  modelName: EosModelNameInput;
  propsList: CriticalProps[];
  ids: string[];
  y: number[];
  T: number;
  P: number;
  phase: PhaseName;
  k_ij?: number[][];
}): Record<string, ComponentGasFugacityPhaseResult> {
  const spec = eosSpec(args.modelName);
  const ai: number[] = [];
  const bi: number[] = [];
  for (const p of args.propsList) {
    const prm = pureParams(spec, p, args.T, args.P);
    ai.push(prm.a);
    bi.push(prm.b);
  }
  const aij = pairMixA(ai, args.k_ij);
  let am = 0;
  let bm = 0;
  const n = args.y.length;
  for (let i = 0; i < n; i++) {
    bm += args.y[i] * bi[i];
    for (let j = 0; j < n; j++) am += args.y[i] * args.y[j] * aij[i][j];
  }
  const sumAij = Array.from({ length: n }, () => 0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += args.y[j] * aij[i][j];
    sumAij[i] = s;
  }
  const A = am * args.P / (R * R * args.T * args.T);
  const B = bm * args.P / (R * args.T);
  const roots = cubicZRoots(A, B, spec.u, spec.w);
  const Z = selectRoot(roots, args.phase);

  const out: Record<string, ComponentGasFugacityPhaseResult> = {};
  for (let i = 0; i < n; i++) {
    const bi_b = bi[i] / bm;
    const delta = (2 * sumAij[i]) / am - bi_b;
    const lnPhi = generalLnPhi(spec, A, B, Z, delta) + bi_b * (Z - 1) - (Z - 1);
    const phi = Math.exp(lnPhi);
    out[args.ids[i]] = {
      mole_fraction: args.y[i],
      temperature: pv(args.T, "K", "T"),
      pressure: pv(args.P, "Pa", "P"),
      molar_volume: pv(Z * R * args.T / args.P, "m3/mol", "MoVo"),
      compressibility_coefficient: pv(Z, "dimensionless", "Z"),
      fugacity_coefficient: pv(phi, "dimensionless", "phi"),
      fugacity: pv(phi * args.y[i] * args.P, "Pa", "Fug_MIX"),
      roots: pv(roots, "dimensionless", "Z_i"),
      mode: "MIXTURE",
      phase: args.phase,
      eos_model: spec.name
    };
  }
  return out;
}

function normalizePhase(phase?: string | null): PhaseName | undefined {
  if (!phase) return undefined;
  const p = phase.toUpperCase() as PhaseName;
  if (!DEFAULT_PHASES.includes(p)) throw new ThermoModelError(`Invalid phase: ${phase}`, "INVALID_PHASE");
  return p;
}

function ptToSI(pressure: { value: number; unit: string }, temperature: { value: number; unit: string }) {
  return { P: toPa(pressure.value, pressure.unit), T: toK(temperature.value, temperature.unit) };
}

function getCriticalProps(modelSource: ModelSourceLike, component: string | ComponentLike, componentKey: ComponentKey): CriticalProps {
  const { dataSource } = modelSourceAccess(modelSource);
  const Tc = extractScalarRecord(dataSource, component, "Tc", componentKey)?.value;
  const Pc = extractScalarRecord(dataSource, component, "Pc", componentKey)?.value;
  const omega =
    extractScalarRecord(dataSource, component, "AcFa", componentKey)?.value ??
    extractScalarRecord(dataSource, component, "omega", componentKey)?.value ??
    extractScalarRecord(dataSource, component, "w", componentKey)?.value ??
    0;
  if (!Number.isFinite(Tc) || !Number.isFinite(Pc)) {
    throw new ThermoModelError(`Missing Tc/Pc in dataSource for ${typeof component === "string" ? component : setComponentId(component, componentKey)}`, "MISSING_CRITICAL_PROPS");
  }
  return { Tc: Tc!, Pc: Pc!, omega: Number(omega) || 0 };
}

function getVaporPressure(modelSource: ModelSourceLike, component: string | ComponentLike, T: number, componentKey: ComponentKey): number | undefined {
  const { equationSource } = modelSourceAccess(modelSource);
  return evaluateEquation(equationSource, component, "VaPr", { T }, componentKey)?.value ??
    evaluateEquation(equationSource, component, "VaporPressure", { T }, componentKey)?.value;
}

function determinePurePhase(T: number, Tc: number, P: number, Psat: number, tolerance = 1e-1): { phase: PhaseName; root: number; rootNo: string } {
  const ptol = Math.max(tolerance, 1e-6);
  const ttol = Math.max(tolerance, 1e-6);
  if (T > Tc + ttol) return { phase: "SUPERCRITICAL", root: 4, rootNo: "1 real root (supercritical)" };
  if (Math.abs(P - Psat) <= ptol) return { phase: "VAPOR-LIQUID", root: 1, rootNo: "3 real roots (vapor-liquid)" };
  if (P > Psat) return { phase: "LIQUID", root: 2, rootNo: "1 real root (liquid)" };
  return { phase: "VAPOR", root: 3, rootNo: "1 real root (vapor)" };
}

export function checkComponentEosRoots(
  component: ComponentLike,
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSourceLike,
  modelName: EosModelNameInput = "SRK",
  componentKey: ComponentKey = "Name-State",
  options: { tolerance?: number; phase?: PhaseName } = {}
): ComponentEosRootResult {
  void modelName;
  const { P, T } = ptToSI(pressure, temperature);
  const props = getCriticalProps(modelSource, component, componentKey);
  const Psat = getVaporPressure(modelSource, component, T, componentKey);
  if (!Number.isFinite(Psat)) throw new ThermoModelError("Vapor pressure equation VaPr is required", "MISSING_VAPR");
  const tolerance = options.tolerance ?? 1e-1;
  const sel = options.phase ? { phase: options.phase, root: 0, rootNo: "user-provided phase" } : determinePurePhase(T, props.Tc, P, Psat!, tolerance);
  const componentId = setComponentId(component, componentKey);
  return {
    component_name: componentId,
    pressure: pv(P, "Pa", "P"),
    temperature: pv(T, "K", "T"),
    root: sel.root,
    root_no: sel.rootNo,
    phase: sel.phase,
    vapor_pressure: pv(Psat!, "Pa", "VaPr"),
    critical_temperature: pv(props.Tc, "K", "Tc"),
    critical_pressure: pv(props.Pc, "Pa", "Pc"),
    tolerance,
    vapor_pressure_check: P - Psat!,
    temperature_equality_value: T - props.Tc,
    pressure_equality_check: Math.abs(P - Psat!) <= tolerance,
    temperature_equality_check: Math.abs(T - props.Tc) <= tolerance,
    message: `Component ${componentId} at T=${T} K and P=${P} Pa is in ${sel.phase.toLowerCase()} phase.`
  };
}

export function checkMultiComponentEosRoots(
  components: ComponentLike[],
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSourceLike,
  modelName: EosModelNameInput = "SRK",
  bubblePointPressureMode: "Raoult" = "Raoult",
  dewPointPressureMode: "Raoult" = "Raoult",
  componentKey: ComponentKey = "Name-State",
  options: { tolerance?: number } = {}
): MixtureEosRootResult {
  void modelName;
  void bubblePointPressureMode;
  void dewPointPressureMode;
  const { P, T } = ptToSI(pressure, temperature);
  const feed = setFeedSpecification(components, componentKey);
  const ids = Object.keys(feed);
  const x = Object.values(feed);
  const Psats = ids.map((id) => {
    const val = getVaporPressure(modelSource, id, T, componentKey);
    if (!Number.isFinite(val)) throw new ThermoModelError(`Missing VaPr for ${id}`, "MISSING_VAPR");
    return val!;
  });
  const bubbleP = x.reduce((s, xi, i) => s + xi * Psats[i], 0);
  const dewP = 1 / x.reduce((s, yi, i) => s + yi / Math.max(Psats[i], 1e-15), 0);
  const tol = options.tolerance ?? 1e-1;
  let phase: PhaseName = "VAPOR-LIQUID";
  if (P > bubbleP + tol) phase = "LIQUID";
  else if (P < dewP - tol) phase = "VAPOR";
  return {
    mixture_name: createMixtureId(components, "Name"),
    pressure: pv(P, "Pa", "P"),
    temperature: pv(T, "K", "T"),
    bubble_pressure: pv(bubbleP, "Pa", "BuPr"),
    dew_point_pressure: pv(dewP, "Pa", "DePr"),
    bubble_point_temperature: pv(T, "K", "BuTe"),
    dew_point_temperature: pv(T, "K", "DeTe"),
    phase,
    tolerance: tol,
    message: `Mixture ${createMixtureId(components, "Name")} at T=${T} K and P=${P} Pa is in ${phase.toLowerCase()} phase.`
  };
}

export function calcGasFugacity(
  component: ComponentLike,
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSourceLike,
  modelName: EosModelNameInput = "SRK",
  solverMethod: SolverMethod = "ls",
  componentKey: ComponentKey = "Name-State",
  phaseNames: PhaseName[] = DEFAULT_PHASES,
  options: { tolerance?: number; phase?: PhaseName } = {}
): ComponentGasFugacityResult {
  void solverMethod;
  const { P, T } = ptToSI(pressure, temperature);
  const props = getCriticalProps(modelSource, component, componentKey);
  const Psat = getVaporPressure(modelSource, component, T, componentKey);
  const chosen = options.phase ?? (Number.isFinite(Psat) ? determinePurePhase(T, props.Tc, P, Psat!, options.tolerance).phase : "VAPOR");
  const phases = phaseNames.filter((p) => p !== "VAPOR-LIQUID" && (chosen === "VAPOR-LIQUID" ? (p === "VAPOR" || p === "LIQUID") : p === chosen));
  const id = setComponentId(component, componentKey);
  const results: Record<string, ComponentGasFugacityPhaseResult> = {};
  for (const phase of phases) results[phase] = pureFugacityState(modelName, props, T, P, phase, "SINGLE", 1);
  return { phase: Object.keys(results), component: [id], results };
}

export function calcLiquidFugacity(
  component: ComponentLike,
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSourceLike,
  modelName: EosModelNameInput = "SRK",
  solverMethod: SolverMethod = "ls",
  liquidFugacityMode: LiquidFugacityMode = "EOS",
  componentKey: ComponentKey = "Name-State",
  phaseNames: PhaseName[] = DEFAULT_PHASES,
  options: { tolerance?: number; phase?: PhaseName } = {}
): ComponentLiquidFugacityResult {
  void solverMethod;
  void phaseNames;
  void options;
  const { P, T } = ptToSI(pressure, temperature);
  const props = getCriticalProps(modelSource, component, componentKey);
  const base = pureFugacityState(modelName, props, T, P, "LIQUID", "SINGLE", 1);
  const id = setComponentId(component, componentKey);
  if (liquidFugacityMode === "EOS") {
    return { phase: ["LIQUID"], component: [id], results: { LIQUID: base } };
  }
  const Psat = getVaporPressure(modelSource, component, T, componentKey);
  if (!Number.isFinite(Psat)) throw new ThermoModelError("Poynting mode requires VaPr equation", "MISSING_VAPR");
  const sat = pureFugacityState(modelName, props, T, Psat!, "LIQUID", "SINGLE", 1);
  const poynting = Math.exp(base.molar_volume.value * (P - Psat!) / (R * T));
  const out: ComponentLiquidFugacityPhaseResult = {
    ...base,
    vapor_pressure: pv(Psat!, "Pa", "VaPr"),
    fugacity_coefficient_sat: pv(sat.fugacity_coefficient.value, "dimensionless", "phi_SAT"),
    Poynting_term: pv(poynting, "dimensionless", "Poynting"),
    fugacity_sat: pv(sat.fugacity_coefficient.value * Psat!, "Pa", "Fug_SAT"),
    fugacity: pv(sat.fugacity_coefficient.value * Psat! * poynting, "Pa", "Fug_PURE")
  };
  return { phase: ["LIQUID"], component: [id], results: { LIQUID: out } };
}

export function calcMixtureFugacity(
  components: ComponentLike[],
  pressure: { value: number; unit: string },
  temperature: { value: number; unit: string },
  modelSource: ModelSourceLike,
  modelName: EosModelNameInput = "SRK",
  solverMethod: SolverMethod = "ls",
  liquidFugacityMode: LiquidFugacityMode = "EOS",
  componentKey: ComponentKey = "Name-State",
  phaseNames: PhaseName[] = DEFAULT_PHASES,
  options: { tolerance?: number; phase?: PhaseName; k_ij?: number[][] } = {}
): MixtureFugacityResult {
  void solverMethod;
  void liquidFugacityMode;
  const { P, T } = ptToSI(pressure, temperature);
  const feed = setFeedSpecification(components, componentKey);
  const ids = Object.keys(feed);
  if (ids.length < 2) throw new ThermoModelError("calcMixtureFugacity requires at least 2 components", "INVALID_COMPONENT_COUNT");
  const y = Object.values(feed);
  const propsList = ids.map((id) => getCriticalProps(modelSource, id, componentKey));
  const autoPhase = checkMultiComponentEosRoots(components, pressure, temperature, modelSource, modelName, "Raoult", "Raoult", componentKey, options).phase;
  const selected = normalizePhase(options.phase) ?? autoPhase;
  const wanted = phaseNames.filter((p) => p !== "VAPOR-LIQUID" && (selected === "VAPOR-LIQUID" ? (p === "VAPOR" || p === "LIQUID") : p === selected));
  const results: Record<string, Record<string, ComponentGasFugacityPhaseResult>> = {};
  for (const phase of wanted) {
    results[phase] = mixtureFugacityState({ modelName, propsList, ids, y, T, P, phase, k_ij: options.k_ij });
  }
  return { phase: Object.keys(results), components: ids, results };
}

export function parseEosModelInputs(modelInputs: string): Record<string, unknown> {
  try {
    return JSON.parse(modelInputs);
  } catch {
    const out: Record<string, unknown> = {};
    for (const raw of modelInputs.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf(":");
      if (i < 0) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  }
}

export function calFugacity(
  modelName: EosModelNameInput,
  modelInput: {
    phase?: PhaseName;
    component?: string;
    pressure: { value: number; unit: string };
    temperature: { value: number; unit: string };
    "feed-specification"?: Record<string, number>;
    feedSpecification?: Record<string, number>;
  },
  modelSource: ModelSourceLike,
  solverMethod: SolverMethod = "ls",
  liquidFugacityMode: LiquidFugacityMode = "EOS",
  options: { componentKey?: ComponentKey; phaseNames?: PhaseName[]; k_ij?: number[][] } = {}
) {
  const feed = modelInput["feed-specification"] ?? modelInput.feedSpecification;
  if (feed) {
    const comps = Object.entries(feed).map(([name, x]) => ({ name, formula: name, state: "g", mole_fraction: x }));
    return calcMixtureFugacity(comps, modelInput.pressure, modelInput.temperature, modelSource, modelName, solverMethod, liquidFugacityMode, options.componentKey ?? "Name-State", options.phaseNames ?? DEFAULT_PHASES, { phase: modelInput.phase, k_ij: options.k_ij });
  }
  if (!modelInput.component) throw new ThermoModelError("component is required", "INVALID_MODEL_INPUT");
  return calcGasFugacity({ name: modelInput.component, formula: modelInput.component, state: "g" }, modelInput.pressure, modelInput.temperature, modelSource, modelName, solverMethod, options.componentKey ?? "Name-State", options.phaseNames ?? DEFAULT_PHASES, { phase: modelInput.phase });
}

export const check_component_eos_roots = checkComponentEosRoots;
export const check_multi_component_eos_roots = checkMultiComponentEosRoots;
export const calc_gas_fugacity = calcGasFugacity;
export const calc_liquid_fugacity = calcLiquidFugacity;
export const calc_mixture_fugacity = calcMixtureFugacity;
export const parse_model_inputs = parseEosModelInputs;
export const cal_fugacity = calFugacity;
