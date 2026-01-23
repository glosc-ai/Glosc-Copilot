export type AnsiSegment = {
    text: string;
    className: string;
    style?: Record<string, string>;
};

type AnsiStyleState = {
    fgClass: string;
    fgColor: string;
    bgClass: string;
    bgColor: string;
    bold: boolean;
    dim: boolean;
    underline: boolean;
};

const DEFAULT_STATE: AnsiStyleState = {
    fgClass: "",
    fgColor: "",
    bgClass: "",
    bgColor: "",
    bold: false,
    dim: false,
    underline: false,
};

function colorClassFromCode(code: number): string {
    // Basic + bright colors (30-37 / 90-97)
    // Map to Tailwind text-* utility.
    switch (code) {
        case 30:
        case 90:
            return "text-muted-foreground";
        case 31:
        case 91:
            return "text-red-500";
        case 32:
        case 92:
            return "text-emerald-500";
        case 33:
        case 93:
            return "text-amber-500";
        case 34:
        case 94:
            return "text-blue-500";
        case 35:
        case 95:
            return "text-fuchsia-500";
        case 36:
        case 96:
            return "text-cyan-500";
        case 37:
        case 97:
            return "text-foreground";
        default:
            return "";
    }
}

function bgClassFromCode(code: number): string {
    // Basic + bright background colors (40-47 / 100-107)
    // Map to Tailwind bg-* utility.
    switch (code) {
        case 40:
        case 100:
            return "bg-muted";
        case 41:
        case 101:
            return "bg-red-500/15";
        case 42:
        case 102:
            return "bg-emerald-500/15";
        case 43:
        case 103:
            return "bg-amber-500/15";
        case 44:
        case 104:
            return "bg-blue-500/15";
        case 45:
        case 105:
            return "bg-fuchsia-500/15";
        case 46:
        case 106:
            return "bg-cyan-500/15";
        case 47:
        case 107:
            return "bg-muted/40";
        default:
            return "";
    }
}

function xterm256ToRgb(n: number): { r: number; g: number; b: number } {
    // 0-15: basic colors (we still provide rgb as a fallback)
    const basic: Array<[number, number, number]> = [
        [0, 0, 0],
        [205, 0, 0],
        [0, 205, 0],
        [205, 205, 0],
        [0, 0, 238],
        [205, 0, 205],
        [0, 205, 205],
        [229, 229, 229],
        [127, 127, 127],
        [255, 0, 0],
        [0, 255, 0],
        [255, 255, 0],
        [92, 92, 255],
        [255, 0, 255],
        [0, 255, 255],
        [255, 255, 255],
    ];

    if (n >= 0 && n <= 15) {
        const [r, g, b] = basic[n] || [255, 255, 255];
        return { r, g, b };
    }

    // 16-231: 6x6x6 color cube
    if (n >= 16 && n <= 231) {
        const idx = n - 16;
        const r = Math.floor(idx / 36);
        const g = Math.floor((idx % 36) / 6);
        const b = idx % 6;
        const steps = [0, 95, 135, 175, 215, 255];
        return { r: steps[r]!, g: steps[g]!, b: steps[b]! };
    }

    // 232-255: grayscale ramp
    const v = 8 + (n - 232) * 10;
    const clamped = Math.max(0, Math.min(255, v));
    return { r: clamped, g: clamped, b: clamped };
}

function rgbToCss(rgb: { r: number; g: number; b: number }) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function classNameForState(state: AnsiStyleState): string {
    const parts: string[] = [];
    if (state.fgClass) parts.push(state.fgClass);
    if (state.bgClass) parts.push(state.bgClass);
    if (state.bold) parts.push("font-semibold");
    if (state.dim) parts.push("opacity-70");
    if (state.underline) parts.push("underline");
    return parts.join(" ");
}

function styleForState(
    state: AnsiStyleState,
): Record<string, string> | undefined {
    const style: Record<string, string> = {};
    if (state.fgColor) style.color = state.fgColor;
    if (state.bgColor) style.backgroundColor = state.bgColor;
    return Object.keys(style).length ? style : undefined;
}

function applyAnsiCodes(
    state: AnsiStyleState,
    codes: number[],
): AnsiStyleState {
    let next = { ...state };
    for (let i = 0; i < codes.length; i += 1) {
        const code = codes[i]!;
        if (code === 0) {
            next = { ...DEFAULT_STATE };
            continue;
        }

        // intensity
        if (code === 1) {
            next.bold = true;
            continue;
        }
        if (code === 2) {
            next.dim = true;
            continue;
        }
        if (code === 22) {
            next.bold = false;
            next.dim = false;
            continue;
        }

        // underline
        if (code === 4) {
            next.underline = true;
            continue;
        }
        if (code === 24) {
            next.underline = false;
            continue;
        }

        // reset foreground
        if (code === 39) {
            next.fgClass = "";
            next.fgColor = "";
            continue;
        }

        // reset background
        if (code === 49) {
            next.bgClass = "";
            next.bgColor = "";
            continue;
        }

        // basic/bright foreground
        if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
            next.fgClass = colorClassFromCode(code);
            next.fgColor = "";
            continue;
        }

        // basic/bright background
        if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
            next.bgClass = bgClassFromCode(code);
            next.bgColor = "";
            continue;
        }

        // extended colors: 38 (fg) / 48 (bg)
        if (code === 38 || code === 48) {
            const isFg = code === 38;
            const mode = codes[i + 1];

            // 256-color: 38;5;n / 48;5;n
            if (mode === 5) {
                const n = codes[i + 2];
                if (typeof n === "number" && Number.isFinite(n)) {
                    const css = rgbToCss(xterm256ToRgb(n));
                    if (isFg) {
                        next.fgClass = "";
                        next.fgColor = css;
                    } else {
                        next.bgClass = "";
                        next.bgColor = css;
                    }
                }
                i += 2;
                continue;
            }

            // truecolor: 38;2;r;g;b / 48;2;r;g;b
            if (mode === 2) {
                const r = codes[i + 2];
                const g = codes[i + 3];
                const b = codes[i + 4];
                if (
                    [r, g, b].every(
                        (v) => typeof v === "number" && Number.isFinite(v),
                    )
                ) {
                    const rr = Math.max(0, Math.min(255, Math.trunc(r!)));
                    const gg = Math.max(0, Math.min(255, Math.trunc(g!)));
                    const bb = Math.max(0, Math.min(255, Math.trunc(b!)));
                    const css = `rgb(${rr}, ${gg}, ${bb})`;
                    if (isFg) {
                        next.fgClass = "";
                        next.fgColor = css;
                    } else {
                        next.bgClass = "";
                        next.bgColor = css;
                    }
                }
                i += 4;
                continue;
            }

            continue;
        }
    }
    return next;
}

const ANSI_RE = /\u001b\[([0-9;]*)m/g;

function normalizeTerminalText(raw: string): string {
    // 1) normalize CRLF/CR to LF
    // 2) collapse multiple consecutive newlines to a single newline
    return String(raw ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n{2,}/g, "\n");
}

export function parseAnsiToSegments(input: string): AnsiSegment[] {
    const text = normalizeTerminalText(String(input ?? ""));
    if (!text) return [];

    const segments: AnsiSegment[] = [];
    let state: AnsiStyleState = { ...DEFAULT_STATE };
    let lastIndex = 0;

    ANSI_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = ANSI_RE.exec(text))) {
        const start = match.index;
        const end = ANSI_RE.lastIndex;

        if (start > lastIndex) {
            segments.push({
                text: text.slice(lastIndex, start),
                className: classNameForState(state),
                style: styleForState(state),
            });
        }

        const rawCodes = match[1] ?? "";
        const codes = rawCodes
            .split(";")
            .filter(Boolean)
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n));

        // per ANSI, empty means reset
        state = applyAnsiCodes(state, codes.length ? codes : [0]);
        lastIndex = end;
    }

    if (lastIndex < text.length) {
        segments.push({
            text: text.slice(lastIndex),
            className: classNameForState(state),
            style: styleForState(state),
        });
    }

    return segments;
}
