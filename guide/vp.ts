
// // import libs
// import {
//     Component,
//     Temperature,
//     Pressure,
//     CustomProperty,
//     ComponentKey,
//     set_component_id
// } from "mozithermodb-settings"
// import { Source, ComponentEquationSource, calcEq } from "mozithermodb"
// import * as mozicuc from "mozicuc"

// // ! LOCALS
// import { VaPr_SYMBOL } from "@/configs/thermo-props";
// import { R_J_molK, T_ref_K } from "@/configs/constants";
// import { bisectSolve, brentSolve, leastSquaresSolve, newtonSolve } from "@/solvers";

// const convertFromTo = (
//     (mozicuc as unknown as { convertFromTo?: unknown }).convertFromTo ??
//     (mozicuc as unknown as { default?: { convertFromTo?: unknown } }).default?.convertFromTo
// ) as typeof import("mozicuc")["convertFromTo"]

// if (typeof convertFromTo !== "function") {
//     throw new Error("mozicuc.convertFromTo is unavailable. This is likely a package ESM/CJS export mismatch.")
// }

// /**
//  * Component vapor pressure class used to calculate the following properties:
//  * - Saturation pressure VaPr(T)
//  * - Enthalpy of vaporization EnVap(T)
//  * - Temperature at given vapor pressure TeVaPr(P)
//  *
//  * Notes
//  * -----
//  * - All calculations are based on the vapor pressure equation retrieved from the source for the given component.
//  * - `Pressure` unit defined in the model source should be in `Pa`.
//  * - `Temperature` unit defined in the model source should be in `K`.
//  */
// export class ComponentVaporPressure {
//     //  NOTE: attributes
//     T_ref = T_ref_K  // reference temperature in K
//     R = R_J_molK  // universal gas constant in J/mol.K

//     // NOTE: component id
//     componentId: string
//     // NOTE: vapor pressure equation
//     VaPr_eqSrc: Record<string, ComponentEquationSource> | null = null
//     VaPrComponent_eqSrc: ComponentEquationSource | null = null
//     VaPr_return_unit: string | null = null
//     VaPr_arg_unit_T: string | null = null

//     // SECTION: constructor
//     constructor(
//         public component: Component,
//         public source: Source,
//         public componentKey: ComponentKey = 'Name-Formula',
//     ) {
//         // NOTE: set component id for the component
//         this.componentId = set_component_id(this.component, this.componentKey)
//         // NOTE: align source component key
//         this.source.componentKey = this.componentKey

//         // SECTION: get vapor pressure equation source
//         this.VaPr_eqSrc = this.source.eqBuilder([this.component], VaPr_SYMBOL)
//         if (!this.VaPr_eqSrc || !(this.componentId in this.VaPr_eqSrc)) {
//             throw new Error(`No vapor pressure equation found for component ID: ${this.componentId}`)
//         }

//         this.VaPrComponent_eqSrc = this.VaPr_eqSrc[this.componentId]
//         this.VaPr_return_unit = this.VaPrComponent_eqSrc.returnUnit ?? null
//         this.VaPr_arg_unit_T = this.getArgUnitForSymbol("T")
//     }

//     // SECTION: helpers
//     private getArgUnitForSymbol(symbol: string): string {
//         if (!this.VaPrComponent_eqSrc) {
//             throw new Error("Vapor pressure equation source not initialized.")
//         }
//         for (const [key, arg] of Object.entries(this.VaPrComponent_eqSrc.args)) {
//             if (key === symbol || arg.symbol === symbol) {
//                 return arg.unit
//             }
//         }
//         throw new Error(`Argument unit for '${symbol}' not found in vapor pressure equation.`)
//     }

//     private convertValue(value: number, fromUnit: string, toUnit: string): number {
//         if (fromUnit === toUnit) return value
//         return convertFromTo(value, fromUnit, toUnit)
//     }

//     private getExpectedTemperatureUnit(): string {
//         if (!this.VaPr_arg_unit_T) {
//             throw new Error("Temperature unit not specified in vapor pressure equation arguments.")
//         }
//         return this.VaPr_arg_unit_T
//     }

//     private buildTemperature(value: number, unit: string): Temperature {
//         return { value, unit }
//     }

//     // SECTION: calculations
//     calc_VaPr(temperature: Temperature): CustomProperty {
//         if (!this.VaPrComponent_eqSrc) {
//             throw new Error("Vapor pressure equation source not initialized.")
//         }

//         let T_value = temperature.value
//         let T_unit = temperature.unit

//         const expectedUnit = this.getExpectedTemperatureUnit()
//         if (T_unit !== expectedUnit) {
//             T_value = this.convertValue(T_value, T_unit, expectedUnit)
//             T_unit = expectedUnit
//         }

//         if (T_value <= 0) {
//             throw new Error("Temperature must be greater than zero Kelvin.")
//         }

//         const result = calcEq(this.VaPrComponent_eqSrc, { T: T_value })
//         if (!result) {
//             throw new Error(`Failed to calculate vapor pressure at T=${T_value} ${T_unit}.`)
//         }

//         const resultUnit = result.unit ?? this.VaPr_return_unit ?? "Pa"
//         const valuePa = this.convertValue(result.value, resultUnit, "Pa")

//         return {
//             value: valuePa,
//             unit: "Pa",
//             symbol: "VaPr"
//         }
//     }

//     calc_VaPr_range(temperatureRange: Temperature[]): CustomProperty[] {
//         return temperatureRange.map((t) => this.calc_VaPr(t))
//     }

//     calc_dPsat__dT(temperature: Temperature, h?: number): CustomProperty {
//         const expectedUnit = this.getExpectedTemperatureUnit()
//         let T_value = temperature.value
//         let T_unit = temperature.unit

//         if (T_unit !== expectedUnit) {
//             T_value = this.convertValue(T_value, T_unit, expectedUnit)
//             T_unit = expectedUnit
//         }

//         if (T_value <= 0) {
//             throw new Error("Temperature must be greater than zero Kelvin.")
//         }

//         const delta_T = h ?? 1e-5
//         const T_plus = T_value + delta_T
//         const T_minus = T_value - delta_T

//         const VaPr_plus = this.calc_VaPr(this.buildTemperature(T_plus, expectedUnit))
//         const VaPr_minus = this.calc_VaPr(this.buildTemperature(T_minus, expectedUnit))

//         const resVal = (VaPr_plus.value - VaPr_minus.value) / (2 * delta_T)

//         return {
//             value: resVal,
//             unit: "Pa/K",
//             symbol: "dPsat/dT"
//         }
//     }

//     calc_dPsat__dT_range(temperatureRange: Temperature[], h?: number): CustomProperty[] {
//         return temperatureRange.map((t) => this.calc_dPsat__dT(t, h))
//     }

//     calc_EnVap_Clapeyron(temperature: Temperature, h?: number): CustomProperty {
//         const expectedUnit = this.getExpectedTemperatureUnit()
//         let T_value = temperature.value
//         let T_unit = temperature.unit

//         if (T_unit !== expectedUnit) {
//             T_value = this.convertValue(T_value, T_unit, expectedUnit)
//             T_unit = expectedUnit
//         }

//         if (T_value <= 0) {
//             throw new Error("Temperature must be greater than zero Kelvin.")
//         }

//         const VaPr = this.calc_VaPr(this.buildTemperature(T_value, expectedUnit))
//         const dPsat_dT = this.calc_dPsat__dT(this.buildTemperature(T_value, expectedUnit), h)

//         const EnVap = (this.R * Math.pow(T_value, 2) / VaPr.value) * dPsat_dT.value

//         return {
//             value: EnVap,
//             unit: "J/mol",
//             symbol: "EnVap"
//         }
//     }

//     calc_EnVap_Clapeyron_range(temperatureRange: Temperature[], h?: number): CustomProperty[] {
//         return temperatureRange.map((t) => this.calc_EnVap_Clapeyron(t, h))
//     }

//     calc_TeVaPr(
//         pressure: Pressure,
//         temperatureGuess?: Temperature,
//         T_bracket?: [Temperature, Temperature],
//         method: string = "auto",
//         tol: number = 1e-6,
//         max_iter: number = 50,
//         h?: number
//     ): CustomProperty {
//         const expectedUnit = this.getExpectedTemperatureUnit()

//         let P_value = pressure.value
//         let P_unit = pressure.unit
//         if (P_unit !== "Pa") {
//             P_value = this.convertValue(P_value, P_unit, "Pa")
//             P_unit = "Pa"
//         }

//         let T_guess_value: number | null = null
//         if (temperatureGuess) {
//             T_guess_value = temperatureGuess.value
//             const T_guess_unit = temperatureGuess.unit
//             if (T_guess_unit !== expectedUnit) {
//                 T_guess_value = this.convertValue(T_guess_value, T_guess_unit, expectedUnit)
//             }
//         }

//         let T_bracket_values: [number, number] | null = null
//         if (T_bracket) {
//             let [T_low, T_high] = T_bracket
//             let T_low_value = T_low.value
//             let T_high_value = T_high.value

//             if (T_low.unit !== expectedUnit) {
//                 T_low_value = this.convertValue(T_low_value, T_low.unit, expectedUnit)
//             }
//             if (T_high.unit !== expectedUnit) {
//                 T_high_value = this.convertValue(T_high_value, T_high.unit, expectedUnit)
//             }
//             T_bracket_values = [T_low_value, T_high_value]
//         }

//         const func = (T: number): number => {
//             const VaPr = this.calc_VaPr(this.buildTemperature(T, expectedUnit))
//             return VaPr.value - P_value
//         }

//         const funcPrime = (T: number): number => {
//             return this.calc_dPsat__dT(this.buildTemperature(T, expectedUnit), h).value
//         }

//         let selectedMethod = method.toLowerCase()
//         if (selectedMethod === "auto") {
//             selectedMethod = T_bracket_values ? "brentq" : "newton"
//         }

//         let sol: { root: number; converged: boolean }

//         if (selectedMethod === "newton") {
//             if (T_guess_value === null) {
//                 throw new Error("temperatureGuess must be provided for method 'newton'.")
//             }
//             sol = newtonSolve(func, funcPrime, T_guess_value, tol, max_iter)
//         } else if (selectedMethod === "brentq") {
//             if (!T_bracket_values) {
//                 throw new Error("T_bracket must be provided for method 'brentq'.")
//             }
//             sol = brentSolve(func, T_bracket_values[0], T_bracket_values[1], tol, max_iter)
//         } else if (selectedMethod === "bisect") {
//             if (!T_bracket_values) {
//                 throw new Error("T_bracket must be provided for method 'bisect'.")
//             }
//             sol = bisectSolve(func, T_bracket_values[0], T_bracket_values[1], tol, max_iter)
//         } else if (selectedMethod === "lsq" || selectedMethod === "least_squares") {
//             if (T_guess_value === null) {
//                 throw new Error("temperatureGuess must be provided for method 'least_squares'.")
//             }
//             const bounds = T_bracket_values ?? undefined
//             sol = leastSquaresSolve(func, T_guess_value, bounds, tol, max_iter)
//         } else {
//             throw new Error("method must be 'auto', 'newton', 'brentq', 'bisect', or 'least_squares'.")
//         }

//         if (!sol.converged) {
//             throw new Error(`Root finding did not converge for pressure=${P_value} Pa.`)
//         }

//         let Tsat = sol.root
//         if (expectedUnit !== "K") {
//             Tsat = this.convertValue(Tsat, expectedUnit, "K")
//         }

//         return {
//             value: Tsat,
//             unit: "K",
//             symbol: "Tsat"
//         }
//     }
// }