/**
 * Base error class for all errors in the ThermoModel library.
 * Provides a consistent structure for error handling and allows for easy identification of errors specific to the library.
 */
export class ThermoModelError extends Error {
    code: string;
    cause?: unknown;

    constructor(message: string, code = "THERMO_MODEL_ERROR", cause?: unknown) {
        super(message);
        this.name = "ThermoModelError";
        this.code = code;
        this.cause = cause;
    }
}