<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
    Terminal,
    TerminalActions,
    TerminalClearButton,
    TerminalContent,
    TerminalCopyButton,
    TerminalHeader,
    TerminalStatus,
    TerminalTitle,
} from "@/components/ai-elements/terminal";

import { readDir } from "@tauri-apps/plugin-fs";
import { Command, type Child } from "@tauri-apps/plugin-shell";
import { nanoid } from "nanoid";

import { Plus, X, Square } from "lucide-vue-next";

type OutputKind = "stdout" | "stderr" | "system" | "input";

type OutputItem = {
    id: string;
    kind: OutputKind;
    text: string;
};

type ShellName = "pwsh" | "powershell" | "cmd";

type CompletionKind = "history" | "command" | "path";

type CompletionItem = {
    id: string;
    kind: CompletionKind;
    label: string;
    insertText: string;
};

type TerminalTab = {
    id: string;
    title: string;
    shell: ShellName;
    cwd?: string;

    input: string;
    output: OutputItem[];

    history: string[];
    historyIndex: number; // points to "virtual" item after the last

    command?: Command<string>;
    child?: Child;
    alive: boolean;
};

const props = withDefaults(
    defineProps<{
        cwd?: string | null;
    }>(),
    {
        cwd: null,
    },
);

const tabs = ref<TerminalTab[]>([]);
const activeId = ref<string | null>(null);

const activeTab = computed(() =>
    activeId.value ? tabs.value.find((t) => t.id === activeId.value) : null,
);

const activeInput = computed({
    get() {
        return activeTab.value?.input ?? "";
    },
    set(v: string) {
        const tab = activeTab.value;
        if (!tab) return;
        tab.input = v;
    },
});

const completionOpen = ref(false);
const completionItems = ref<CompletionItem[]>([]);
const completionIndex = ref(0);
const completionLoading = ref(false);

const cwdCache = new Map<
    string,
    { ts: number; entries: { name: string; isDirectory: boolean }[] }
>();

let completionTimer: number | null = null;

function newlineForShell() {
    // cmd/powershell on Windows expect CRLF; for safety use CRLF for all.
    return "\r\n";
}

function displayCwd(cwd?: string) {
    if (!cwd) return "";
    // keep it compact like VS Code: show last segment when possible
    const normalized = cwd.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : cwd;
}

const promptText = computed(() => {
    const tab = activeTab.value;
    if (!tab) return "";
    const shellLabel = tab.shell === "cmd" ? "CMD" : "PS";
    const cwdLabel = tab.cwd ? displayCwd(tab.cwd) : "";
    return cwdLabel ? `${shellLabel} ${cwdLabel}>` : `${shellLabel}>`;
});

function splitForCompletion(input: string) {
    const lastWs = Math.max(input.lastIndexOf(" "), input.lastIndexOf("\t"));
    if (lastWs < 0) return { head: "", tail: input };
    return { head: input.slice(0, lastWs + 1), tail: input.slice(lastWs + 1) };
}

function normalizePrefix(s: string) {
    return s.trimStart();
}

function uniqueByLabel(items: CompletionItem[]) {
    const seen = new Set<string>();
    const out: CompletionItem[] = [];
    for (const it of items) {
        const key = `${it.kind}|${it.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}

function commonCommandsForShell(shell: ShellName) {
    if (shell === "cmd") {
        return [
            "dir",
            "cd",
            "cls",
            "echo",
            "type",
            "copy",
            "move",
            "del",
            "rmdir",
            "mkdir",
            "ren",
            "where",
            "findstr",
            "set",
            "chcp",
            "powershell",
            "pwsh",
            "git",
            "node",
            "npm",
            "yarn",
            "python",
        ];
    }
    // pwsh/powershell
    return [
        "ls",
        "cd",
        "pwd",
        "cat",
        "echo",
        "clear",
        "cls",
        "mkdir",
        "rm",
        "mv",
        "cp",
        "git",
        "yarn",
        "npm",
        "pnpm",
        "node",
        "python",
        "pip",
        "uv",
        "uvx",
        "cargo",
        "rustc",
        "go",
        "dotnet",
        "java",
        "docker",
        "kubectl",
        "terraform",
    ];
}

function isLikelyPathToken(token: string) {
    return (
        token.startsWith("./") ||
        token.startsWith("../") ||
        token.startsWith(".\\") ||
        token.startsWith("..\\") ||
        token.includes("/") ||
        token.includes("\\") ||
        token.startsWith('"')
    );
}

async function listCwdEntries(cwd: string) {
    const cached = cwdCache.get(cwd);
    const now = Date.now();
    if (cached && now - cached.ts < 2000) return cached.entries;

    const entries = await readDir(cwd);
    const simplified = entries
        .map((e) => ({
            name: e.name ?? "",
            isDirectory: Boolean(e.isDirectory),
        }))
        .filter((e) => e.name);

    cwdCache.set(cwd, { ts: now, entries: simplified });
    return simplified;
}

async function computeCompletions() {
    const tab = activeTab.value;
    if (!tab) {
        completionItems.value = [];
        completionOpen.value = false;
        return;
    }

    const input = tab.input ?? "";
    const { head, tail } = splitForCompletion(input);
    const trimmedTail = normalizePrefix(tail);

    if (!input || (!trimmedTail && !head)) {
        completionItems.value = [];
        completionOpen.value = false;
        return;
    }

    const prefixLower = trimmedTail.toLowerCase();
    const out: CompletionItem[] = [];

    // 1) history suggestions (full command)
    if (!head) {
        for (let i = tab.history.length - 1; i >= 0; i--) {
            const h = tab.history[i] ?? "";
            if (!h) continue;
            if (prefixLower && !h.toLowerCase().startsWith(prefixLower))
                continue;
            out.push({
                id: nanoid(),
                kind: "history",
                label: h,
                insertText: h,
            });
            if (out.length >= 10) break;
        }
    }

    // 2) common command suggestions (first token only)
    if (!head && trimmedTail && !isLikelyPathToken(trimmedTail)) {
        const cmds = commonCommandsForShell(tab.shell);
        for (const c of cmds) {
            if (!c.toLowerCase().startsWith(prefixLower)) continue;
            out.push({
                id: nanoid(),
                kind: "command",
                label: c,
                insertText: c,
            });
        }
    }

    // 3) cwd path suggestions (best-effort)
    if (tab.cwd && trimmedTail && isLikelyPathToken(trimmedTail)) {
        completionLoading.value = true;
        try {
            const token = trimmedTail;
            const quoted = token.startsWith('"');
            const raw = quoted ? token.slice(1) : token;
            const matchPrefix = raw.replace(/^\.[\\/]/, "");
            const entries = await listCwdEntries(tab.cwd);

            const filtered = entries
                .filter((e) =>
                    e.name.toLowerCase().startsWith(matchPrefix.toLowerCase()),
                )
                .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));

            for (const e of filtered.slice(0, 20)) {
                const label = e.isDirectory ? `${e.name}/` : e.name;
                const insert = quoted
                    ? `\"${e.name}${e.isDirectory ? "/" : ""}`
                    : `${e.name}${e.isDirectory ? "/" : ""}`;
                out.push({
                    id: nanoid(),
                    kind: "path",
                    label,
                    insertText: head + insert,
                });
            }
        } finally {
            completionLoading.value = false;
        }
    }

    const finalItems = uniqueByLabel(out).slice(0, 20);
    completionItems.value = finalItems;
    completionIndex.value = 0;
    completionOpen.value = finalItems.length > 0;
}

function scheduleCompletions() {
    if (completionTimer) {
        window.clearTimeout(completionTimer);
        completionTimer = null;
    }
    completionTimer = window.setTimeout(() => {
        completionTimer = null;
        void computeCompletions();
    }, 120);
}

function closeCompletions() {
    completionOpen.value = false;
    completionItems.value = [];
    completionIndex.value = 0;
    completionLoading.value = false;
}

function acceptCompletion(index = completionIndex.value) {
    const tab = activeTab.value;
    if (!tab) return;
    const item = completionItems.value[index];
    if (!item) return;

    if (item.kind === "path") {
        tab.input = item.insertText;
    } else {
        // replace first token only
        const { head } = splitForCompletion(tab.input ?? "");
        tab.input = head ? tab.input : item.insertText;
    }
    closeCompletions();
    nextTick(() => scheduleCompletions());
}

function clampOutput(items: OutputItem[]) {
    const MAX_ITEMS = 2000;
    if (items.length <= MAX_ITEMS) return items;
    return items.slice(items.length - MAX_ITEMS);
}

function appendOutput(tabId: string, kind: OutputKind, text: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    const chunks = String(text ?? "").split(/\r?\n/);
    // keep empty tail? VS Code shows blank line; preserve by pushing empty when original ended with newline
    const endedWithNewline = /\r?\n$/.test(String(text ?? ""));

    for (let i = 0; i < chunks.length; i++) {
        const line = chunks[i];
        if (line === "" && i === chunks.length - 1 && !endedWithNewline)
            continue;
        tab.output.push({ id: nanoid(), kind, text: line });
    }

    tab.output = clampOutput(tab.output);
}

function outputItemsToAnsi(items: OutputItem[]) {
    const lines: string[] = [];
    for (const it of items) {
        const text = String(it.text ?? "");

        if (it.kind === "stderr") {
            lines.push(`\x1b[31m${text}\x1b[0m`);
            continue;
        }
        if (it.kind === "system") {
            lines.push(`\x1b[90m${text}\x1b[0m`);
            continue;
        }
        if (it.kind === "input") {
            lines.push(`\x1b[36m> ${text}\x1b[0m`);
            continue;
        }

        // stdout
        lines.push(text);
    }
    return lines.join("\n");
}

const activeAnsiOutput = computed(() => {
    const tab = activeTab.value;
    if (!tab) return "";
    return outputItemsToAnsi(tab.output);
});

function clearActiveOutput() {
    const tab = activeTab.value;
    if (!tab) return;
    clearOutput(tab.id);
}

async function trySpawnShell(shell: ShellName, tabId: string, cwd?: string) {
    // Windows 上常见乱码原因：cmd / powershell 默认输出并非 UTF-8。
    // 这里在启动时就把输出编码切到 UTF-8，再用 plugin-shell 以 utf-8 解码。
    const setUtf8Ps =
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;" +
        "[Console]::InputEncoding=[System.Text.Encoding]::UTF8;" +
        "$OutputEncoding=[Console]::OutputEncoding;";

    const argsByShell: Record<ShellName, string[]> = {
        // -NoExit 让其执行初始化后进入交互模式
        pwsh: ["-NoLogo", "-NoExit", "-Command", setUtf8Ps],
        powershell: ["-NoLogo", "-NoExit", "-Command", setUtf8Ps],
        // /K 执行后保持交互；>nul 避免污染输出
        cmd: ["/Q", "/K", "chcp 65001>nul"],
    };

    const cmd = Command.create(shell, argsByShell[shell], {
        cwd,
        encoding: "utf-8",
    });

    cmd.on("error", (e) => {
        appendOutput(tabId, "system", `error: ${String(e)}`);
    });

    cmd.on("close", (data) => {
        const tab = tabs.value.find((t) => t.id === tabId);
        if (tab) tab.alive = false;
        appendOutput(
            tabId,
            "system",
            `process exited (code=${data.code}, signal=${data.signal})`,
        );
    });

    cmd.stdout.on("data", (line) => {
        appendOutput(tabId, "stdout", String(line));
    });

    cmd.stderr.on("data", (line) => {
        appendOutput(tabId, "stderr", String(line));
    });

    const child = await cmd.spawn();
    return { cmd, child };
}

async function createTerminal(
    shellPreference: ShellName[] = ["pwsh", "powershell", "cmd"],
) {
    const cwd = props.cwd ?? undefined;

    const tab: TerminalTab = {
        id: nanoid(),
        title: `终端 ${tabs.value.length + 1}`,
        shell: "cmd",
        cwd,
        input: "",
        output: [],
        history: [],
        historyIndex: 0,
        alive: false,
    };

    tabs.value = [...tabs.value, tab];
    activeId.value = tab.id;

    for (const shell of shellPreference) {
        try {
            appendOutput(tab.id, "system", `starting ${shell}...`);
            const { cmd, child } = await trySpawnShell(shell, tab.id, cwd);
            tab.shell = shell;
            tab.command = cmd;
            tab.child = child;
            tab.alive = true;
            appendOutput(tab.id, "system", `pid: ${child.pid}`);
            return;
        } catch (e: any) {
            appendOutput(
                tab.id,
                "system",
                `failed to start ${shell}: ${e?.message ?? String(e)}`,
            );
        }
    }

    appendOutput(
        tab.id,
        "system",
        "无法启动任何 shell（请检查 capabilities 与系统环境）",
    );
}

async function ensureAtLeastOneTerminal() {
    if (tabs.value.length > 0) return;
    await createTerminal();
}

async function runCurrentInput() {
    const tab = activeTab.value;
    if (!tab) return;
    const cmd = (tab.input || "").trimEnd();
    if (!cmd) return;

    if (!tab.child || !tab.alive) {
        appendOutput(tab.id, "system", "shell 未运行，正在重新启动...");
        await restartTerminal(tab.id);
    }

    if (!tab.child || !tab.alive) {
        appendOutput(tab.id, "system", "shell 启动失败，无法执行");
        return;
    }

    appendOutput(tab.id, "input", cmd);

    tab.history.push(cmd);
    tab.historyIndex = tab.history.length;

    tab.input = "";
    closeCompletions();

    try {
        await tab.child.write(cmd + newlineForShell());
    } catch (e: any) {
        appendOutput(
            tab.id,
            "system",
            `write failed: ${e?.message ?? String(e)}`,
        );
    }
}

async function stopTerminal(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.child || !tab.alive) return;

    try {
        await tab.child.kill();
    } catch (e: any) {
        appendOutput(
            tab.id,
            "system",
            `kill failed: ${e?.message ?? String(e)}`,
        );
    }
}

async function restartTerminal(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    await stopTerminal(tabId);

    // re-create a fresh Command/Child
    tab.command = undefined;
    tab.child = undefined;
    tab.alive = false;

    const cwd = props.cwd ?? undefined;

    for (const shell of ["pwsh", "powershell", "cmd"] as ShellName[]) {
        try {
            appendOutput(tab.id, "system", `restarting ${shell}...`);
            const { cmd, child } = await trySpawnShell(shell, tab.id, cwd);
            tab.shell = shell;
            tab.command = cmd;
            tab.child = child;
            tab.alive = true;
            appendOutput(tab.id, "system", `pid: ${child.pid}`);
            return;
        } catch (e: any) {
            appendOutput(
                tab.id,
                "system",
                `failed to restart ${shell}: ${e?.message ?? String(e)}`,
            );
        }
    }
}

async function closeTerminal(tabId: string) {
    const idx = tabs.value.findIndex((t) => t.id === tabId);
    if (idx < 0) return;

    await stopTerminal(tabId);

    const nextTabs = tabs.value.slice();
    nextTabs.splice(idx, 1);
    tabs.value = nextTabs;

    if (activeId.value === tabId) {
        activeId.value = tabs.value[idx - 1]?.id ?? tabs.value[0]?.id ?? null;
    }

    if (tabs.value.length === 0) {
        await ensureAtLeastOneTerminal();
    }
}

function clearOutput(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;
    tab.output = [];
}

function onInputKeydown(e: KeyboardEvent) {
    const tab = activeTab.value;
    if (!tab) return;

    if (e.key === "Escape") {
        if (completionOpen.value) {
            e.preventDefault();
            closeCompletions();
        }
        return;
    }

    if (e.key === "Tab") {
        if (completionItems.value.length > 0) {
            e.preventDefault();
            acceptCompletion();
            return;
        }
        // no items yet: trigger once
        e.preventDefault();
        void computeCompletions();
        return;
    }

    if (completionOpen.value && completionItems.value.length > 0) {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            completionIndex.value =
                (completionIndex.value - 1 + completionItems.value.length) %
                completionItems.value.length;
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            completionIndex.value =
                (completionIndex.value + 1) % completionItems.value.length;
            return;
        }
    }

    if (e.key === "Enter") {
        e.preventDefault();
        void runCurrentInput();
        return;
    }

    // history navigation
    if (e.key === "ArrowUp") {
        if (tab.history.length === 0) return;
        e.preventDefault();
        tab.historyIndex = Math.max(0, tab.historyIndex - 1);
        tab.input = tab.history[tab.historyIndex] ?? "";
        scheduleCompletions();
        return;
    }
    if (e.key === "ArrowDown") {
        if (tab.history.length === 0) return;
        e.preventDefault();
        tab.historyIndex = Math.min(tab.history.length, tab.historyIndex + 1);
        tab.input =
            tab.historyIndex >= tab.history.length
                ? ""
                : (tab.history[tab.historyIndex] ?? "");
        scheduleCompletions();
    }
}

function onInputFocus() {
    scheduleCompletions();
}

watch(
    () => activeTab.value?.input,
    () => {
        scheduleCompletions();
    },
);

onMounted(() => {
    void ensureAtLeastOneTerminal();
});

watch(
    () => activeId.value,
    () => {
        closeCompletions();
    },
);

onBeforeUnmount(() => {
    // best-effort: kill all child processes
    for (const t of tabs.value) {
        if (t.child && t.alive) {
            void t.child.kill();
        }
    }
});
</script>

<template>
    <div class="h-full w-full flex flex-col overflow-hidden">
        <Terminal
            class="flex-1 min-h-0"
            :output="activeAnsiOutput"
            :is-streaming="Boolean(activeTab?.alive)"
            :auto-scroll="true"
            :on-clear="clearActiveOutput"
        >
            <TerminalHeader class="px-0 py-0">
                <div class="w-full flex flex-col">
                    <!-- Tabs bar -->
                    <div
                        class="h-9 border-b flex items-center gap-2 px-2 bg-muted/10"
                    >
                        <div class="flex items-center gap-1 overflow-auto">
                            <button
                                v-for="t in tabs"
                                :key="t.id"
                                class="h-7 px-2 rounded-md text-xs flex items-center gap-2 border transition-colors"
                                :class="
                                    t.id === activeId
                                        ? 'bg-background border-border'
                                        : 'bg-transparent border-transparent hover:bg-accent/50'
                                "
                                @click="activeId = t.id"
                                type="button"
                            >
                                <span class="max-w-40 truncate">{{
                                    t.title
                                }}</span>
                                <span
                                    class="text-[10px] text-muted-foreground"
                                    >{{ t.shell }}</span
                                >
                                <span
                                    class="text-[10px]"
                                    :class="
                                        t.alive
                                            ? 'text-emerald-500'
                                            : 'text-muted-foreground'
                                    "
                                    >●</span
                                >
                                <button
                                    class="rounded hover:bg-accent p-0.5"
                                    type="button"
                                    title="关闭"
                                    @click.stop="closeTerminal(t.id)"
                                >
                                    <X class="w-3 h-3" />
                                </button>
                            </button>
                        </div>

                        <div class="flex-1" />

                        <TerminalStatus class="hidden sm:inline-flex" />

                        <TerminalActions>
                            <TerminalCopyButton />
                            <TerminalClearButton />
                            <Button
                                size="sm"
                                variant="outline"
                                class="h-7 px-2 ml-1"
                                @click="createTerminal()"
                            >
                                <Plus class="w-4 h-4" />
                                新建
                            </Button>
                        </TerminalActions>
                    </div>

                    <!-- Toolbar -->
                    <div class="h-9 border-b flex items-center gap-2 px-2">
                        <TerminalTitle class="text-xs text-muted-foreground">
                            {{ activeTab?.cwd ? `cwd: ${activeTab.cwd}` : "" }}
                        </TerminalTitle>
                        <div class="flex-1" />
                        <Button
                            size="sm"
                            variant="outline"
                            class="h-7 px-2"
                            :disabled="!activeTab"
                            @click="activeTab && restartTerminal(activeTab.id)"
                        >
                            重启
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            class="h-7 px-2"
                            :disabled="!activeTab || !activeTab.alive"
                            @click="activeTab && stopTerminal(activeTab.id)"
                        >
                            <Square class="w-4 h-4" />
                            停止
                        </Button>
                    </div>
                </div>
            </TerminalHeader>

            <TerminalContent>
                <div v-if="!activeTab" class="text-muted-foreground">
                    没有可用终端
                </div>
            </TerminalContent>

            <!-- Input -->
            <div class="shrink-0 border-t p-2 flex items-center gap-2">
                <div class="flex-1 flex items-center gap-2 relative min-w-0">
                    <div
                        class="shrink-0 text-xs text-muted-foreground font-mono select-none"
                        :title="activeTab?.cwd ? String(activeTab.cwd) : ''"
                    >
                        {{ promptText }}
                    </div>

                    <!-- Completion dropdown -->
                    <div
                        v-if="activeTab && completionOpen"
                        class="absolute left-0 right-0 bottom-full mb-1 border rounded-md bg-popover shadow-md overflow-hidden"
                    >
                        <div
                            v-if="completionLoading"
                            class="px-2 py-1 text-xs text-muted-foreground"
                        >
                            正在加载补全...
                        </div>
                        <button
                            v-for="(it, idx) in completionItems"
                            :key="it.id"
                            type="button"
                            class="w-full text-left px-2 py-1 text-xs font-mono flex items-center gap-2"
                            :class="
                                idx === completionIndex
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/60'
                            "
                            @mousedown.prevent
                            @click="acceptCompletion(idx)"
                        >
                            <span
                                class="text-[10px] px-1 rounded border text-muted-foreground"
                                >{{ it.kind }}</span
                            >
                            <span class="truncate">{{ it.label }}</span>
                        </button>
                    </div>

                    <Input
                        v-model="activeInput"
                        :disabled="!activeTab"
                        placeholder="输入命令，回车执行（Tab 补全，↑↓ 选择/历史）"
                        class="h-8 font-mono flex-1 min-w-0"
                        @keydown="onInputKeydown"
                        @focus="onInputFocus"
                    />
                </div>
                <Button
                    size="sm"
                    class="h-8"
                    :disabled="!activeTab"
                    @click="runCurrentInput"
                >
                    执行
                </Button>
            </div>
        </Terminal>
    </div>
</template>
