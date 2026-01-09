import { Command, Child } from "@tauri-apps/plugin-shell";
import { resolveResource } from "@tauri-apps/api/path";

const utf8Decoder = new TextDecoder("utf-8");

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
            const { command, args = [], env, cwd } = this._serverParams;
            const normalized = normalizeCommand(command);
            // If env is empty, pass undefined to inherit from parent process
            const cmdEnv = env && Object.keys(env).length > 0 ? env : undefined;

            if (normalized === "npx") {
                // Use sidecar node to run npx-cli.js
                const npxPath = await resolveResource(
                    "resources/npm/bin/npx-cli.js"
                );
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
                try {
                    cmd = Command.sidecar("binaries/python", pythonArgs, {
                        cwd,
                        env: cmdEnv,
                    });
                } catch {
                    cmd = Command.create(command, pythonArgs, {
                        cwd,
                        env: cmdEnv,
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
                        }
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
                    `command finished with code ${data.code} and signal ${data.signal}`
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
                    error
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
