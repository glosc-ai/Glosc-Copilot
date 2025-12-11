import { Command, Child } from "@tauri-apps/plugin-shell";
import { resolveResource } from "@tauri-apps/api/path";

class ReadBuffer {
    private buffer: string = "";

    append(chunk: string) {
        this.buffer += chunk;
    }

    readMessage(): any | null {
        const index = this.buffer.indexOf("\n");
        if (index === -1) {
            return null;
        }
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (line.trim()) {
            return JSON.parse(line);
        }
        return this.readMessage();
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
            // If env is empty, pass undefined to inherit from parent process
            const cmdEnv = env && Object.keys(env).length > 0 ? env : undefined;

            if (command === "npx") {
                // Use sidecar node to run npx-cli.js
                const npxPath = await resolveResource(
                    "resources/npm/bin/npx-cli.js"
                );
                console.log("Resolved npx path:", npxPath);
                cmd = Command.sidecar("binaries/node", [npxPath, ...args], {
                    cwd,
                    env: cmdEnv,
                });
            } else if (command === "node") {
                cmd = Command.sidecar("binaries/node", args, {
                    cwd,
                    env: cmdEnv,
                });
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
                console.error(`command error: "${error}"`);
                this.onerror?.(new Error(String(error)));
            });

            cmd.stdout.on("data", (line: any) => {
                this._readBuffer.append(line);
                this.processReadBuffer();
            });

            cmd.stderr.on("data", (line: any) => {
                console.error(`[${command} stderr]: ${line}`);
            });

            this._process = await cmd.spawn();
            console.log("Child process spawned:", this._process?.pid);
        } catch (e) {
            console.error("Failed to spawn command:", e);
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
                console.error(
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
