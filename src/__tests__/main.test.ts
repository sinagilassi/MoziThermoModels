import { describe, expect, it } from "vitest";
import { eosEqSolver } from "../core/main";

function expectRootClose(actualRoots: number[], expectedRoot: number, tol = 1e-5) {
  const found = actualRoots.some((r) => Math.abs(r - expectedRoot) <= tol);
  expect(found).toBe(true);
}

describe("eosEqSolver", () => {
  it("returns all real roots including negative values with root solver", () => {
    const res = eosEqSolver(-2, -1, 2, { solver_method: "root" });
    expect(res.solver_method).toBe("root");
    expect(res.roots.length).toBe(3);
    expectRootClose(res.roots, -1);
    expectRootClose(res.roots, 1);
    expectRootClose(res.roots, 2);
  });

  it("defaults to root solver when solver_method is omitted", () => {
    const res = eosEqSolver(-2, -1, 2);
    expect(res.solver_method).toBe("root");
    expectRootClose(res.roots, -1);
    expectRootClose(res.roots, 1);
    expectRootClose(res.roots, 2);
  });

  it("supports all iterative solvers and can find negative roots", () => {
    const commonOptions = {
      guessNo: 80,
      bounds: [-2, 3, 0.5] as [number, number, number],
      maxIter: 200,
      ftol: 1e-9,
      xtol: 1e-9
    };

    const ls = eosEqSolver(-2, -1, 2, { ...commonOptions, solver_method: "ls" });
    const newton = eosEqSolver(-2, -1, 2, { ...commonOptions, solver_method: "newton" });
    const fsolve = eosEqSolver(-2, -1, 2, { ...commonOptions, solver_method: "fsolve" });

    for (const run of [ls, newton, fsolve]) {
      expect(run.roots.every((r) => Number.isFinite(r))).toBe(true);
      expect(run.roots.some((r) => r < 0)).toBe(true);
      expect(run.roots.some((r) => r > 0)).toBe(true);
    }
  });

  it("throws INVALID_SOLVER_METHOD for unknown methods", () => {
    expect(() => eosEqSolver(-2, -1, 2, { solver_method: "bad" as any })).toThrow("Invalid solver_method");
  });

  it("returns single repeated root for cubic with triple root", () => {
    const res = eosEqSolver(-3, 3, -1, {
      solver_method: "newton"
    });
    expect(res.roots.length).toBe(1);
    expectRootClose(res.roots, 1, 1e-4);
  });

  it("supports qr solver options override", () => {
    const res = eosEqSolver(-2, -1, 2, {
      solver_method: "qr",
      solver_options: {
        qr: { max_iter: 200, tol: 1e-10, polish_newton: true }
      }
    });
    expect(res.solver_method).toBe("qr");
    expectRootClose(res.roots, -1);
    expectRootClose(res.roots, 1);
    expectRootClose(res.roots, 2);
  });

  it("ls uses default guessNo=50 when unspecified", () => {
    const res = eosEqSolver(-2, -1, 2, { solver_method: "ls" });
    const guessNo = (res.diagnostics as any)?.guessNo;
    expect(guessNo).toBe(50);
  });

  it("ls root selection can recover both low/high positive roots for rootId=1 region split", () => {
    // Roots are approximately: 0.034, 0.931, -0.1
    const r1 = 0.034;
    const r2 = 0.931;
    const r3 = -0.1;
    const A = -(r1 + r2 + r3);
    const B = r1 * r2 + r1 * r3 + r2 * r3;
    const C = -(r1 * r2 * r3);
    const run = eosEqSolver(A, B, C, {
      solver_method: "ls",
      solver_options: {
        ls: {
          guessNo: 120,
          bounds: [-2, 3, 0.5],
          maxIter: 250,
          ftol: 1e-10,
          xtol: 1e-10
        }
      }
    });
    expect(run.solver_method).toBe("ls");
    expect(run.roots.some((z) => Math.abs(z - 0.034) < 5e-3)).toBe(true);
    expect(run.roots.some((z) => Math.abs(z - 0.931) < 5e-3)).toBe(true);
  });
});

