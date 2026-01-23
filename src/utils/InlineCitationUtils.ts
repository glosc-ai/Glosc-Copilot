export type InlineCitationItem = {
    number: number;
    title: string;
    url: string;
    description?: string;
    quote?: string;
    meta?: Record<string, any>;
};

const MCP_RESOURCE_BLOCK_RE =
    /\[\[MCP_RESOURCE_META:([^\]]+)\]\]([\s\S]*?)\[\[\/MCP_RESOURCE\]\]/g;

export function buildMcpResourceBlock(args: {
    number: number;
    meta: Record<string, any>;
    content: string;
}) {
    const meta = {
        ...args.meta,
        number: args.number,
    };

    const metaEnc = encodeURIComponent(JSON.stringify(meta));
    return `[[MCP_RESOURCE_META:${metaEnc}]]\n${args.content}\n[[/MCP_RESOURCE]]`;
}

export function extractMcpResourceCitations(rawText: string): {
    displayText: string;
    citations: InlineCitationItem[];
} {
    const citations: InlineCitationItem[] = [];

    let displayText = String(rawText || "");

    // Reset lastIndex because MCP_RESOURCE_BLOCK_RE is global (/g).
    MCP_RESOURCE_BLOCK_RE.lastIndex = 0;

    displayText = displayText.replace(
        MCP_RESOURCE_BLOCK_RE,
        (_full, enc: string, content: string) => {
            try {
                const meta = JSON.parse(decodeURIComponent(String(enc || "")));
                const number = Number(meta?.number);
                if (Number.isFinite(number) && number > 0) {
                    citations.push({
                        number,
                        title:
                            meta?.name ||
                            meta?.title ||
                            meta?.uri ||
                            "MCP Resource",
                        url: meta?.uri || meta?.url || "mcp://resource",
                        description:
                            meta?.serverName || meta?.server || meta?.mimeType,
                        quote:
                            typeof content === "string" ? content.trim() : "",
                        meta,
                    });
                }
            } catch {
                // ignore
            }

            // Hide the full embedded content from UI rendering.
            return "";
        },
    );

    // Deduplicate by number (keep first)
    const seen = new Set<number>();
    const deduped: InlineCitationItem[] = [];
    for (const c of citations) {
        if (seen.has(c.number)) continue;
        seen.add(c.number);
        deduped.push(c);
    }

    return {
        displayText,
        citations: deduped.sort((a, b) => a.number - b.number),
    };
}

export type ParsedInlineCitationPart =
    | { type: "text"; content: string; key: string }
    | { type: "citation"; citation: InlineCitationItem; key: string };

export function parseTextWithInlineCitations(
    rawText: string,
): ParsedInlineCitationPart[] {
    const { displayText, citations } = extractMcpResourceCitations(rawText);
    if (!displayText) return [];

    const lookup = new Map<number, InlineCitationItem>();
    for (const c of citations) lookup.set(c.number, c);

    const parts = displayText.split(/(\[\d+\])/g);
    const result: ParsedInlineCitationPart[] = [];

    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part) continue;

        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
            const n = Number(m[1]);
            const citation = lookup.get(n);
            if (citation) {
                result.push({
                    type: "citation",
                    citation,
                    key: `citation-${n}-${index}`,
                });
                continue;
            }
        }

        result.push({ type: "text", content: part, key: `text-${index}` });
    }

    return result;
}

export function hasMcpResourceBlocks(rawText: string): boolean {
    MCP_RESOURCE_BLOCK_RE.lastIndex = 0;
    return MCP_RESOURCE_BLOCK_RE.test(String(rawText || ""));
}

export function extractMcpResourceBlocks(rawText: string): string[] {
    const blocks: string[] = [];
    const text = String(rawText || "");

    MCP_RESOURCE_BLOCK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MCP_RESOURCE_BLOCK_RE.exec(text))) {
        blocks.push(m[0]);
    }
    return blocks;
}

export function removeMcpResourceCitation(
    rawText: string,
    number: number,
): string {
    const n = Number(number);
    let text = String(rawText || "");
    if (!Number.isFinite(n) || n <= 0) return text;

    text = text.replace(MCP_RESOURCE_BLOCK_RE, (full, enc: string) => {
        try {
            const meta = JSON.parse(decodeURIComponent(String(enc || "")));
            const metaNumber = Number(meta?.number);
            if (Number.isFinite(metaNumber) && metaNumber === n) {
                return "";
            }
        } catch {
            // ignore
        }
        return full;
    });

    // Also remove inline reference markers like [1] to avoid dangling citations.
    text = text.replace(new RegExp(`\\[${n}\\]`, "g"), "");

    // Normalize excessive blank lines introduced by removal.
    text = text.replace(/\n{3,}/g, "\n\n");
    return text;
}
