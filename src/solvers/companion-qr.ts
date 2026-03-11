import type { QrSolverOptions, SolverRunResult } from "./types";
import { normalizeRootCandidates } from "./utils";

type RootNormalizationOptions = {
  positiveOnly?: boolean;
  roundDecimals?: number;
  dedupeTol?: number;
};

type Complex = { re: number; im: number };

const C = (re: number, im = 0): Complex => ({ re, im });

const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new Error("Complex division by zero");
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cabs = (a: Complex): number => Math.sqrt(a.re * a.re + a.im * a.im);

function evalMonicCubic(z: Complex, A: number, B: number, C0: number): Complex {
  return cadd(cmul(cadd(cmul(cadd(cmul(C(1), z), C(A)), z), C(B)), z), C(C0));
}

function evalMonicCubicPrime(z: Complex, A: number, B: number): Complex {
  return cadd(cmul(cadd(cmul(C(3), z), C(2 * A)), z), C(B));
}

function solveQuadraticEigenvalues(a: number, b: number, c: number, d: number): [Complex, Complex] {
  const tr = a + d;
  const disc = (a - d) * (a - d) + 4 * b * c;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [C((tr + s) / 2), C((tr - s) / 2)];
  }
  const s = Math.sqrt(-disc);
  return [C(tr / 2, s / 2), C(tr / 2, -s / 2)];
}

function qrCompanionMonicRoots(A: number, B: number, C0: number, options: QrSolverOptions = {}): { roots: Complex[]; iterations: number } {
  const maxIter = options.max_iter ?? 300;
  const tol = options.tol ?? 1e-12;
  const polishNewton = options.polish_newton ?? true;

  // Fast path for pure cubic x^3 + C0 = 0. One real root + a complex pair.
  if (Math.abs(A) < 1e-14 && Math.abs(B) < 1e-14) {
    const r = Math.cbrt(-C0);
    const raw = [C(r), C(-r / 2, (Math.sqrt(3) / 2) * r), C(-r / 2, -(Math.sqrt(3) / 2) * r)];
    if (!polishNewton) return { roots: raw, iterations: 0 };
    const polished = raw.map((z) => {
      const fz = evalMonicCubic(z, A, B, C0);
      const dfz = evalMonicCubicPrime(z, A, B);
      if (cabs(dfz) < 1e-20) return z;
      return csub(z, cdiv(fz, dfz));
    });
    return { roots: polished, iterations: 0 };
  }

  const H = new Float64Array([
    0, 0, -C0,
    1, 0, -B,
    0, 1, -A
  ]);

  const get = (i: number, j: number) => H[i * 3 + j];
  const set = (i: number, j: number, v: number) => { H[i * 3 + j] = v; };

  const gLeft = (p: number, q: number, c: number, s: number) => {
    for (let j = 0; j < 3; j++) {
      const a = get(p, j);
      const b = get(q, j);
      set(p, j, c * a + s * b);
      set(q, j, -s * a + c * b);
    }
  };

  const gRight = (p: number, q: number, c: number, s: number) => {
    for (let i = 0; i < 3; i++) {
      const a = get(i, p);
      const b = get(i, q);
      set(i, p, c * a + s * b);
      set(i, q, -s * a + c * b);
    }
  };

  const francisStep = () => {
    const h00 = get(0, 0);
    const h01 = get(0, 1);
    const h10 = get(1, 0);
    const h11 = get(1, 1);
    const h12 = get(1, 2);
    const h21 = get(2, 1);
    const h22 = get(2, 2);

    const sigma = h11 + h22;
    const mu = h11 * h22 - h12 * h21;

    const x = h00 * h00 + h01 * h10 - sigma * h00 + mu;
    const y = h10 * (h00 + h11) - sigma * h10;
    const z = h21 * h10;

    const norm = Math.sqrt(x * x + y * y + z * z);
    if (norm < 1e-20) return;

    const v0 = x - norm;
    const v1 = y;
    const v2 = z;
    const vv = v0 * v0 + v1 * v1 + v2 * v2;
    if (vv < 1e-40) return;
    const tau = 2 / vv;

    for (let j = 0; j < 3; j++) {
      const dot = v0 * get(0, j) + v1 * get(1, j) + v2 * get(2, j);
      set(0, j, get(0, j) - tau * dot * v0);
      set(1, j, get(1, j) - tau * dot * v1);
      set(2, j, get(2, j) - tau * dot * v2);
    }
    for (let i = 0; i < 3; i++) {
      const dot = v0 * get(i, 0) + v1 * get(i, 1) + v2 * get(i, 2);
      set(i, 0, get(i, 0) - tau * dot * v0);
      set(i, 1, get(i, 1) - tau * dot * v1);
      set(i, 2, get(i, 2) - tau * dot * v2);
    }

    const a = get(1, 0);
    const b = get(2, 0);
    const rg = Math.sqrt(a * a + b * b);
    if (rg > 1e-20) {
      const c = a / rg;
      const sg = b / rg;
      gLeft(1, 2, c, sg);
      gRight(1, 2, c, sg);
      set(2, 0, 0);
    }
  };

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const h00 = get(0, 0);
    const h11 = get(1, 1);
    const h22 = get(2, 2);
    const h10 = get(1, 0);
    const h21 = get(2, 1);

    if (Math.abs(h21) < tol * (Math.abs(h11) + Math.abs(h22))) break;
    if (Math.abs(h10) < tol * (Math.abs(h00) + Math.abs(h11))) {
      set(1, 0, 0);
      break;
    }
    francisStep();
  }

  const h00 = get(0, 0);
  const h01 = get(0, 1);
  const h10 = get(1, 0);
  const h11 = get(1, 1);
  const h12 = get(1, 2);
  const h21 = get(2, 1);
  const h22 = get(2, 2);

  let rawRoots: Complex[];
  if (Math.abs(h21) < tol * (Math.abs(h11) + Math.abs(h22))) {
    const [e1, e2] = solveQuadraticEigenvalues(h00, h01, h10, h11);
    rawRoots = [e1, e2, C(h22)];
  } else {
    const [e2, e3] = solveQuadraticEigenvalues(h11, h12, h21, h22);
    rawRoots = [C(h00), e2, e3];
  }

  if (!polishNewton) return { roots: rawRoots, iterations };

  const polished = rawRoots.map((z) => {
    const fz = evalMonicCubic(z, A, B, C0);
    const dfz = evalMonicCubicPrime(z, A, B);
    if (cabs(dfz) < 1e-20) return z;
    return csub(z, cdiv(fz, dfz));
  });
  return { roots: polished, iterations };
}

/**
 * Solve cubic polynomial `ax^3 + bx^2 + cx + d = 0` with companion-matrix QR.
 */
export function solveByCompanionQr(
  coeff: [number, number, number, number],
  qrOptions: QrSolverOptions = {},
  normalizeOptions: RootNormalizationOptions = {}
): SolverRunResult {
  const [a, b, c, d] = coeff;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d) || Math.abs(a) < 1e-30) {
    return {
      roots: [],
      solver_method: "qr",
      diagnostics: { reason: "invalid_coefficients" }
    };
  }

  const A = b / a;
  const B = c / a;
  const C0 = d / a;
  const solved = qrCompanionMonicRoots(A, B, C0, qrOptions);
  const imagTol = Math.max(1e-10, (qrOptions.tol ?? 1e-12) * 100);
  const realRoots = solved.roots.filter((r) => Math.abs(r.im) <= imagTol).map((r) => r.re);

  return {
    roots: normalizeRootCandidates(realRoots, normalizeOptions),
    solver_method: "qr",
    iterations: solved.iterations,
    diagnostics: {
      qr_options: {
        max_iter: qrOptions.max_iter ?? 300,
        tol: qrOptions.tol ?? 1e-12,
        polish_newton: qrOptions.polish_newton ?? true
      }
    }
  };
}

