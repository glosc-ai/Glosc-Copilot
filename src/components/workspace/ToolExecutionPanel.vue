<template>
    <div
        class="border rounded-md bg-card overflow-hidden transition-all hover:bg-accent/5"
    >
        <div
            class="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 select-none"
            @click="toggleExpanded"
        >
            <div
                class="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0"
            >
                <component
                    :is="getToolIcon()"
                    class="w-4 h-4 text-foreground"
                />
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-sm">{{ toolName }}</span>
                    <span
                        v-if="status === 'running'"
                        class="text-xs text-muted-foreground animate-pulse"
                        >Running...</span
                    >
                </div>
                <div
                    class="text-xs text-muted-foreground truncate font-mono mt-0.5"
                    :title="formatArgs(args)"
                >
                    {{ formatArgs(args) }}
                </div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
                <div
                    v-if="status !== 'pending'"
                    class="flex items-center justify-center w-5 h-5 rounded-full"
                    :class="getStatusClass(true)"
                >
                    <component
                        :is="getStatusIcon()"
                        class="w-3 h-3 text-white dark:text-black"
                        :class="{ 'animate-spin': status === 'running' }"
                    />
                </div>
                <ChevronDown
                    class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                    :class="{ 'rotate-180': expanded }"
                />
            </div>
        </div>

        <div v-if="expanded" class="border-t bg-muted/20 p-3 text-sm">
            <div
                v-if="status === 'running'"
                class="flex items-center gap-2 text-muted-foreground py-2"
            >
                <Loader2 class="w-4 h-4 animate-spin" />
                <span>正在执行工具...</span>
            </div>

            <div v-else-if="status === 'success'" class="space-y-1.5">
                <div
                    class="text-xs font-semibold text-muted-foreground uppercase"
                >
                    结果
                </div>
                <div
                    class="bg-muted/50 rounded-md p-2 overflow-x-auto max-h-[300px] font-mono text-xs whitespace-pre-wrap break-all border"
                >
                    {{ formatResult(result) }}
                </div>
            </div>

            <div v-else-if="status === 'error'" class="space-y-1.5">
                <div class="flex items-center gap-2 text-destructive">
                    <AlertCircle class="w-4 h-4" />
                    <span class="font-medium">执行出错</span>
                </div>
                <div
                    class="bg-destructive/10 text-destructive rounded-md p-2 overflow-x-auto font-mono text-xs whitespace-pre-wrap break-all border border-destructive/20"
                >
                    {{ error }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    FileText,
    FolderOpen,
    Search,
    Edit3,
    Trash2,
    FolderPlus,
    Move,
    CheckCircle2,
    XCircle,
    Loader2,
    ChevronDown,
    AlertCircle,
} from "lucide-vue-next";

const props = defineProps<{
    toolName: string;
    args: Record<string, any>;
    status: "running" | "success" | "error" | "pending";
    result?: any;
    error?: string;
}>();

const expanded = ref(false);

function toggleExpanded() {
    expanded.value = !expanded.value;
}

function getToolIcon() {
    const iconMap: Record<string, any> = {
        read_file: FileText,
        write_file: Edit3,
        edit_file: Edit3,
        list_directory: FolderOpen,
        create_directory: FolderPlus,
        delete_file: Trash2,
        search_files: Search,
        grep_files: Search,
        move_file: Move,
    };
    return iconMap[props.toolName] || FileText;
}

function getStatusIcon() {
    switch (props.status) {
        case "running":
            return Loader2;
        case "success":
            return CheckCircle2;
        case "error":
            return XCircle;
        default:
            return Loader2;
    }
}

function getStatusClass(bg = false) {
    if (bg) {
        switch (props.status) {
            case "running":
                return "bg-blue-500";
            case "success":
                return "bg-green-500";
            case "error":
                return "bg-red-500";
            default:
                return "bg-muted";
        }
    }

    switch (props.status) {
        case "running":
            return "text-blue-500 animate-spin";
        case "success":
            return "text-green-500";
        case "error":
            return "text-red-500";
        default:
            return "text-gray-400";
    }
}

function formatArgs(args: Record<string, any>): string {
    const keys = Object.keys(args);
    if (keys.length === 0) return "";

    const primary = keys[0];
    const value = args[primary];
    const display = typeof value === "string" ? value : JSON.stringify(value);

    if (display.length > 50) {
        return `${display.substring(0, 50)}...`;
    }
    return display;
}

function formatResult(result: any): string {
    if (!result) return "";

    if (typeof result === "string") {
        return result;
    }

    if (result.content && Array.isArray(result.content)) {
        return result.content
            .map((c: any) => c.text || JSON.stringify(c))
            .join("\n");
    }

    return JSON.stringify(result, null, 2);
}
</script>
