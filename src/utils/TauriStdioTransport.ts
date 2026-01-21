import { Command, Child } from "@tauri-apps/plugin-shell";
import { dirname, basename } from "@tauri-apps/api/path";
import { ensureBundledNpmExpanded } from "@/utils/NpmResources";
// import path from "path-browserify";

const utf8Decoder = new TextDecoder("utf-8");

async function ensureBundledNpmExtracted(): Promise<string> {
    const res = await ensureBundledNpmExpanded();
    return res.npxCliPath;
}

function toText(chunk: unknown): string {
    if (typeof chunk === "string") return chunk;
    if (chunk instanceof Uint8Array) {
        // stream=true to avoid breaking multi-byte chars across chunks
        return utf8Decoder.decode(chunk, { stream: true });
    }
    if (Array.isArray(chunk) && chunk.every((c) => c instanceof Uint8Array)) {
        return chunk
            .map((c) => utf8Decoder.decode(c as Uint8Array, { stream: true }))
            .join("");
    }
    return String(chunk);
}

function normalizeCommand(command: string): string {
    return command.trim().toLowerCase();
}

function ensurePythonUnbuffered(args: string[]): string[] {
    // MCP over stdio relies on timely line delivery; Python buffering can break that.
    if (args.some((a) => a === "-u" || a.startsWith("-u"))) return args;
    return ["-u", ...args];
}

function splitCommandLine(commandLine: string): {
    command: string;
    args: string[];
} {
    const text = commandLine.trim();
    if (!text) return { command: "", args: [] };

    const args: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "\\" && i + 1 < text.length && inDouble) {
            // Common escape pattern inside double-quotes
            const next = text[i + 1];
            if (next === '"' || next === "\\") {
                current += next;
                i++;
                continue;
            }
        }

        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if (!inSingle && !inDouble && /\s/.test(ch)) {
            if (current.length > 0) {
                args.push(current);
                current = "";
            }
            continue;
        }

        current += ch;
    }

    if (current.length > 0) args.push(current);

    const [command, ...rest] = args;
    return { command: command ?? "", args: rest };
}

function repairPythonWindowsScriptArgs(
    command: string,
    args: string[],
): string[] {
    const normalized = normalizeCommand(command);
    if (
        normalized !== "python" &&
        normalized !== "python3" &&
        normalized !== "py"
    ) {
        return args;
    }

    // If using `-c` or `-m`, it's not a script path.
    if (args.includes("-c") || args.includes("-m")) return args;

    // Heuristic: when users provide a Windows path with spaces without quotes,
    // our splitter will break it into multiple args. Re-join the script path
    // by locating a .py/.pyw token and joining from the first non-flag token.
    const scriptStart = args.findIndex(
        (a) => a.length > 0 && !a.startsWith("-"),
    );
    if (scriptStart === -1) return args;

    const scriptEnd = args.findIndex(
        (a, idx) => idx >= scriptStart && /\.pyw?$/i.test(a),
    );
    if (scriptEnd === -1) return args;

    if (scriptEnd === scriptStart) return args;

    const joinedScript = args.slice(scriptStart, scriptEnd + 1).join(" ");
    return [
        ...args.slice(0, scriptStart),
        joinedScript,
        ...args.slice(scriptEnd + 1),
    ];
}

function isNodeCommand(command: string): boolean {
    const normalized = normalizeCommand(command);
    if (normalized === "node" || normalized === "node.exe") return true;
    // Also allow absolute paths like C:\Program Files\nodejs\node.exe
    return /(^|[\\/])node(\.exe)?$/i.test(command.trim());
}

function repairNodeWindowsScriptArgs(
    command: string,
    args: string[],
): string[] {
    if (!isNodeCommand(command)) return args;

    // If using eval/print, it's not a script path.
    const hasInlineCode = args.some((a) =>
        ["-e", "-p", "--eval", "--print"].includes(a),
    );
    if (hasInlineCode) return args;

    // Do not touch when user explicitly uses -c (not a Node flag) but keep future-proof.

    // Heuristic: when users provide a Windows path with spaces without quotes,
    // upstream may split it into multiple args. Re-join the script path by locating
    // the first token that looks like a JS/TS entry file.
    const scriptStart = args.findIndex(
        (a) => a.length > 0 && !a.startsWith("-"),
    );
    if (scriptStart === -1) return args;

    const scriptEnd = args.findIndex(
        (a, idx) => idx >= scriptStart && /\.(c|m)?jsx?$|\.tsx?$/i.test(a),
    );
    if (scriptEnd === -1) return args;
    if (scriptEnd === scriptStart) return args;

    const joinedScript = args.slice(scriptStart, scriptEnd + 1).join(" ");
    return [
        ...args.slice(0, scriptStart),
        joinedScript,
        ...args.slice(scriptEnd + 1),
    ];
}

class ReadBuffer {
    private buffer: string = "";

    append(chunk: string) {
        this.buffer += chunk;
    }

    readMessage(): any | null {
        while (true) {
            const index = this.buffer.indexOf("\n");
            if (index === -1) {
                return null;
            }

            let line = this.buffer.slice(0, index);
            this.buffer = this.buffer.slice(index + 1);

            // Handle CRLF
            if (line.endsWith("\r")) line = line.slice(0, -1);

            if (!line.trim()) {
                // Skip empty lines
                continue;
            }

            return JSON.parse(line);
        }
    }

    clear() {
        this.buffer = "";
    }
}

function serializeMessage(message: any): string {
    return JSON.stringify(message) + "\n";
}

export class TauriStdioTransport {
    private _serverParams: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
    };
    private _process: Child | null = null;
    private _readBuffer: ReadBuffer = new ReadBuffer();

    public onmessage?: (message: any) => void;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;

    constructor(server: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
    }) {
        this._serverParams = server;
    }

    /**
     * The child process pid spawned by this transport.
     */
    get pid() {
        return this._process?.pid ?? null;
    }

    async start() {
        if (this._process) {
            throw new Error("TauriStdioTransport already started!");
        }

        try {
            let cmd: any;
            let { command, args = [], env, cwd } = this._serverParams;

            // Normalize trivial whitespace early (avoids confusing logs like "node ").
            command = command.trim();

            if ((!args || args.length === 0) && /\s/.test(command.trim())) {
                const parsed = splitCommandLine(command);
                if (parsed.command) {
                    command = parsed.command;
                    args = parsed.args;
                }
            }

            // Always repair python script path even when args are provided separately
            // (e.g. UI split by spaces, resulting in ["...\\new", "tools\\main.py"]).
            args = repairPythonWindowsScriptArgs(command, args);

            // Also repair node script path on Windows when args were split by spaces.
            // Example: ["E:\\...\\new", "tools\\dist\\index.js"] -> ["E:\\...\\new tools\\dist\\index.js"].
            args = repairNodeWindowsScriptArgs(command, args);

            const normalized = normalizeCommand(command);
            // If env is empty, pass undefined to inherit from parent process
            const cmdEnv = env && Object.keys(env).length > 0 ? env : undefined;

            if (normalized === "npx") {
                // Use sidecar node to run npx-cli.js
                const npxPath = await ensureBundledNpmExtracted();
                console.log("Resolved npx path:", npxPath);
                cmd = Command.sidecar("binaries/node", [npxPath, ...args], {
                    cwd,
                    env: cmdEnv,
                });
            } else if (normalized === "node") {
                cmd = Command.sidecar("binaries/node", args, {
                    cwd,
                    env: cmdEnv,
                });
            } else if (
                normalized === "python" ||
                normalized === "python3" ||
                normalized === "py"
            ) {
                // Prefer an embedded Python sidecar when available.
                // If your bundle does not include it, fallback to system python.
                const pythonArgs = ensurePythonUnbuffered(args);

                const pythonEnv: Record<string, string> | undefined = cmdEnv
                    ? { ...cmdEnv, PYTHONUNBUFFERED: "1" }
                    : { PYTHONUNBUFFERED: "1" };

                try {
                    const scriptPath = args[0];
                    if (!scriptPath)
                        throw new Error("Missing python script path");

                    const file_dirname = await dirname(scriptPath);
                    const file_basename = await basename(scriptPath);
                    const scriptArgs = args.slice(1);
                    // console.log([
                    //     "--directory",
                    //     file_dirname,
                    //     "run",
                    //     file_basename,
                    // ]);

                    cmd = Command.sidecar(
                        "binaries/uv",
                        [
                            "--directory",
                            file_dirname,
                            "run",
                            file_basename,
                            ...scriptArgs,
                        ],
                        {
                            cwd,
                            env: pythonEnv,
                        },
                    );
                } catch {
                    cmd = Command.create(command, pythonArgs, {
                        cwd,
                        env: pythonEnv,
                    });
                }
            } else if (normalized === "uvx") {
                // uvx is an alias for: uv tool run ...
                try {
                    cmd = Command.sidecar(
                        "binaries/uv",
                        ["tool", "run", ...args],
                        {
                            cwd,
                            env: cmdEnv,
                        },
                    );
                } catch {
                    cmd = Command.create("uvx", args, {
                        cwd,
                        env: cmdEnv,
                    });
                }
            } else if (normalized === "uv") {
                try {
                    cmd = Command.sidecar("binaries/uv", args, {
                        cwd,
                        env: cmdEnv,
                    });
                } catch {
                    cmd = Command.create("uv", args, {
                        cwd,
                        env: cmdEnv,
                    });
                }
            } else {
                cmd = Command.create(command, args, {
                    cwd,
                    env: cmdEnv,
                });
            }

            cmd.on("close", (data: any) => {
                console.log(
                    `command finished with code ${data.code} and signal ${data.signal}`,
                );
                this._process = null;
                this.onclose?.();
            });

            cmd.on("error", (error: any) => {
                console.log(`command error: "${error}"`);
                this.onerror?.(new Error(String(error)));
            });

            cmd.stdout.on("data", (line: any) => {
                this._readBuffer.append(toText(line));
                this.processReadBuffer();
            });

            cmd.stderr.on("data", (line: any) => {
                console.log(`[${command} stderr]: ${toText(line)}`);
            });

            this._process = await cmd.spawn();
            console.log("Child process spawned:", this._process?.pid);
        } catch (e) {
            console.log("Failed to spawn command:", e);
            this.onerror?.(e as Error);
            throw e;
        }
    }

    private processReadBuffer() {
        while (true) {
            try {
                const message = this._readBuffer.readMessage();
                if (message === null) {
                    break;
                }
                console.log("[TauriStdioTransport] Received:", message);
                this.onmessage?.(message);
            } catch (error) {
                console.log(
                    "[TauriStdioTransport] Error processing message:",
                    error,
                );
                this.onerror?.(error as Error);
            }
        }
    }

    async send(message: any) {
        if (!this._process) {
            throw new Error("Not connected");
        }
        console.log("[TauriStdioTransport] Sending:", message);
        const json = serializeMessage(message);
        await this._process.write(json);
    }

    async close() {
        if (this._process) {
            await this._process.kill();
            this._process = null;
        }
        this._readBuffer.clear();
    }
}
