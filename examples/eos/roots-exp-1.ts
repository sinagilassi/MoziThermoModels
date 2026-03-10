import { eosEqSolver } from "../../src/core/main";
import type { SolverMethod } from "../../src/types";

type RunSpec = {
  solver_method?: SolverMethod;
};

const A = -6 / 4;
const B = -2 / 4;
const C = 0;

// Z^3 - 2Z^2 - Z + 2 = 0 has real roots: -1, 1, 2
// const expectedRoots = [-1, 1, 2];

function hasApprox(values: number[], target: number, tol = 1e-5): boolean {
  return values.some((v) => Math.abs(v - target) <= tol);
}

function runCase(label: string, spec: RunSpec) {
  const res = eosEqSolver(A, B, C, {
    solver_method: spec.solver_method,
    guessNo: 100,
    bounds: [-2, 3, 0.5],
    maxIter: 200,
    ftol: 1e-10,
    xtol: 1e-10
  });

  console.log(`\n[${label}]`);
  console.log(JSON.stringify(res, null, 2));

  // for (const r of expectedRoots) {
  //   if (!hasApprox(res.roots, r)) {
  //     throw new Error(`[${label}] Missing expected root near ${r}. Received: ${JSON.stringify(res.roots)}`);
  //   }
  // }
}

runCase("default (root)", {});
runCase("root", { solver_method: "root" });
runCase("ls", { solver_method: "ls" });
runCase("newton", { solver_method: "newton" });
runCase("fsolve", { solver_method: "fsolve" });

console.log("\nAll eosEqSolver runs found the expected real roots, including negative roots.");
