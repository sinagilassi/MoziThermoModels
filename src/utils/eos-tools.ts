// import libs
import { ThermoModelError } from "@/errors";
import { PENG_ROBINSON, REDLICH_KWONG, SOAVE_REDLICH_KWONG, VAN_DER_WAALS } from "@/configs/constants";
import { EosModelName } from "@/types";

/**
 * Normalize EOS model name to standard form.
 * Accepts various common representations and returns a standardized EOS model name.
 * Supported models: Peng-Robinson (PR), Soave-Redlich-Kwong (SRK), Redlich-Kwong (RK), Van der Waals (vdW).
 * Throws an error if the input model name is not recognized.
 * @param modelName
 * @returns Normalized EOS model name as EosModelName type.
 * @throws ThermoModelError if the model name is invalid.
 */
export function normalizeEosModelName(modelName: string): EosModelName {
    const raw = String(modelName ?? "").trim();
    const upper = raw.toUpperCase();
    if (upper === "PR" || raw === PENG_ROBINSON) return "PR";
    if (upper === "SRK" || raw === SOAVE_REDLICH_KWONG) return "SRK";
    if (upper === "RK" || raw === REDLICH_KWONG) return "RK";
    if (upper === "VDW" || raw === VAN_DER_WAALS) return "vdW";
    throw new ThermoModelError(`Invalid EOS model name: ${modelName}`, "INVALID_EOS_MODEL");
}

