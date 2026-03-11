import { eosEqSolver, type EosEqSolverOptions } from "../../src/core/main";
import type { SolverMethod } from "../../src/types";

type CubicCase = {
    label: string;
    coeff: { A: number; B: number; C: number };
    expectedRealRoots: number[];
    tolerance?: number;
    note?: string;
};

type EosLikePhaseCase = {
    label: string;
    coeff: { A: number; B: number; C: number };
    expected: {
        liquidCount: number;
        vaporLiquidCount: number;
        vaporCount: number;
    };
    note?: string;
};

function hasApprox(values: number[], target: number, tol: number): boolean {
    return values.some((v) => Math.abs(v - target) <= tol);
}

function coeffFromRoots(r1: number, r2: number, r3: number): { A: number; B: number; C: number } {
    // (x - r1)(x - r2)(x - r3) = x^3 + A x^2 + B x + C
    return {
        A: -(r1 + r2 + r3),
        B: r1 * r2 + r1 * r3 + r2 * r3,
        C: -(r1 * r2 * r3)
    };
}

const solverOptionsByMethod: Record<SolverMethod, EosEqSolverOptions> = {
    root: { solver_method: "root" },
    qr: {
        solver_method: "qr",
        solver_options: {
            qr: {
                max_iter: 300,
                tol: 1e-12,
                polish_newton: true
            }
        }
    },
    ls: {
        solver_method: "ls",
        solver_options: {
            ls: {
                guessNo: 140,
                bounds: [-3, 3, -3],
                maxIter: 300,
                ftol: 1e-10,
                xtol: 1e-10
            }
        }
    },
    newton: {
        solver_method: "newton",
        solver_options: {
            newton: {
                guessNo: 140,
                bounds: [-3, 3, 0.5],
                maxIter: 350,
                ftol: 1e-11,
                xtol: 1e-11
            }
        }
    },
    fsolve: {
        solver_method: "fsolve",
        solver_options: {
            fsolve: {
                guessNo: 140,
                bounds: [-3, 3, 0.5],
                maxIter: 350,
                ftol: 1e-11,
                xtol: 1e-11
            }
        }
    }
};

const cubicCases: CubicCase[] = [
    {
        label: "three real roots (-1, 1, 2)",
        coeff: coeffFromRoots(-1, 1, 2),
        expectedRealRoots: [-1, 1, 2],
        tolerance: 1e-5,
        note: "Canonical regression polynomial used in tests."
    },
    {
        label: "triple root at +1",
        coeff: coeffFromRoots(1, 1, 1),
        expectedRealRoots: [1],
        tolerance: 5e-4,
        note: "Exercises deduplication for repeated roots."
    },
    {
        label: "EOS-like split roots (~0.034, ~0.931, -0.1)",
        coeff: coeffFromRoots(0.034, 0.931, -0.1),
        expectedRealRoots: [0.034, 0.931, -0.1],
        tolerance: 5e-3,
        note: "Similar to low/high positive root separation in EOS root selection."
    },
    {
        label: "single real root (x^3 + x + 1 = 0)",
        coeff: { A: 0, B: 1, C: 1 },
        expectedRealRoots: [-0.6823278038],
        tolerance: 1e-5,
        note: "Complex pair is ignored; only one real root should be found."
    }
];

function runOneCase(method: SolverMethod, poly: CubicCase): void {
    const opts = solverOptionsByMethod[method];
    const tol = poly.tolerance ?? 1e-5;
    const res = eosEqSolver(poly.coeff.A, poly.coeff.B, poly.coeff.C, opts);

    console.log(`\nCase: ${poly.label}`);
    if (poly.note) console.log(`Note: ${poly.note}`);
    console.log(`Method: ${method}`);
    console.log(`Coefficients [A,B,C]: [${poly.coeff.A}, ${poly.coeff.B}, ${poly.coeff.C}]`);
    const diagnosticSummary = (() => {
        if (!res.diagnostics) return undefined;
        const d = res.diagnostics as Record<string, unknown>;
        return {
            guessNo: d.guessNo,
            guessMin: d.guessMin,
            guessMax: d.guessMax,
            successCount: d.successCount,
            bracketSuccessCount: d.bracketSuccessCount,
            windowsCount: d.windowsCount,
            rootId: d.rootId,
            bounds: d.bounds,
            qr_options: d.qr_options
        };
    })();

    const rootsPreview = res.roots.slice(0, 12);
    const rootsTail = res.roots.length > rootsPreview.length ? ["..."] : [];

    console.log(
        JSON.stringify(
            {
                roots: [...rootsPreview, ...rootsTail],
                roots_count: res.roots.length,
                solver_method: res.solver_method,
                iterations: res.iterations,
                diagnostics: diagnosticSummary
            },
            null,
            2
        )
    );

    for (const expectedRoot of poly.expectedRealRoots) {
        if (!hasApprox(res.roots, expectedRoot, tol)) {
            throw new Error(
                `[${method}] ${poly.label}: missing root near ${expectedRoot} (tol=${tol}). roots_count=${res.roots.length}`
            );
        }
    }
}

function runLegacyOptionsComparison(): void {
    // Legacy flat options are still accepted and merged into iterative method settings.
    const res = eosEqSolver(-2, -1, 2, {
        solver_method: "ls",
        guessNo: 100,
        bounds: [-2, 3, 0.5],
        maxIter: 250,
        ftol: 1e-10,
        xtol: 1e-10
    });
    const d = (res.diagnostics ?? {}) as Record<string, unknown>;
    console.log("\nLegacy options compatibility (ls with flat options):");
    console.log(
        JSON.stringify(
            {
                roots: res.roots,
                roots_count: res.roots.length,
                solver_method: res.solver_method,
                iterations: res.iterations,
                diagnostics: {
                    guessNo: d.guessNo,
                    successCount: d.successCount,
                    bracketSuccessCount: d.bracketSuccessCount,
                    rootId: d.rootId,
                    bounds: d.bounds,
                    windowsCount: d.windowsCount
                }
            },
            null,
            2
        )
    );
}

function selectEosLikePhaseRoots(roots: number[]): { liquid: number[]; vaporLiquid: number[]; vapor: number[] } {
    const positiveRoots = roots
        .filter((r: number) => Number.isFinite(r) && r > 0)
        .sort((a: number, b: number) => a - b);
    if (!positiveRoots.length) return { liquid: [], vaporLiquid: [], vapor: [] };
    if (positiveRoots.length === 1) {
        return {
            liquid: [positiveRoots[0]],
            vaporLiquid: [positiveRoots[0]],
            vapor: [positiveRoots[0]]
        };
    }
    return {
        liquid: [positiveRoots[0]],
        vaporLiquid: [positiveRoots[0], positiveRoots[positiveRoots.length - 1]],
        vapor: [positiveRoots[positiveRoots.length - 1]]
    };
}

function eqString(A: number, B: number, C: number): string {
    return `Z^3 + (${A})Z^2 + (${B})Z + (${C}) = 0`;
}

function runEosLikePhaseSelectionEquations(): void {
    const eosLikeCases: EosLikePhaseCase[] = [
        {
            label: "liquid-dominant (single positive small root)",
            coeff: coeffFromRoots(-1.4, -0.2, 0.055),
            expected: { liquidCount: 1, vaporLiquidCount: 1, vaporCount: 1 },
            note: "Only one positive root is available, so all phase picks collapse to the same root."
        },
        {
            label: "vapor-liquid region (three positive roots)",
            coeff: coeffFromRoots(0.045, 0.31, 0.92),
            expected: { liquidCount: 1, vaporLiquidCount: 2, vaporCount: 1 },
            note: "EOS-style split: smallest root for liquid, min+max for vapor-liquid, largest for vapor."
        },
        {
            label: "vapor-dominant (single positive high root)",
            coeff: coeffFromRoots(-0.8, -0.12, 0.98),
            expected: { liquidCount: 1, vaporLiquidCount: 1, vaporCount: 1 },
            note: "Single positive large root represents vapor-like branch."
        }
    ];

    console.log("\n==================================================");
    console.log("EOS-like phase selection equations");
    console.log("==================================================");

    for (const c of eosLikeCases) {
        const run = eosEqSolver(c.coeff.A, c.coeff.B, c.coeff.C, { solver_method: "root" });
        const selected = selectEosLikePhaseRoots(run.roots);
        const counts = {
            liquidCount: selected.liquid.length,
            vaporLiquidCount: selected.vaporLiquid.length,
            vaporCount: selected.vapor.length
        };

        console.log(`\nCase: ${c.label}`);
        if (c.note) console.log(`Note: ${c.note}`);
        console.log(`Equation: ${eqString(c.coeff.A, c.coeff.B, c.coeff.C)}`);
        console.log(
            JSON.stringify(
                {
                    all_real_roots: run.roots,
                    positive_roots: run.roots
                        .filter((r: number) => r > 0)
                        .sort((a: number, b: number) => a - b),
                    selected
                },
                null,
                2
            )
        );

        if (
            counts.liquidCount !== c.expected.liquidCount ||
            counts.vaporLiquidCount !== c.expected.vaporLiquidCount ||
            counts.vaporCount !== c.expected.vaporCount
        ) {
            throw new Error(
                `[EOS-like] ${c.label}: unexpected phase root counts ${JSON.stringify(counts)} expected ${JSON.stringify(c.expected)}`
            );
        }
    }
}

for (const method of ["root", "qr", "ls", "newton", "fsolve"] as const) {
    console.log("\n==================================================");
    console.log(`Running solver method: ${method}`);
    console.log("==================================================");
    for (const poly of cubicCases) {
        runOneCase(method, poly);
    }
}

runLegacyOptionsComparison();
runEosLikePhaseSelectionEquations();
console.log("\nroots-exp-2 completed: all methods recovered expected real roots for every cubic case.");
