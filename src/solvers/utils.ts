import { ThermoModelError } from "@/core";

/**
 * Round a numeric value to a fixed decimal precision.
 *
 * @param value Input value to round.
 * @param decimals Number of decimal places to keep.
 * @returns Rounded numeric value.
 */
export function roundTo(value: number, decimals = 10): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/**
 * Check whether a number is finite and strictly positive.
 *
 * @param x Value to validate.
 * @returns `true` when `x` is finite and `x > 0`; otherwise `false`.
 */
export function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/**
 * Clamp a scalar value to an inclusive range.
 *
 * @param x Value to clamp.
 * @param lo Lower inclusive bound.
 * @param hi Upper inclusive bound.
 * @returns Clamped value in `[lo, hi]`.
 */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Generate linearly spaced points between two bounds.
 *
 * @param min Start value.
 * @param max End value.
 * @param n Number of points to generate.
 * @returns Array of `n` points from `min` to `max` (inclusive). If `n <= 1`, returns `[min]`.
 */
export function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

/**
 * Estimate the first derivative using a central finite-difference scheme.
 *
 * A scale-aware step is used to improve numerical stability across small and large `x`.
 *
 * @param fn Scalar function `f(x)`.
 * @param x Evaluation point.
 * @param h Base relative step size.
 * @returns Approximate derivative `f'(x)`.
 */
export function numericalDerivative(fn: (x: number) => number, x: number, h = 1e-6): number {
  const hEff = Math.max(Math.abs(x) * h, h);
  const f1 = fn(x + hEff);
  const f0 = fn(x - hEff);
  return (f1 - f0) / (2 * hEff);
}

/**
 * Sort values in ascending order and remove near-duplicates.
 *
 * @param values Input values.
 * @param tol Absolute tolerance for considering two adjacent sorted values equal.
 * @returns Sorted array with near-duplicate values removed.
 */
export function dedupeSorted(values: number[], tol = 1e-8): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > tol) out.push(v);
  }
  return out;
}

/**
 * Normalize candidate roots for downstream use.
 *
 * Processing order: finite filtering, optional positivity filtering, rounding, then deduplication.
 *
 * @param roots Raw candidate roots.
 * @param options Normalization settings.
 * @param options.positiveOnly When `true`, keep only roots `> 0`.
 * @param options.roundDecimals Decimal places used for `roundTo`.
 * @param options.dedupeTol Tolerance used when deduplicating sorted roots.
 * @returns Cleaned root list.
 */
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

/**
 * Select root candidates according to root-analysis mode.
 *
 * Modes:
 * - `1`: return both min and max roots (two-phase candidate set)
 * - `2`: return minimum root only
 * - `3`: return maximum root only
 * - `4`: return maximum root only
 *
 * @param rootId Root-analysis selector.
 * @param Zi Candidate roots.
 * @returns Normalized selected roots. Returns empty array when `Zi` is empty.
 * @throws {ThermoModelError} If `rootId` is not one of `1..4`.
 */
export function selectRootsByAnalysis(rootId: number, Zi: number[]): number[] {
  if (!Zi.length) return [];
  if (rootId === 1) return normalizeRootCandidates([Math.min(...Zi), Math.max(...Zi)]);
  if (rootId === 2) return normalizeRootCandidates([Math.min(...Zi)]);
  if (rootId === 3) return normalizeRootCandidates([Math.max(...Zi)]);
  if (rootId === 4) return normalizeRootCandidates([Math.max(...Zi)]);
  throw new ThermoModelError(`Invalid root analysis id: ${rootId}`, "INVALID_ROOT_ID");
}

/**
 * Build initial guesses and search windows for least-squares multi-start solving.
 *
 * @param rootId Root-analysis selector controlling how windows are partitioned.
 * @param guessNo Number of initial guesses.
 * @param bounds Tuple `[min, max, mid]` used to split search windows.
 * @returns Array of guess/window pairs.
 * @throws {ThermoModelError} If `rootId` is not one of `1..4`.
 */
export function buildRootSearchWindows(
  rootId: number,
  guessNo: number,
  bounds: [number, number, number]
): Array<{ guess: number; window: [number, number] }> {
  const [bMin, bMax, bMid] = bounds;
  let guesses: number[];
  if (rootId === 1) {
    guesses = linspace(bMin, bMax, guessNo);
    return guesses.map((g) => ({ guess: g, window: g < bMid ? [bMin, bMid] : [bMid, bMax] }));
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
