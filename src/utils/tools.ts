// import libs

/**
 * Normalize feed specification input to a consistent format.
 * Accepts various input formats:
 * 1. An object with "components" and "mole_fraction" arrays.
 * @param input
 * @returns A normalized feed specification as a record of component names to mole fractions.
 * The function also normalizes the mole fractions so that they sum to 1.
 * If the input format is not recognized, it attempts to normalize it as a direct record of component names to mole fractions.
 * If the input is invalid or empty, it returns an empty feed specification.
 * @throws ThermoModelError if the input format is invalid.
 */
export function setFeedSpecification(input: any): Record<string, number> {
    if (typeof input === "object" && input && !Array.isArray(input) && "components" in input && "mole_fraction" in input) {
        const components = Array.isArray(input.components) ? input.components as string[] : [];
        const moleFraction = Array.isArray(input.mole_fraction) ? input.mole_fraction as number[] : [];
        const map = Object.fromEntries(components.map((c, i) => [c, Number(moleFraction[i] ?? 0)]));
        return normalizeFractions(map);
    }
    if (typeof input === "object" && input && !Array.isArray(input) && "feedSpecification" in input && input.feedSpecification) {
        return normalizeFractions(input.feedSpecification as Record<string, number>);
    }
    if (typeof input === "object" && input && !Array.isArray(input) && "feed-specification" in input && input["feed-specification"]) {
        return normalizeFractions(input["feed-specification"] as Record<string, number>);
    }
    return normalizeFractions((input ?? {}) as Record<string, number>);
}

/**
 * Normalize a feed specification by ensuring all values are numbers and that they sum to 1.
 * If the sum of the values is 0 or negative, it treats it as if all values were 0 and returns an empty feed specification.
 * @param feed
 * @returns A normalized feed specification with values normalized to sum to 1.
 */
function normalizeFractions(feed: Record<string, number>): Record<string, number> {
    const entries = Object.entries(feed).map(([k, v]) => [k, Number(v ?? 0)] as const);
    let sum = entries.reduce((s, [, v]) => s + v, 0);
    if (!(sum > 0)) sum = 1;
    return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}
