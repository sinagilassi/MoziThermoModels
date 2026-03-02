export type { MultiStartOptions, ScalarFunctionContext, SolverRunResult } from "./types";

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

export {
  solveByFsolveLikeMultiStart,
  solveByLeastSquaresMultiStart,
  solveByNewtonMultiStart,
  solveByPolynomialRoots
} from "./strategies";
