// SECTION: Constants
export const PENG_ROBINSON = "PR";
export const SOAVE_REDLICH_KWONG = "SRK";
export const REDLICH_KWONG = "RK";
export const VAN_DER_WAALS = "vdW";

export const RAOULT_MODEL = "raoult";
export const MODIFIED_RAOULT_MODEL = "modified-raoult";

export const VAN_LAAR_ACTIVITY_MODEL = "van-laar";
export const WILSON_ACTIVITY_MODEL = "wilson";

export const R_CONST = 8.314472;
export const EPS_CONST = 1e-30;
export const PI_CONST = Math.PI;

export const Pstp = 101325;
export const Tstp = 273.15;
export const Tref = Tstp + 25;

export const PREDEFINED_PARAMETERS = {
    kij: [] as number[],
};
