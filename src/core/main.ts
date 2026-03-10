import { ThermoModelError } from "@/errors";
import {
    solveByFsolveLikeMultiStart,
    solveByLeastSquaresMultiStart,
    solveByNewtonMultiStart,
    solveByPolynomialRoots,
    type MultiStartOptions,
    type SolverRunResult
} from "@/solvers";
import type { SolverMethod } from "@/types";

export interface EosEqSolverOptions extends MultiStartOptions {
    solver_method?: SolverMethod;
    guessNo?: number;
    bounds?: [number, number, number];
    maxIter?: number;
    ftol?: number;
    xtol?: number;
}

export function eosEqSolver(A: number, B: number, C: number, solverOptions: EosEqSolverOptions = {}): SolverRunResult {
    const { solver_method, ...multiStartOptions } = solverOptions;
    const method = solver_method ?? "root";
    const coeff: [number, number, number, number] = [1, A, B, C];
    const normalizer = { positiveOnly: false };

    if (method === "root") {
        return solveByPolynomialRoots(coeff, normalizer);
    }

    const sharedTarget = {
        fn: (x: number, ctx: [number, number, number, number]) => (((ctx[0] * x + ctx[1]) * x + ctx[2]) * x + ctx[3]),
        ctx: coeff
    };

    if (method === "ls") {
        return solveByLeastSquaresMultiStart(4, sharedTarget, multiStartOptions, normalizer);
    }

    const iterOptions: MultiStartOptions = {
        ...multiStartOptions,
        bounds: multiStartOptions.bounds ?? [-2, 5, 0.5]
    };
    if (method === "newton") {
        return solveByNewtonMultiStart(sharedTarget, iterOptions, normalizer);
    }
    if (method === "fsolve") {
        return solveByFsolveLikeMultiStart(sharedTarget, iterOptions, normalizer);
    }

    throw new ThermoModelError(`Invalid solver_method: ${String(method)}`, "INVALID_SOLVER_METHOD");
}
