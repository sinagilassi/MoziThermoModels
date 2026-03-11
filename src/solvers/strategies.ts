import { solveCubicRealRoots } from "./cubic";
import { solveByCompanionQr } from "./companion-qr";
import { bracketRootsInWindow, fsolveLikeScalar, leastSquaresScalar, newtonScalar } from "./scalar";
import type { EosSolverOptions, MultiStartOptions, ScalarFunctionContext, SolverRunResult } from "./types";
import { buildRootSearchWindows, linspace, normalizeRootCandidates } from "./utils";
import type { SolverMethod } from "@/types";
import { ThermoModelError } from "@/errors";

type RootNormalizationOptions = {
  positiveOnly?: boolean;
  roundDecimals?: number;
  dedupeTol?: number;
};

export interface SolverFallbackChainOptions {
  order?: SolverMethod[];
  rootIdForLs?: number;
  solverOptions?: EosSolverOptions;
  normalizeOptions?: RootNormalizationOptions;
  target?: ScalarFunctionContext<[number, number, number, number]>;
}

/**
 * Solve a cubic polynomial using the analytic cubic solver and normalize the real roots.
 */
export function solveByPolynomialRoots(
  coeff: [number, number, number, number],
  normalizeOptions: RootNormalizationOptions = {}
): SolverRunResult {
  const roots = normalizeRootCandidates(
    solveCubicRealRoots(coeff[0], coeff[1], coeff[2], coeff[3]),
    normalizeOptions
  );
  return { roots, solver_method: "root" };
}

/**
 * Solve a cubic polynomial with companion-matrix QR and normalize roots.
 */
export function solveByQr(
  coeff: [number, number, number, number],
  normalizeOptions: RootNormalizationOptions = {},
  solverOptions: EosSolverOptions = {}
): SolverRunResult {
  return solveByCompanionQr(coeff, solverOptions.qr, normalizeOptions);
}

/**
 * Run Newton multi-start root finding over a fixed guess grid.
 */
export function solveByNewtonMultiStart<T>(
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {},
  normalizeOptions: RootNormalizationOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const guessMin = options.bounds?.[0] ?? 1e-5;
  const guessMax = options.bounds?.[1] ?? 2;
  const guesses = linspace(guessMin, guessMax, guessNo);
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
    roots: normalizeRootCandidates(roots, normalizeOptions),
    solver_method: "newton",
    iterations,
    diagnostics: { guessNo, guessMin, guessMax, successCount }
  };
}

/**
 * Run a hybrid fsolve-like multi-start solver.
 */
export function solveByFsolveLikeMultiStart<T>(
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {},
  normalizeOptions: RootNormalizationOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const guessMin = options.bounds?.[0] ?? 1e-5;
  const guessMax = options.bounds?.[1] ?? 2;
  const guesses = linspace(guessMin, guessMax, guessNo);
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
    roots: normalizeRootCandidates(roots, normalizeOptions),
    solver_method: "fsolve",
    iterations,
    diagnostics: { guessNo, guessMin, guessMax, successCount }
  };
}

/**
 * Run least-squares style multi-start root search within analysis windows.
 */
export function solveByLeastSquaresMultiStart<T>(
  rootId: number,
  target: ScalarFunctionContext<T>,
  options: MultiStartOptions = {},
  normalizeOptions: RootNormalizationOptions = {}
): SolverRunResult {
  const guessNo = options.guessNo ?? 50;
  const bounds = options.bounds ?? [-2, 5, 0.5] as [number, number, number];
  const windows = buildRootSearchWindows(rootId, guessNo, bounds);
  const roots: number[] = [];
  const candidateDiagnostics: Array<{ x: number; residual: number; source: "bracket" | "ls"; window: [number, number] }> = [];
  let iterations = 0;
  let successCount = 0;
  let bracketSuccessCount = 0;
  for (const item of windows) {
    const bracketed = bracketRootsInWindow((x) => target.fn(x, target.ctx), item.window, options);
    if (bracketed.length) {
      roots.push(...bracketed);
      bracketSuccessCount += bracketed.length;
      for (const x of bracketed) {
        candidateDiagnostics.push({
          x,
          residual: Math.abs(target.fn(x, target.ctx)),
          source: "bracket",
          window: item.window
        });
      }
    }
    const res = leastSquaresScalar((x) => target.fn(x, target.ctx), item.guess, item.window, options);
    iterations += res.iterations;
    if (res.success && res.x != null) {
      roots.push(res.x);
      successCount += 1;
      candidateDiagnostics.push({
        x: res.x,
        residual: Math.abs(target.fn(res.x, target.ctx)),
        source: "ls",
        window: item.window
      });
    }
  }

  return {
    roots: normalizeRootCandidates(roots, normalizeOptions),
    solver_method: "ls",
    iterations,
    diagnostics: {
      guessNo,
      successCount,
      bracketSuccessCount,
      rootId,
      bounds,
      windowsCount: windows.length,
      candidates: candidateDiagnostics
    }
  };
}

/**
 * Solve a cubic with ordered fallback strategies.
 *
 * Default order: root -> qr -> ls -> newton -> fsolve.
 * A method is considered failed when it throws or yields no finite roots.
 */
export function solveByFallbackChain(
  coeff: [number, number, number, number],
  options: SolverFallbackChainOptions = {}
): SolverRunResult {
  const order = options.order ?? ["root", "qr", "ls", "newton", "fsolve"];
  if (!order.length) {
    throw new ThermoModelError("Fallback chain requires at least one solver method", "INVALID_SOLVER_METHOD");
  }

  const normalizeOptions = options.normalizeOptions ?? {};
  const solverOptions = options.solverOptions ?? {};
  const rootIdForLs = options.rootIdForLs ?? 4;
  const target = options.target ?? {
    fn: (x: number, ctx: [number, number, number, number]) => (((ctx[0] * x + ctx[1]) * x + ctx[2]) * x + ctx[3]),
    ctx: coeff
  };

  const attempts: Array<{ method: SolverMethod; ok: boolean; reason?: string }> = [];

  for (const method of order) {
    try {
      let run: SolverRunResult;
      if (method === "root") run = solveByPolynomialRoots(coeff, normalizeOptions);
      else if (method === "qr") run = solveByQr(coeff, normalizeOptions, solverOptions);
      else if (method === "ls") run = solveByLeastSquaresMultiStart(rootIdForLs, target, solverOptions.ls ?? {}, normalizeOptions);
      else if (method === "newton") run = solveByNewtonMultiStart(target, solverOptions.newton ?? {}, normalizeOptions);
      else run = solveByFsolveLikeMultiStart(target, solverOptions.fsolve ?? {}, normalizeOptions);

      const ok = run.roots.length > 0 && run.roots.every((z) => Number.isFinite(z));
      attempts.push({ method, ok, reason: ok ? undefined : "no valid finite roots" });
      if (ok) {
        return {
          ...run,
          diagnostics: {
            ...(run.diagnostics ?? {}),
            fallback: { order, selected: method, attempts }
          }
        };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      attempts.push({ method, ok: false, reason });
    }
  }

  throw new ThermoModelError(
    `All fallback solver methods failed. attempts=${JSON.stringify(attempts)}`,
    "EOS_ROOTS_NOT_FOUND"
  );
}
