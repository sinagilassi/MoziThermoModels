import { solveCubicRealRoots } from "./cubic";
import { fsolveLikeScalar, leastSquaresScalar, newtonScalar } from "./scalar";
import type { MultiStartOptions, ScalarFunctionContext, SolverRunResult } from "./types";
import { buildRootSearchWindows, linspace, normalizeRootCandidates } from "./utils";

/**
 * Solve a cubic polynomial using the analytic cubic solver and normalize the real roots.
 *
 * @param coeff Polynomial coefficients as `[a, b, c, d]` for `ax^3 + bx^2 + cx + d = 0`.
 * @returns Solver run result with method set to `"root"`.
 */
export function solveByPolynomialRoots(coeff: [number, number, number, number]): SolverRunResult {
  const roots = normalizeRootCandidates(solveCubicRealRoots(coeff[0], coeff[1], coeff[2], coeff[3]));
  return { roots, solver_method: "root" };
}

/**
 * Run Newton multi-start root finding over a fixed guess grid.
 *
 * @typeParam T Context object type passed into `target.fn`.
 * @param target Function context containing residual function and immutable context.
 * @param options Multi-start and convergence options.
 * @returns Aggregated solver result with normalized roots and diagnostics.
 */
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

/**
 * Run a hybrid fsolve-like multi-start solver.
 *
 * Uses derivative-based updates when stable and secant fallback otherwise.
 *
 * @typeParam T Context object type passed into `target.fn`.
 * @param target Function context containing residual function and immutable context.
 * @param options Multi-start and convergence options.
 * @returns Aggregated solver result with normalized roots and diagnostics.
 */
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

/**
 * Run least-squares style multi-start root search within analysis windows.
 *
 * @typeParam T Context object type passed into `target.fn`.
 * @param rootId Root-analysis selector used to define search windows.
 * @param target Function context containing residual function and immutable context.
 * @param options Multi-start and convergence options.
 * @returns Aggregated solver result with normalized roots and diagnostics.
 */
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
