import { ThermoModelError } from "../errors";
import type { ActivityCoefficientResult } from "../types";

export type UnifacGroupInfo = {
  name?: string;
  groupId?: string;
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
  eps: number;
  z: number;
  group_ids: Record<string, string> = {};
  component_group_data: ComponentCalcData[] = [];
  num_comps = 0;
  num_groups = 0;
  sorted_subgroups: string[] = [];
  g_map: Record<string, number> = {};
  Q_k: number[] = [];
  main_groups: string[] = [];
  nu: number[][] = [];

  constructor(group_data: UnifacGroupData, interaction_data: UnifacInteractionData, kwargs: { eps?: number; z?: number } = {}) {
    this.group_data = group_data ?? {};
    this.interaction_data = interaction_data ?? {};
    this.eps = Number(kwargs.eps ?? 1e-30);
    this.z = Number(kwargs.z ?? 10);
    this.group_ids = this.buildGroupIds();
  }

  initialize_calc(componentGroups: Record<string, UnifacComponentGroupCounts>, comp?: string[]) {
    const names = comp ?? Object.keys(componentGroups ?? {});
    if (!names.length) throw new ThermoModelError("UNIFAC initialize_calc requires components", "INVALID_ACTIVITY_INPUT");

    this.component_group_data = names.map((name) => {
      const counts = componentGroups[name];
      if (!counts || typeof counts !== "object") {
        throw new ThermoModelError(`Missing UNIFAC group counts for ${name}`, "INVALID_ACTIVITY_INPUT");
      }
      const resolvedCounts: UnifacComponentGroupCounts = {};
      let r = 0;
      let q = 0;
      for (const [gid, countRaw] of Object.entries(counts)) {
        const count = Number(countRaw ?? 0);
        const resolvedGid = this.resolveGroupId(gid);
        if (!resolvedGid) throw new ThermoModelError(`Missing UNIFAC group data for ${gid}`, "INVALID_ACTIVITY_INPUT");
        const g = this.group_data[resolvedGid];
        if (!g) throw new ThermoModelError(`Missing UNIFAC group data for ${gid}`, "INVALID_ACTIVITY_INPUT");
        const R = Number(g.R ?? g.r ?? 0);
        const Q = Number(g.Q ?? g.q ?? 0);
        resolvedCounts[resolvedGid] = (resolvedCounts[resolvedGid] ?? 0) + count;
        r += count * R;
        q += count * Q;
      }
      return { component: name, counts: resolvedCounts, r, q };
    });

    const uniqueGroups = new Set<string>();
    for (const row of this.component_group_data) {
      Object.keys(row.counts).forEach((gid) => uniqueGroups.add(String(gid)));
    }
    this.sorted_subgroups = [...uniqueGroups].sort((a, b) => {
      const ai = Number(a);
      const bi = Number(b);
      const aNum = Number.isFinite(ai);
      const bNum = Number.isFinite(bi);
      if (aNum && bNum) return ai - bi;
      return String(a).localeCompare(String(b));
    });
    this.num_groups = this.sorted_subgroups.length;
    this.g_map = Object.fromEntries(this.sorted_subgroups.map((gid, idx) => [gid, idx]));
    this.Q_k = this.sorted_subgroups.map((gid) => this.readGroupQ(this.group_data[gid]));
    this.main_groups = this.sorted_subgroups.map((gid) => this.readGroupMain(this.group_data[gid]));

    this.nu = Array.from({ length: names.length }, () => Array.from({ length: this.num_groups }, () => 0));
    for (let i = 0; i < this.component_group_data.length; i++) {
      const counts = this.component_group_data[i].counts;
      for (const [gid, cnt] of Object.entries(counts)) {
        const k = this.g_map[gid];
        if (k == null) continue;
        this.nu[i][k] = Number(cnt ?? 0);
      }
    }

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

    return x.map((xi, i) => {
      if (xi <= 1e-12) return 0;
      return (
        Math.log(Math.max(phi[i] / Math.max(xi, this.eps), this.eps)) +
        (this.z / 2) * q[i] * Math.log(Math.max(theta[i] / Math.max(phi[i], this.eps), this.eps)) +
        l[i] -
        (phi[i] / Math.max(xi, this.eps)) * sumXl
      );
    });
  }

  _get_psi(T: number): number[][] {
    if (!this.num_groups) throw new ThermoModelError("num_groups not initialized", "INVALID_ACTIVITY_INPUT");
    return Array.from({ length: this.num_groups }, (_, m) =>
      Array.from({ length: this.num_groups }, (_, n) => {
        if (m === n) return 1;
        const mainM = this.main_groups[m];
        const mainN = this.main_groups[n];
        const a = this.readInteraction(mainM, mainN);
        return Math.exp(-a / Math.max(T, this.eps));
      })
    );
  }

  _ln_gamma_group(nu_vector: number[], Psi: number[][]): number[] {
    const m = nu_vector.length;
    const total = nu_vector.reduce((s, v) => s + v, 0);
    if (!(total > 0)) return Array.from({ length: m }, () => 0);
    const X = nu_vector.map((v) => v / total);

    const denomTheta = X.reduce((s, xi, i) => s + xi * this.Q_k[i], 0);
    const Theta = X.map((xi, i) => (xi * this.Q_k[i]) / Math.max(denomTheta, this.eps));

    return Array.from({ length: m }, (_, k) => {
      const sum1 = Theta.reduce((s, thm, mIdx) => s + thm * (Psi[mIdx]?.[k] ?? 0), 0);
      let sum2 = 0;
      for (let mIdx = 0; mIdx < m; mIdx++) {
        const den = Theta.reduce((s, thn, nIdx) => s + thn * (Psi[nIdx]?.[mIdx] ?? 0), 0);
        sum2 += (Theta[mIdx] * (Psi[k]?.[mIdx] ?? 0)) / Math.max(den, this.eps);
      }
      return this.Q_k[k] * (1 - Math.log(Math.max(sum1, this.eps)) - sum2);
    });
  }

  calc_residual(x: number[], T: number): number[] {
    if (!this.num_comps) throw new ThermoModelError("UNIFAC1 not initialized", "INVALID_ACTIVITY_INPUT");
    const Psi = this._get_psi(T);
    const nuComp = this.nu;
    const nuMix = Array.from({ length: this.num_groups }, (_, g) => {
      let acc = 0;
      for (let i = 0; i < this.num_comps; i++) {
        if (x[i] > 1e-12) acc += x[i] * nuComp[i][g];
      }
      return acc;
    });
    const lnGammaGroupMix = this._ln_gamma_group(nuMix, Psi);

    return this.component_group_data.map((_, i) => {
      const lnGammaGroupComp = this._ln_gamma_group(nuComp[i], Psi);
      let residual = 0;
      for (let g = 0; g < this.num_groups; g++) {
        if (nuComp[i][g] > 0) residual += nuComp[i][g] * (lnGammaGroupMix[g] - lnGammaGroupComp[g]);
      }
      return residual;
    });
  }

  get_activity_coefficients(T: number, x: number[], comp: string[]): [ActivityCoefficientResult, Record<string, unknown>] {
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
        ln_gamma_combinatorial: ln_c,
        ln_gamma_R: ln_r,
        ln_gamma_residual: ln_r,
        calculation_mode: "UNIFAC"
      }
    ];
  }

  private normalizeKey(value: string): string {
    return String(value ?? "").trim().toLowerCase();
  }

  private buildGroupIds(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [gid, info] of Object.entries(this.group_data ?? {})) {
      const name = String(info?.name ?? info?.groupId ?? "").trim();
      if (!name) continue;
      out[name] = gid;
    }
    return out;
  }

  private resolveGroupId(raw: string): string | null {
    const key = String(raw ?? "").trim();
    if (this.group_data[key]) return key;
    const target = this.normalizeKey(key);
    for (const [gid, info] of Object.entries(this.group_data)) {
      if (this.normalizeKey(gid) === target) return gid;
      const groupName = this.normalizeKey(String(info?.name ?? info?.groupId ?? ""));
      if (groupName && groupName === target) return gid;
    }
    return null;
  }

  private readGroupMain(info: UnifacGroupInfo | undefined): string {
    return String(info?.main_group ?? info?.mainGroup ?? 0);
  }

  private readGroupQ(info: UnifacGroupInfo | undefined): number {
    return Number(info?.Q ?? info?.q ?? 0);
  }

  private readInteraction(mainI: string, mainJ: string): number {
    const row = this.interaction_data[String(mainI)] ?? this.interaction_data[Number(mainI) as any];
    const raw = row?.[String(mainJ)] ?? row?.[Number(mainJ) as any];
    const value = typeof raw === "number" ? raw : Number(raw?.a_ij ?? raw?.Aij ?? raw?.value ?? 0);
    return Number.isFinite(value) ? value : 0;
  }
}
