import { ThermoModelError } from "../errors";

export type UnifacGroupInfo = {
  name?: string;
  main_group?: number | string;
  mainGroup?: number | string;
  R?: number;
  Q?: number;
  r?: number;
  q?: number;
};

export type UnifacGroupData = Record<string, UnifacGroupInfo>;
export type UnifacInteractionCell = number | { a_ij?: number; Aij?: number; value?: number };
export type UnifacInteractionData = Record<string, Record<string, UnifacInteractionCell>>;
export type UnifacComponentGroupCounts = Record<string, number>;

type ComponentCalcData = {
  component: string;
  counts: UnifacComponentGroupCounts;
  r: number;
  q: number;
};

export class UNIFAC1 {
  readonly group_data: UnifacGroupData;
  readonly interaction_data: UnifacInteractionData;
  readonly eps: number;
  readonly z: number;
  group_ids: Record<string, string> = {};
  component_group_data: ComponentCalcData[] = [];
  num_comps = 0;
  private _componentOrder: string[] = [];

  constructor(group_data: UnifacGroupData, interaction_data: UnifacInteractionData, kwargs: { eps?: number; z?: number } = {}) {
    this.group_data = group_data ?? {};
    this.interaction_data = interaction_data ?? {};
    this.eps = Number(kwargs.eps ?? 1e-30);
    this.z = Number(kwargs.z ?? 10);
  }

  initialize_calc(componentGroups: Record<string, UnifacComponentGroupCounts>, comp?: string[]) {
    const names = comp ?? Object.keys(componentGroups ?? {});
    if (!names.length) throw new ThermoModelError("UNIFAC initialize_calc requires components", "INVALID_ACTIVITY_INPUT");

    this._componentOrder = [...names];
    this.component_group_data = names.map((name) => {
      const counts = componentGroups[name];
      if (!counts || typeof counts !== "object") {
        throw new ThermoModelError(`Missing UNIFAC group counts for ${name}`, "INVALID_ACTIVITY_INPUT");
      }
      let r = 0;
      let q = 0;
      for (const [gid, countRaw] of Object.entries(counts)) {
        const count = Number(countRaw ?? 0);
        const g = this.group_data[gid];
        if (!g) throw new ThermoModelError(`Missing UNIFAC group data for ${gid}`, "INVALID_ACTIVITY_INPUT");
        const R = Number(g.R ?? g.r ?? 0);
        const Q = Number(g.Q ?? g.q ?? 0);
        r += count * R;
        q += count * Q;
      }
      return { component: name, counts: { ...counts }, r, q };
    });
    this.num_comps = this.component_group_data.length;
    return this.component_group_data;
  }

  calc_combinatorial(x: number[]): number[] {
    if (!this.num_comps) throw new ThermoModelError("UNIFAC1 not initialized", "INVALID_ACTIVITY_INPUT");
    if (x.length !== this.num_comps) throw new ThermoModelError("Mole fraction length mismatch", "INVALID_ACTIVITY_INPUT");

    const r = this.component_group_data.map((c) => c.r);
    const q = this.component_group_data.map((c) => c.q);
    const sumRx = x.reduce((s, xi, i) => s + xi * r[i], 0);
    const sumQx = x.reduce((s, xi, i) => s + xi * q[i], 0);
    const phi = x.map((xi, i) => (xi * r[i]) / Math.max(sumRx, this.eps));
    const theta = x.map((xi, i) => (xi * q[i]) / Math.max(sumQx, this.eps));
    const l = r.map((ri, i) => (this.z / 2) * (ri - q[i]) - (ri - 1));
    const sumXl = x.reduce((s, xi, i) => s + xi * l[i], 0);

    return x.map((xi, i) =>
      Math.log(Math.max(phi[i] / Math.max(xi, this.eps), this.eps)) +
      (this.z / 2) * q[i] * Math.log(Math.max(theta[i] / Math.max(phi[i], this.eps), this.eps)) +
      l[i] - (phi[i] / Math.max(xi, this.eps)) * sumXl
    );
  }

  _get_psi(T: number): number[][] {
    const keys = Object.keys(this.group_data);
    return keys.map((g1) =>
      keys.map((g2) => {
        const v = this.interaction_data[g1]?.[g2];
        const a = typeof v === "number" ? v : Number(v?.a_ij ?? v?.Aij ?? v?.value ?? 0);
        return Math.exp(-a / Math.max(T, this.eps));
      })
    );
  }

  _ln_gamma_group(nu_vector: number[], Psi: number[][]): number[] {
    const m = nu_vector.length;
    const total = nu_vector.reduce((s, v) => s + v, 0);
    if (!(total > 0)) return Array.from({ length: m }, () => 0);
    const X = nu_vector.map((v) => v / total);

    const qGroup = Object.keys(this.group_data).map((gid) => Number(this.group_data[gid]?.Q ?? this.group_data[gid]?.q ?? 0));
    const denomTheta = X.reduce((s, xi, i) => s + xi * qGroup[i], 0);
    const Theta = X.map((xi, i) => (xi * qGroup[i]) / Math.max(denomTheta, this.eps));

    return Array.from({ length: m }, (_, k) => {
      const sum1 = Theta.reduce((s, thm, mIdx) => s + thm * (Psi[mIdx]?.[k] ?? 0), 0);
      let sum2 = 0;
      for (let mIdx = 0; mIdx < m; mIdx++) {
        const den = Theta.reduce((s, thn, nIdx) => s + thn * (Psi[nIdx]?.[mIdx] ?? 0), 0);
        sum2 += (Theta[mIdx] * (Psi[k]?.[mIdx] ?? 0)) / Math.max(den, this.eps);
      }
      return qGroup[k] * (1 - Math.log(Math.max(sum1, this.eps)) - sum2);
    });
  }

  calc_residual(x: number[], T: number): number[] {
    if (!this.num_comps) throw new ThermoModelError("UNIFAC1 not initialized", "INVALID_ACTIVITY_INPUT");
    const groupKeys = Object.keys(this.group_data);
    const Psi = this._get_psi(T);

    const nuComp = this.component_group_data.map((row) => groupKeys.map((gid) => Number(row.counts[gid] ?? 0)));
    const nuMix = Array.from({ length: groupKeys.length }, (_, g) => x.reduce((s, xi, i) => s + xi * nuComp[i][g], 0));
    const lnGammaGroupMix = this._ln_gamma_group(nuMix, Psi);

    return this.component_group_data.map((_, i) => {
      const lnGammaGroupComp = this._ln_gamma_group(nuComp[i], Psi);
      return groupKeys.reduce((s, gid, g) => s + Number(this.component_group_data[i].counts[gid] ?? 0) * (lnGammaGroupMix[g] - lnGammaGroupComp[g]), 0);
    });
  }

  get_activity_coefficients(T: number, x: number[], comp: string[]) {
    if (!this.num_comps) throw new ThermoModelError("num_comps not initialized", "INVALID_ACTIVITY_INPUT");
    if (x.length !== this.num_comps) throw new ThermoModelError("Mole fraction length mismatch", "INVALID_ACTIVITY_INPUT");
    const ln_c = this.calc_combinatorial(x);
    const ln_r = this.calc_residual(x, T);
    const AcCo_i = ln_c.map((c, i) => Math.exp(c + ln_r[i]));
    const AcCo_i_comp = Object.fromEntries(comp.map((c, i) => [c, Number(AcCo_i[i])]));
    const x_comp = Object.fromEntries(comp.map((c, i) => [c, Number(x[i])]));
    return [
      {
        property_name: "Activity Coefficient",
        components: [...comp],
        mole_fraction: x_comp,
        value: AcCo_i_comp,
        unit: "dimensionless",
        symbol: "AcCo_i",
        message: "Calculating activity coefficient using UNIFAC model"
      },
      {
        AcCo_i_comp,
        x_comp,
        ln_gamma_C: ln_c,
        ln_gamma_R: ln_r,
        calculation_mode: "UNIFAC"
      }
    ] as const;
  }
}
