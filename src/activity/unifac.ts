import { ThermoModelError } from "../core";
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
    return Object.fromEntries(Object.keys(this.group_data).map((gid) => [gid, this.group_data[gid]?.name ?? gid]));
  }

  _find_group_id_by_name(group_name: string) {
    const target = String(group_name).trim().toLowerCase();
    const match = Object.entries(this.group_data).find(([gid, info]) => gid.toLowerCase() === target || String(info?.name ?? "").trim().toLowerCase() === target);
    return match?.[0] ?? null;
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
    this._componentGroups = by_name
      ? this._set_component_groups_by_name(component_groups as Record<string, Record<string, number>>)
      : (component_groups as Record<string, UnifacComponentGroupCounts>);
    return this._componentGroups;
  }

  cal(model_inputs: UnifacModelInputs | string | Record<string, unknown>, kwargs: { component_groups?: Record<string, UnifacComponentGroupCounts> } = {}) {
    if (!this._model) throw new ThermoModelError("UNIFAC data not loaded. Call load_data() first.", "INVALID_ACTIVITY_INPUT");
    const parsed = parseModelInputObject(model_inputs);
    const mole_fraction = normalizeFractionMap((parsed.mole_fraction as Record<string, number>) ?? {});
    const tempInput = (parsed.temperature as any) ?? 298.15;
    const T = Array.isArray(tempInput)
      ? toKelvin({ value: Number(tempInput[0]), unit: String(tempInput[1] ?? "K") } as any)
      : toKelvin(tempInput as any);
    const component_groups = (parsed.component_groups as Record<string, UnifacComponentGroupCounts> | undefined) ?? kwargs.component_groups ?? this._componentGroups;

    if (!component_groups || !Object.keys(component_groups).length) {
      throw new ThermoModelError("UNIFAC requires component_groups and explicit group/interaction data", "INVALID_ACTIVITY_INPUT");
    }

    this._model.initialize_calc(component_groups, this.components);
    const x = this.components.map((c) => Number(mole_fraction[c] ?? 0));
    const [res, details] = this._model.get_activity_coefficients(T, x, this.components);
    const G_ex = generalExcessMolarGibbsFreeEnergy(mole_fraction, res.value as Record<string, number>, "UNIFAC excess Gibbs free energy");
    return [res, { ...details, temperature_K: T, component_groups }, G_ex] as const;
  }

  group_data_template() {
    return { "1": { name: "CH3", R: 0.9011, Q: 0.848, main_group: 1 } };
  }

  interaction_data_template() {
    return { "1": { "1": 0 } };
  }
}

