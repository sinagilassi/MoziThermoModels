export type { EosSolverOptions, MultiStartOptions, QrSolverOptions, ScalarFunctionContext, SolverRunResult } from "./types";

export {
  buildRootSearchWindows,
  clamp,
  dedupeSorted,
  isFinitePositive,
  linspace,
  normalizeRootCandidates,
  numericalDerivative,
  roundTo,
  selectRootsByAnalysis
} from "./utils";

export { solveCubicRealRoots } from "./cubic";
export { solveByCompanionQr } from "./companion-qr";

export {
  solveByFsolveLikeMultiStart,
  solveByLeastSquaresMultiStart,
  solveByNewtonMultiStart,
  solveByPolynomialRoots,
  solveByQr
} from "./strategies";
