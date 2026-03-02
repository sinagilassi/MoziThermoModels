import { ThermoModelError } from "@/errors";

/**
 * Compute real roots of a cubic polynomial.
 *
 * Solves `ax^3 + bx^2 + cx + d = 0` through depressed-cubic reduction and
 * discriminant-based branching.
 *
 * @param a Cubic coefficient.
 * @param b Quadratic coefficient.
 * @param c Linear coefficient.
 * @param d Constant term.
 * @returns Array of real roots (one, two, or three values depending on discriminant).
 * @throws {ThermoModelError} If `a` is effectively zero.
 */
export function solveCubicRealRoots(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-30) throw new ThermoModelError("Leading cubic coefficient cannot be zero", "INVALID_CUBIC");
  const A = b / a;
  const B = c / a;
  const C = d / a;

  const p = B - (A * A) / 3;
  const q = (2 * A * A * A) / 27 - (A * B) / 3 + C;
  const discriminant = (q * q) / 4 + (p * p * p) / 27;

  if (discriminant > 1e-14) {
    const sqrtD = Math.sqrt(discriminant);
    const u = cbrtReal(-q / 2 + sqrtD);
    const v = cbrtReal(-q / 2 - sqrtD);
    return [u + v - A / 3];
  }
  if (Math.abs(discriminant) <= 1e-14) {
    const u = cbrtReal(-q / 2);
    return [2 * u - A / 3, -u - A / 3];
  }

  const r = Math.sqrt(-(p ** 3) / 27);
  const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
  const m = 2 * Math.sqrt(-p / 3);
  return [
    m * Math.cos(phi / 3) - A / 3,
    m * Math.cos((phi + 2 * Math.PI) / 3) - A / 3,
    m * Math.cos((phi + 4 * Math.PI) / 3) - A / 3
  ];
}

/**
 * Compute a real-valued cubic root while preserving sign for negative inputs.
 *
 * @param x Input value.
 * @returns Real cubic root of `x`.
 */
function cbrtReal(x: number): number {
  return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3);
}
