// import libs
import { convertFromTo } from "mozicuc";
// ! LOCALS
import type { Component, ModelSource, Pressure, Temperature, DataSource, EquationSource } from "@/types";
import { ThermoModelError } from "@/errors";


export function normalizeModelSource(modelSource: ModelSource): ModelSource {
    if (!modelSource || typeof modelSource !== "object") throw new ThermoModelError("Invalid model_source input", "INVALID_MODEL_SOURCE");
    if (!modelSource.dataSource || !modelSource.equationSource) {
        throw new ThermoModelError("modelSource must include dataSource and equationSource", "INVALID_MODEL_SOURCE");
    }
    return {
        dataSource: modelSource.dataSource,
        equationSource: modelSource.equationSource
    };
}

export function validateComponent(component: Component): void {
    if (!component || typeof component !== "object") throw new ThermoModelError("Invalid component input", "INVALID_COMPONENT");
    if (!component.name || !component.formula || !component.state) throw new ThermoModelError("Component must include name/formula/state", "INVALID_COMPONENT");
    if (!["g", "l", "s", "aq"].includes(String(component.state))) throw new ThermoModelError("Component state must be one of g|l|s|aq", "INVALID_COMPONENT_STATE");
}

export function validatePressure(pressure: Pressure): void {
    if (!pressure || typeof pressure.value !== "number" || !pressure.unit) throw new ThermoModelError("Invalid pressure input", "INVALID_PRESSURE");
    void convertFromTo(pressure.value, String(pressure.unit), "Pa");
}

export function validateTemperature(temperature: Temperature): void {
    if (!temperature || typeof temperature.value !== "number" || !temperature.unit) throw new ThermoModelError("Invalid temperature input", "INVALID_TEMPERATURE");
    void convertFromTo(temperature.value, String(temperature.unit), "K");
}

export function getDataSource(modelSource: ModelSource): DataSource {
    const ds = modelSource.dataSource;
    if (!ds) throw new ThermoModelError("Missing dataSource in modelSource", "MISSING_MODEL_SOURCE");
    return ds;
}

export function getEquationSource(modelSource: ModelSource): EquationSource {
    const es = modelSource.equationSource;
    if (!es) throw new ThermoModelError("Missing equationSource in modelSource", "MISSING_MODEL_SOURCE");
    return es;
}