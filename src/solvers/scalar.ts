import type { MultiStartOptions, ScalarSolveResult } from "./types";
import { clamp, linspace, numericalDerivative } from "./utils";

/**
 * Solve a scalar root-finding problem using Newton's method from one initial guess.
 *
 * @param fn Residual function.
 * @param x0 Initial guess.
 * @param options Convergence and iteration controls.
 * @returns Scalar solve result containing success flag, root estimate, and iteration count.
 */
export function newtonScalar(fn: (x: number) => number, x0: number, options: MultiStartOptions): ScalarSolveResult {
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

/**
 * Solve a scalar equation with a derivative-first / secant-fallback strategy.
 *
 * This routine mimics common `fsolve` behavior by preferring Newton-like steps and
 * falling back to secant updates when derivative information is unreliable.
 *
 * @param fn Residual function.
 * @param x0 Initial guess.
 * @param options Convergence and iteration controls.
 * @returns Scalar solve result containing success flag, root estimate, and iteration count.
 */
export function fsolveLikeScalar(fn: (x: number) => number, x0: number, options: MultiStartOptions): ScalarSolveResult {
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

/**
 * Find a root candidate by minimizing squared residuals inside a bounded window.
 *
 * The routine performs grid-refinement search, then Newton polishing, then optional
 * sign-change bracketing and bisection fallback.
 *
 * @param fn Residual function.
 * @param x0 Initial guess.
 * @param window Search interval `[lo, hi]`.
 * @param options Convergence and iteration controls.
 * @returns Scalar solve result containing success flag, root estimate, and iteration count.
 */
export function leastSquaresScalar(
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

  const polish = newtonScalar(fn, xBest, { ...options, maxIter: 20 });
  if (polish.success && polish.x != null) return { success: true, x: polish.x, iterations: iterations + polish.iterations };

  const bracket = findBracket(fn, window[0], window[1], 60);
  if (bracket) {
    const bis = bisection(fn, bracket[0], bracket[1], { ftol, xtol, maxIter: 80 });
    return { success: bis.success, x: bis.x, iterations: iterations + bis.iterations };
  }

  const fBest = fn(xBest);
  return { success: Number.isFinite(fBest) && Math.abs(fBest) <= Math.max(ftol * 10, 1e-6), x: xBest, iterations };
}

/**
 * Compute a safe squared residual value.
 *
 * @param v Input residual.
 * @returns `v^2` for finite values; `Infinity` for non-finite values.
 */
function sqSafe(v: number): number {
  if (!Number.isFinite(v)) return Number.POSITIVE_INFINITY;
  return v * v;
}

/**
 * Find a bracketing interval where the residual changes sign.
 *
 * @param fn Residual function.
 * @param lo Lower scan bound.
 * @param hi Upper scan bound.
 * @param n Number of scan points.
 * @returns Bracket `[a, b]` with sign change (or exact root endpoint), else `null`.
 */
function findBracket(fn: (x: number) => number, lo: number, hi: number, n = 50): [number, number] | null {
  const xs = linspace(lo, hi, n);
  let xPrev = xs[0];
  let fPrev = fn(xPrev);
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i];
    const fx = fn(x);
    if (!Number.isFinite(fPrev) || !Number.isFinite(fx)) {
      xPrev = x;
      fPrev = fx;
      continue;
    }
    if (fPrev === 0) return [xPrev, xPrev];
    if (fx === 0) return [x, x];
    if (Math.sign(fPrev) !== Math.sign(fx)) return [xPrev, x];
    xPrev = x;
    fPrev = fx;
  }
  return null;
}

/**
 * Solve a bracketed scalar equation using bisection.
 *
 * @param fn Residual function.
 * @param lo Lower bracket endpoint.
 * @param hi Upper bracket endpoint.
 * @param opts Bisection settings (`ftol`, `xtol`, `maxIter`).
 * @returns Scalar solve result containing success flag, root estimate, and iteration count.
 */
function bisection(fn: (x: number) => number, lo: number, hi: number, opts: { ftol: number; xtol: number; maxIter: number }): ScalarSolveResult {
  let a = lo;
  let b = hi;
  let fa = fn(a);
  const fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return { success: false, iterations: 1 };
  if (a === b) return { success: Math.abs(fa) <= opts.ftol, x: a, iterations: 1 };
  if (Math.sign(fa) === Math.sign(fb)) return { success: false, iterations: 1 };
  for (let i = 0; i < opts.maxIter; i++) {
    const c = 0.5 * (a + b);
    const fc = fn(c);
    if (!Number.isFinite(fc)) return { success: false, iterations: i + 1 };
    if (Math.abs(fc) <= opts.ftol || Math.abs(b - a) <= opts.xtol) return { success: true, x: c, iterations: i + 1 };
    if (Math.sign(fa) === Math.sign(fc)) {
      a = c;
      fa = fc;
    } else {
      b = c;
    }
  }
  return { success: false, x: 0.5 * (a + b), iterations: opts.maxIter };
}
