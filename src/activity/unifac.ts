import { ThermoModelError } from "../errors";
import type { ActivityCoefficientResult, ExcessGibbsResult } from "../types";
import { generalExcessMolarGibbsFreeEnergy, normalizeFractionMap, parseModelInputObject, toKelvin } from "./_shared";
import { UNIFAC1, type UnifacComponentGroupCounts, type UnifacGroupData, type UnifacInteractionData } from "./unifac1";

type UnifacModelInputs = {
  mole_fraction: Record<string, number>;
  temperature: [number, string] | { value: number; unit: string } | number;
  component_groups?: Record<string, UnifacComponentGroupCounts>;
};

export class UNIFAC {
  static readonly R_CONST = 8.314;
  static readonly Z = 10.0;

  datasource: Record<string, unknown>;
  equationsource: Record<string, unknown>;
  components: string[];
  comp_num: number;
  comp_idx: Record<string, number>;
  components_ids: Record<string, string[]> = {};
  group_data: UnifacGroupData = {};
  interaction_data: UnifacInteractionData = {};
  private _model: UNIFAC1 | null = null;
  private _componentGroups: Record<string, UnifacComponentGroupCounts> = {};

  constructor(
    components: string[],
    datasource: Record<string, unknown> = {},
    equationsource: Record<string, unknown> = {}
  ) {
    this.datasource = datasource ?? {};
    this.equationsource = equationsource ?? {};
    this.components = (components ?? []).map((c) => String(c).trim());
    this.comp_num = this.components.length;
    this.comp_idx = Object.fromEntries(this.components.map((c, i) => [c, i]));
  }

  load_data(
    group_data: UnifacGroupData,
    interaction_data: UnifacInteractionData,
    kwargs: { eps?: number; z?: number } = {}
  ) {
    this.group_data = group_data ?? {};
    this.interaction_data = interaction_data ?? {};
    this._model = new UNIFAC1(this.group_data, this.interaction_data, kwargs);
  }

  get_group_ids() {
    if (!this._model) throw new ThermoModelError("UNIFAC model data not loaded. Call load_data() first.", "INVALID_ACTIVITY_INPUT");
    return { ...this._model.group_ids };
  }

  _find_group_id_by_name(group_name: string | number) {
    const raw = String(group_name ?? "").trim();
    if (!raw) return null;
    if (this.group_data[raw]) return raw;
    const target = this._normalizeKey(raw);
    const ids = this.get_group_ids();
    for (const [name, gid] of Object.entries(ids)) {
      if (this._normalizeKey(name) === target) return gid;
    }
    for (const [gid, info] of Object.entries(this.group_data)) {
      if (this._normalizeKey(gid) === target) return gid;
      const name = this._normalizeKey(String(info?.name ?? info?.groupId ?? ""));
      if (name && name === target) return gid;
    }
    return null;
  }

  _set_component_groups_by_name(component_groups_by_name: Record<string, Record<string, number>>) {
    const out: Record<string, UnifacComponentGroupCounts> = {};
    for (const [comp, groups] of Object.entries(component_groups_by_name ?? {})) {
      out[comp] = {};
      for (const [gName, count] of Object.entries(groups ?? {})) {
        const gid = this._find_group_id_by_name(gName);
        if (!gid) throw new ThermoModelError(`UNIFAC group not found: ${gName}`, "INVALID_ACTIVITY_INPUT");
        out[comp][gid] = Number(count);
      }
    }
    this._componentGroups = out;
    return out;
  }

  set_component_groups(component_groups: Record<string, UnifacComponentGroupCounts> | Record<string, Record<string, number>>, by_name = false) {
    const src = by_name
      ? this._set_component_groups_by_name(component_groups as Record<string, Record<string, number>>)
      : this._normalize_component_groups(component_groups as Record<string, Record<string, number>>);
    const validated: Record<string, UnifacComponentGroupCounts> = {};
    for (const comp of this.components) {
      const groups = src[comp];
      if (!groups) throw new ThermoModelError(`Component '${comp}' not found in component_groups.`, "INVALID_ACTIVITY_INPUT");
      validated[comp] = groups;
    }
    this._componentGroups = validated;
    return this._componentGroups;
  }

  cal(
    model_inputs: UnifacModelInputs | string | Record<string, unknown>,
    kwargs: { component_groups?: Record<string, UnifacComponentGroupCounts>; eps?: number; z?: number; x_eps?: number } = {}
  ): [ActivityCoefficientResult, Record<string, unknown>, ExcessGibbsResult] {
    if (!this._model) throw new ThermoModelError("UNIFAC data not loaded. Call load_data() first.", "INVALID_ACTIVITY_INPUT");
    const parsed = parseModelInputObject(model_inputs);
    const x_eps = Number((parsed as any).x_eps ?? kwargs.x_eps ?? 1e-30);
    const mole_fraction_raw = normalizeFractionMap((parsed.mole_fraction as Record<string, number>) ?? {});
    const mole_fraction = this._sanitize_mole_fraction(mole_fraction_raw, x_eps);
    const tempInput = (parsed.temperature as any) ?? 298.15;
    const T = Array.isArray(tempInput)
      ? toKelvin({ value: Number(tempInput[0]), unit: String(tempInput[1] ?? "K") } as any)
      : toKelvin(tempInput as any);
    const component_groups_raw = (parsed.component_groups as Record<string, UnifacComponentGroupCounts> | undefined) ?? kwargs.component_groups ?? this._componentGroups;

    if (!component_groups_raw || !Object.keys(component_groups_raw).length) {
      throw new ThermoModelError("UNIFAC requires component_groups and explicit group/interaction data", "INVALID_ACTIVITY_INPUT");
    }
    const component_groups = this._normalize_component_groups(component_groups_raw as Record<string, Record<string, number>>);
    const eps = Number((parsed as any).eps ?? kwargs.eps ?? this._model.eps);
    const z = Number((parsed as any).z ?? kwargs.z ?? this._model.z);
    this._model.eps = Number.isFinite(eps) ? eps : this._model.eps;
    this._model.z = Number.isFinite(z) ? z : this._model.z;

    this._model.initialize_calc(component_groups, this.components);
    const x = this.components.map((c) => Number(mole_fraction[c] ?? 0));
    const [res, details] = this._model.get_activity_coefficients(T, x, this.components);
    const G_ex = generalExcessMolarGibbsFreeEnergy(mole_fraction, res.value as Record<string, number>, "UNIFAC excess Gibbs free energy");
    return [res, { ...details, temperature_K: T, component_groups }, G_ex];
  }

  group_data_template() {
    return { "1": { name: "CH3", R: 0.9011, Q: 0.848, main_group: 1 } };
  }

  interaction_data_template() {
    return { "1": { "1": 0 } };
  }

  private _normalizeKey(value: string): string {
    return String(value ?? "").trim().toLowerCase();
  }

  private _normalize_component_groups(component_groups: Record<string, Record<string, number>>) {
    const out: Record<string, UnifacComponentGroupCounts> = {};
    for (const [comp, groups] of Object.entries(component_groups ?? {})) {
      out[comp] = {};
      for (const [rawGroupId, rawCount] of Object.entries(groups ?? {})) {
        const gid = this._find_group_id_by_name(rawGroupId);
        if (!gid) throw new ThermoModelError(`UNIFAC group not found: ${rawGroupId}`, "INVALID_ACTIVITY_INPUT");
        out[comp][gid] = Number(rawCount ?? 0);
      }
    }
    return out;
  }

  private _sanitize_mole_fraction(mole_fraction: Record<string, number>, x_eps: number): Record<string, number> {
    const entries = Object.entries(mole_fraction).map(([key, value]) => [key, Math.max(Number(value ?? 0), x_eps)] as const);
    let sum = entries.reduce((acc, [, value]) => acc + value, 0);
    if (!(sum > 0)) sum = 1;
    return Object.fromEntries(entries.map(([key, value]) => [key, value / sum]));
  }
}
