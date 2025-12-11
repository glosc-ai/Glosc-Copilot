import { Command, Child } from "@tauri-apps/plugin-shell";

export class TauriStdioTransport {
    private command: string;
    private args: string[];
    private env: Record<string, string>;
    private child: Child | null = null;
    private buffer: string = "";

    public onmessage?: (message: any) => void;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;

    constructor(opts: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
    }) {
        this.command = opts.command;
        this.args = opts.args || [];
        this.env = opts.env || {};
    }

    async start() {
        try {
            const cmd = Command.create(this.command, this.args, {
                env: this.env,
            });

            cmd.on("close", (data) => {
                console.log(
                    `command finished with code ${data.code} and signal ${data.signal}`
                );
                this.onclose?.();
            });

            cmd.on("error", (error) => {
                console.error(`command error: "${error}"`);
                this.onerror?.(new Error(String(error)));
            });

            cmd.stdout.on("data", (line) => {
                this.processOutput(line);
            });

            cmd.stderr.on("data", (line) => {
                console.error(`[${this.command} stderr]: ${line}`);
            });

            this.child = await cmd.spawn();
            console.log("Child process spawned:", this.child.pid);
        } catch (e) {
            console.error("Failed to spawn command:", e);
            throw e;
        }
    }

    private processOutput(data: string) {
        this.buffer += data;
        const lines = this.buffer.split("\n");
        // Keep the last part which might be incomplete
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.onmessage?.(message);
                } catch (e) {
                    console.error("Failed to parse JSON-RPC message:", e, line);
                }
            }
        }
    }

    async send(message: any) {
        if (!this.child) {
            throw new Error("Transport not started");
        }
        const str = JSON.stringify(message) + "\n";
        await this.child.write(str);
    }

    async close() {
        if (this.child) {
            await this.child.kill();
            this.child = null;
        }
    }
}
