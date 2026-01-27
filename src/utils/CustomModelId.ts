export type ParsedCustomModelId = {
    providerId: string;
    rawModelId: string;
};

export function parseCustomModelId(
    modelId: string | null | undefined,
): ParsedCustomModelId | null {
    const id = String(modelId || "").trim();
    if (!id) return null;

    const parts = id.split("/");
    if (parts.length !== 3) return null;
    if (parts[0] !== "custom") return null;

    const providerId = String(parts[1] || "").trim();
    if (!providerId) return null;

    let rawModelId = String(parts[2] || "").trim();
    if (!rawModelId) return null;
    try {
        rawModelId = decodeURIComponent(rawModelId);
    } catch {
        // keep as-is
    }

    return { providerId, rawModelId };
}

export function isCustomModelId(modelId: string | null | undefined): boolean {
    return Boolean(parseCustomModelId(modelId));
}
