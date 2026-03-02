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

export interface SolverRunResult {
  roots: number[];
  solver_method: SolverMethod;
  iterations?: number;
  diagnostics?: Record<string, unknown>;
}

export type ScalarSolveResult = { success: boolean; x?: number; iterations: number };
