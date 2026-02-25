import { ThermoModelError } from "../core";

export type SolverMethod = "ls" | "newton" | "fsolve" | "root";

export interface ScalarFunctionContext<T> {
  fn: (x: number, ctx: T) => number;
  ctx: T;
}

export interface MultiStartOptions {
  guessNo?: number;
  bounds?: [number, number, number];
  maxIter?: number;
  ftol?: number;
  xtol?: number;
}

export interface SolverRunResult {
  roots: number[];
  solver_method: SolverMethod;
  iterations?: number;
  diagnostics?: Record<string, unknown>;
}

export function roundTo(value: number, decimals = 10): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

export function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

export function numericalDerivative(fn: (x: number) => number, x: number, h = 1e-6): number {
  const hEff = Math.max(Math.abs(x) * h, h);
  const f1 = fn(x + hEff);
  const f0 = fn(x - hEff);
  return (f1 - f0) / (2 * hEff);
}

export function dedupeSorted(values: number[], tol = 1e-8): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > tol) out.push(v);
  }
  return out;
}

export function normalizeRootCandidates(
  roots: number[],
  options: { positiveOnly?: boolean; roundDecimals?: number; dedupeTol?: number } = {}
): number[] {
  const positiveOnly = options.positiveOnly ?? true;
  const roundDecimals = options.roundDecimals ?? 10;
  const dedupeTol = options.dedupeTol ?? 1e-8;
  const filtered = roots.filter((x) => Number.isFinite(x) && (!positiveOnly || x > 0));
  const rounded = filtered.map((x) => roundTo(x, roundDecimals));
  return dedupeSorted(rounded, dedupeTol);
}

export function selectRootsByAnalysis(rootId: number, Zi: number[]): number[] {
  if (!Zi.length) return [];
  if (rootId === 1) return normalizeRootCandidates([Math.min(...Zi), Math.max(...Zi)]);
  if (rootId === 2) return normalizeRootCandidates([Math.min(...Zi)]);
  if (rootId === 3) return normalizeRootCandidates([Math.max(...Zi)]);
  if (rootId === 4) return normalizeRootCandidates([Math.max(...Zi)]);
  throw new ThermoModelError(`Invalid root analysis id: ${rootId}`, "INVALID_ROOT_ID");
}

export function solveByPolynomialRoots(coeff: [number, number, number, number]): SolverRunResult {
  const roots = normalizeRootCandidates(solveCubicRealRoots(coeff[0], coeff[1], coeff[2], coeff[3]));
  return { roots, solver_method: "root" };
}

export function solveByNewtonMultiStart<T>(
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const guesses = linspace(1e-5, 2, guessNo);
  const roots: number[] = [];
  let iterations = 0;
  let successCount = 0;

  for (const x0 of guesses) {
    const res = newtonScalar((x) => target.fn(x, target.ctx), x0, options);
    iterations += res.iterations;
    if (res.success && res.x != null) {
      roots.push(res.x);
      successCount += 1;
    }
  }

  return {
    roots: normalizeRootCandidates(roots),
    solver_method: "newton",
    iterations,
    diagnostics: { guessNo, successCount }
  };
}

export function solveByFsolveLikeMultiStart<T>(
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const guesses = linspace(1e-5, 2, guessNo);
  const roots: number[] = [];
  let iterations = 0;
  let successCount = 0;

  for (const x0 of guesses) {
    const res = fsolveLikeScalar((x) => target.fn(x, target.ctx), x0, options);
    iterations += res.iterations;
    if (res.success && res.x != null) {
      roots.push(res.x);
      successCount += 1;
    }
  }

  return {
    roots: normalizeRootCandidates(roots),
    solver_method: "fsolve",
    iterations,
    diagnostics: { guessNo, successCount }
  };
}

export function solveByLeastSquaresMultiStart<T>(
  rootId: number,
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const windows = buildRootSearchWindows(rootId, guessNo, options.bounds ?? [-2, 5, 0.5]);
  const roots: number[] = [];
  let iterations = 0;
  let successCount = 0;

  for (const item of windows) {
    const res = leastSquaresScalar((x) => target.fn(x, target.ctx), item.guess, item.window, options);
    iterations += res.iterations;
    if (res.success && res.x != null) {
      roots.push(res.x);
      successCount += 1;
    }
  }

  return {
    roots: normalizeRootCandidates(roots),
    solver_method: "ls",
    iterations,
    diagnostics: { guessNo, successCount, rootId }
  };
}

export function buildRootSearchWindows(
  rootId: number,
  guessNo: number,
  bounds: [number, number, number]
): Array<{ guess: number; window: [number, number] }> {
  const [bMin, bMax, bMid] = bounds;
  let guesses: number[];
  if (rootId === 1) {
    guesses = linspace(bMin, bMax, guessNo);
    return guesses.map((g) => ({ guess: g, window: g < bMid ? [bMin, bMid] as [number, number] : [bMid, bMax] as [number, number] }));
  }
  if (rootId === 2) {
    guesses = linspace(bMin, bMid, guessNo);
    return guesses.map((g) => ({ guess: g, window: [bMin, bMid] }));
  }
  if (rootId === 3) {
    guesses = linspace(bMid, bMax, guessNo);
    return guesses.map((g) => ({ guess: g, window: [bMid, bMax] }));
  }
  if (rootId === 4) {
    guesses = linspace(bMin, bMax, guessNo);
    return guesses.map((g) => ({ guess: g, window: [bMin, bMax] }));
  }
  throw new ThermoModelError(`Invalid root analysis id: ${rootId}`, "INVALID_ROOT_ID");
}

type ScalarSolveResult = { success: boolean; x?: number; iterations: number };

function newtonScalar(fn: (x: number) => number, x0: number, options: MultiStartOptions): ScalarSolveResult {
  const maxIter = options.maxIter ?? 80;
  const ftol = options.ftol ?? 1e-8;
  const xtol = options.xtol ?? 1e-8;
  let x = x0;

  for (let i = 0; i < maxIter; i++) {
    const fx = fn(x);
    if (!Number.isFinite(fx)) return { success: false, iterations: i + 1 };
    if (Math.abs(fx) <= ftol) return { success: true, x, iterations: i + 1 };
    const dfx = numericalDerivative(fn, x);
    if (!Number.isFinite(dfx) || Math.abs(dfx) < 1e-12) return { success: false, iterations: i + 1 };
    const xNew = x - fx / dfx;
    if (!Number.isFinite(xNew)) return { success: false, iterations: i + 1 };
    if (Math.abs(xNew - x) <= xtol) {
      const fNew = fn(xNew);
      return { success: Number.isFinite(fNew) && Math.abs(fNew) <= Math.max(ftol * 10, 1e-6), x: xNew, iterations: i + 1 };
    }
    x = xNew;
  }

  const fEnd = fn(x);
  return { success: Number.isFinite(fEnd) && Math.abs(fEnd) <= Math.max((options.ftol ?? 1e-8) * 10, 1e-6), x, iterations: maxIter };
}

function fsolveLikeScalar(fn: (x: number) => number, x0: number, options: MultiStartOptions): ScalarSolveResult {
  const maxIter = options.maxIter ?? 120;
  const ftol = options.ftol ?? 1e-8;
  const xtol = options.xtol ?? 1e-8;
  let xPrev = x0 === 0 ? 1e-4 : x0 * (1 + 1e-3) + 1e-5;
  let x = x0;
  let fPrev = fn(xPrev);
  let fx = fn(x);
  if (!Number.isFinite(fPrev) || !Number.isFinite(fx)) return { success: false, iterations: 1 };

  for (let i = 0; i < maxIter; i++) {
    if (Math.abs(fx) <= ftol) return { success: true, x, iterations: i + 1 };

    let xNew: number | undefined;
    const dfx = numericalDerivative(fn, x);
    if (Number.isFinite(dfx) && Math.abs(dfx) >= 1e-12) {
      xNew = x - fx / dfx;
    }
    if (!Number.isFinite(xNew ?? NaN)) {
      const denom = fx - fPrev;
      if (Math.abs(denom) < 1e-14) return { success: false, iterations: i + 1 };
      xNew = x - fx * (x - xPrev) / denom;
    }
    if (!Number.isFinite(xNew)) return { success: false, iterations: i + 1 };
    const xNext = xNew as number;
    if (Math.abs(xNext - x) <= xtol) {
      const fNew = fn(xNext);
      return { success: Number.isFinite(fNew) && Math.abs(fNew) <= Math.max(ftol * 10, 1e-6), x: xNext, iterations: i + 1 };
    }

    xPrev = x;
    fPrev = fx;
    x = xNext;
    fx = fn(x);
    if (!Number.isFinite(fx)) return { success: false, iterations: i + 1 };
  }

  return { success: Math.abs(fx) <= Math.max(ftol * 10, 1e-6), x, iterations: maxIter };
}

function leastSquaresScalar(
  fn: (x: number) => number,
  x0: number,
  window: [number, number],
  options: MultiStartOptions
): ScalarSolveResult {
  const ftol = options.ftol ?? 1e-8;
  const xtol = options.xtol ?? 1e-8;
  const maxIter = options.maxIter ?? 80;
  let [lo, hi] = window;
  if (!(lo < hi)) return { success: false, iterations: 1 };
  let xBest = clamp(x0, lo, hi);
  let gBest = sqSafe(fn(xBest));
  let iterations = 0;

  const gridN = 9;
  for (let k = 0; k < maxIter; k++) {
    iterations += 1;
    const pts = linspace(lo, hi, gridN);
    for (const x of pts) {
      const g = sqSafe(fn(x));
      if (g < gBest) {
        gBest = g;
        xBest = x;
      }
      if (g <= ftol * ftol) {
        return { success: true, x, iterations };
      }
    }

    const span = hi - lo;
    if (span <= xtol) break;
    const delta = span / 4;
    lo = Math.max(window[0], xBest - delta);
    hi = Math.min(window[1], xBest + delta);
  }

  // Try a local Newton polish from the best point.
  const polish = newtonScalar(fn, xBest, { ...options, maxIter: 20 });
  if (polish.success && polish.x != null) return { success: true, x: polish.x, iterations: iterations + polish.iterations };

  // Fallback sign-change scan and bisection in the original window.
  const bracket = findBracket(fn, window[0], window[1], 60);
  if (bracket) {
    const bis = bisection(fn, bracket[0], bracket[1], { ftol, xtol, maxIter: 80 });
    return { success: bis.success, x: bis.x, iterations: iterations + bis.iterations };
  }

  const fBest = fn(xBest);
  return { success: Number.isFinite(fBest) && Math.abs(fBest) <= Math.max(ftol * 10, 1e-6), x: xBest, iterations };
}

function sqSafe(v: number): number {
  if (!Number.isFinite(v)) return Number.POSITIVE_INFINITY;
  return v * v;
}

function findBracket(fn: (x: number) => number, lo: number, hi: number, n = 50): [number, number] | null {
  const xs = linspace(lo, hi, n);
  let xPrev = xs[0];
  let fPrev = fn(xPrev);
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i];
    const fx = fn(x);
    if (!Number.isFinite(fPrev) || !Number.isFinite(fx)) {
      xPrev = x; fPrev = fx; continue;
    }
    if (fPrev === 0) return [xPrev, xPrev];
    if (fx === 0) return [x, x];
    if (Math.sign(fPrev) !== Math.sign(fx)) return [xPrev, x];
    xPrev = x;
    fPrev = fx;
  }
  return null;
}

function bisection(fn: (x: number) => number, lo: number, hi: number, opts: { ftol: number; xtol: number; maxIter: number }): ScalarSolveResult {
  let a = lo;
  let b = hi;
  let fa = fn(a);
  let fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return { success: false, iterations: 1 };
  if (a === b) return { success: Math.abs(fa) <= opts.ftol, x: a, iterations: 1 };
  if (Math.sign(fa) === Math.sign(fb)) return { success: false, iterations: 1 };
  for (let i = 0; i < opts.maxIter; i++) {
    const c = 0.5 * (a + b);
    const fc = fn(c);
    if (!Number.isFinite(fc)) return { success: false, iterations: i + 1 };
    if (Math.abs(fc) <= opts.ftol || Math.abs(b - a) <= opts.xtol) return { success: true, x: c, iterations: i + 1 };
    if (Math.sign(fa) === Math.sign(fc)) { a = c; fa = fc; } else { b = c; fb = fc; }
  }
  return { success: false, x: 0.5 * (a + b), iterations: opts.maxIter };
}

export function solveCubicRealRoots(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-30) throw new ThermoModelError("Leading cubic coefficient cannot be zero", "INVALID_CUBIC");
  const A = b / a;
  const B = c / a;
  const C = d / a;

  const p = B - (A * A) / 3;
  const q = (2 * A * A * A) / 27 - (A * B) / 3 + C;
  const discriminant = (q * q) / 4 + (p * p * p) / 27;

  if (discriminant > 1e-14) {
    const sqrtD = Math.sqrt(discriminant);
    const u = cbrtReal(-q / 2 + sqrtD);
    const v = cbrtReal(-q / 2 - sqrtD);
    return [u + v - A / 3];
  }
  if (Math.abs(discriminant) <= 1e-14) {
    const u = cbrtReal(-q / 2);
    return [2 * u - A / 3, -u - A / 3];
  }

  const r = Math.sqrt(-(p ** 3) / 27);
  const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
  const m = 2 * Math.sqrt(-p / 3);
  return [
    m * Math.cos(phi / 3) - A / 3,
    m * Math.cos((phi + 2 * Math.PI) / 3) - A / 3,
    m * Math.cos((phi + 4 * Math.PI) / 3) - A / 3
  ];
}

function cbrtReal(x: number): number {
  return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}
