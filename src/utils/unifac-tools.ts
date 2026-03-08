export interface UnifacGroupParameter {
    mainGroup: number;
    subGroup: number;
    groupId: string;
    R: number;
    Q: number;
}

export type UnifacGroupParameterMap = Record<string, UnifacGroupParameter>;
export type UnifacInteractionMatrix = Record<string, Record<string, number | null>>;
export type UnifacModelGroupData = Record<
    string,
    {
        main_group: number;
        sub_group: number;
        name: string;
        R: number;
        Q: number;
    }
>;
export type UnifacModelInteractionData = Record<string, Record<string, number>>;

export function mapGroupParametersToModelData(
    groups: UnifacGroupParameterMap
): UnifacModelGroupData {
    return Object.fromEntries(
        Object.entries(groups ?? {}).map(([subgroupId, item]) => [
            subgroupId,
            {
                main_group: Number(item.mainGroup),
                sub_group: Number(item.subGroup),
                name: String(item.groupId),
                R: Number(item.R),
                Q: Number(item.Q)
            }
        ])
    );
}

export function mapInteractionMatrixToModelData(
    matrix: UnifacInteractionMatrix
): UnifacModelInteractionData {
    return Object.fromEntries(
        Object.entries(matrix ?? {}).map(([mainGroupI, row]) => [
            String(mainGroupI),
            Object.fromEntries(
                Object.entries(row ?? {}).map(([mainGroupJ, value]) => [String(mainGroupJ), Number(value ?? 0)])
            )
        ])
    );
}

export function loadUnifacDataFromJson(
    groupParameters: UnifacGroupParameterMap,
    interactionMatrix: UnifacInteractionMatrix
) {
    return {
        groupParameters,
        groupInteractions: interactionMatrix,
        groupData: mapGroupParametersToModelData(groupParameters),
        interactionData: mapInteractionMatrixToModelData(interactionMatrix)
    };
}

export function getUnifacGroupBySubGroup(
    groupParameters: UnifacGroupParameterMap,
    subGroup: number | string
) {
    return groupParameters[String(subGroup)] ?? null;
}

export function getUnifacInteractionParam(
    interactionMatrix: UnifacInteractionMatrix,
    mainGroupI: number | string,
    mainGroupJ: number | string
): number | null {
    const row = interactionMatrix[String(mainGroupI)];
    if (!row) return null;
    const value = row[String(mainGroupJ)];
    return value ?? null;
}
