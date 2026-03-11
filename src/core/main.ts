import { ThermoModelError } from "@/errors";
import {
    solveByFsolveLikeMultiStart,
    solveByLeastSquaresMultiStart,
    solveByNewtonMultiStart,
    solveByPolynomialRoots,
    solveByQr,
    type MultiStartOptions,
    type EosSolverOptions,
    type SolverRunResult
} from "@/solvers";
import type { SolverMethod } from "@/types";

export interface EosEqSolverOptions {
    solver_method?: SolverMethod;
    solver_options?: EosSolverOptions;
    // Legacy options retained for input compatibility; ignored by unified QR path.
    guessNo?: number;
    bounds?: [number, number, number];
    maxIter?: number;
    ftol?: number;
    xtol?: number;
}

export function eosEqSolver(A: number, B: number, C: number, solverOptions: EosEqSolverOptions = {}): SolverRunResult {
    const { solver_method, solver_options, ...legacyOptions } = solverOptions;
    const method = solver_method ?? "root";
    const coeff: [number, number, number, number] = [1, A, B, C];
    const normalizer = { positiveOnly: false };

    if (!["ls", "root", "fsolve", "newton", "qr"].includes(method)) {
        throw new ThermoModelError(`Invalid solver_method: ${String(method)}`, "INVALID_SOLVER_METHOD");
    }

    if (method === "root") return solveByPolynomialRoots(coeff, normalizer);
    if (method === "qr") return solveByQr(coeff, normalizer, solver_options ?? {});

    const sharedTarget = {
        fn: (x: number, ctx: [number, number, number, number]) => (((ctx[0] * x + ctx[1]) * x + ctx[2]) * x + ctx[3]),
        ctx: coeff
    };

    const merged = (nested?: MultiStartOptions): MultiStartOptions => ({
        guessNo: nested?.guessNo ?? legacyOptions.guessNo,
        bounds: nested?.bounds ?? legacyOptions.bounds,
        maxIter: nested?.maxIter ?? legacyOptions.maxIter,
        ftol: nested?.ftol ?? legacyOptions.ftol,
        xtol: nested?.xtol ?? legacyOptions.xtol
    });

    if (method === "ls") return solveByLeastSquaresMultiStart(4, sharedTarget, merged(solver_options?.ls as MultiStartOptions | undefined), normalizer);
    if (method === "newton") return solveByNewtonMultiStart(sharedTarget, merged(solver_options?.newton as MultiStartOptions | undefined), normalizer);
    return solveByFsolveLikeMultiStart(sharedTarget, merged(solver_options?.fsolve as MultiStartOptions | undefined), normalizer);
}
