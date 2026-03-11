import type { SolverMethod } from "@/types";

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

export interface QrSolverOptions {
  max_iter?: number;
  tol?: number;
  polish_newton?: boolean;
}

export interface EosSolverOptions {
  ls?: MultiStartOptions;
  newton?: MultiStartOptions;
  fsolve?: MultiStartOptions;
  qr?: QrSolverOptions;
}

export interface SolverRunResult {
  roots: number[];
  solver_method: SolverMethod;
  iterations?: number;
  diagnostics?: Record<string, unknown>;
}

export type ScalarSolveResult = { success: boolean; x?: number; iterations: number };
