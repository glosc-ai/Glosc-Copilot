<template>
    <div class="flex flex-col h-full bg-card rounded-lg border shadow-sm">
        <div class="flex items-center justify-between p-4 border-b bg-muted/40">
            <div class="flex items-center gap-2">
                <div class="p-1.5 bg-primary/10 rounded-md">
                    <ListChecks class="w-4 h-4 text-primary" />
                </div>
                <h3 class="font-semibold text-sm">任务计划</h3>
            </div>
            <div
                class="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                :class="getStatusBadgeClass()"
            >
                {{ getStatusText() }}
            </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
            <div class="relative pl-6 space-y-6">
                <!-- Timeline Vertical Line -->
                <div
                    class="absolute left-2.5 top-3 bottom-3 w-px bg-border"
                    aria-hidden="true"
                ></div>

                <div
                    v-for="(step, index) in steps"
                    :key="index"
                    class="relative"
                    :class="{
                        'opacity-50 grayscale':
                            step.status === 'pending' && status !== 'planning',
                    }"
                >
                    <!-- Step Number / Icon -->
                    <div
                        class="absolute -left-[23px] bg-background flex items-center justify-center w-5 h-5 rounded-full border ring-4 ring-background z-10 transition-colors"
                        :class="getStepIconClass(step, true)"
                    >
                        <component
                            :is="getStepIcon(step)"
                            class="w-3 h-3"
                            :class="getStepIconClass(step)"
                        />
                    </div>

                    <div class="space-y-2 pt-0.5">
                        <div class="flex items-center justify-between gap-4">
                            <div
                                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                {{ step.title }}
                            </div>
                        </div>

                        <div
                            v-if="step.description"
                            class="text-xs text-muted-foreground"
                        >
                            {{ step.description }}
                        </div>

                        <!-- Tool executions for this step -->
                        <div
                            v-if="step.tools && step.tools.length > 0"
                            class="space-y-2 mt-3 pt-2 pl-2 border-l-2 border-dashed border-muted ml-0.5"
                        >
                            <ToolExecutionPanel
                                v-for="(tool, toolIndex) in step.tools"
                                :key="toolIndex"
                                :tool-name="tool.name"
                                :args="tool.args"
                                :status="tool.status"
                                :result="tool.result"
                                :error="tool.error"
                            />
                        </div>

                        <div
                            v-if="step.status === 'running'"
                            class="flex items-center gap-2 text-xs text-primary animate-pulse pt-1"
                        >
                            <Loader2 class="w-3 h-3 animate-spin" />
                            <span>执行中...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="status === 'completed'"
            class="p-3 border-t bg-green-50/50 dark:bg-green-900/20 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 justify-center"
        >
            <CheckCircle2 class="w-4 h-4" />
            <span>所有任务已完成</span>
        </div>

        <div
            v-else-if="status === 'failed'"
            class="p-3 border-t bg-red-50/50 dark:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 justify-center"
        >
            <XCircle class="w-4 h-4" />
            <span>任务执行失败</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ListChecks,
    CheckCircle2,
    Circle,
    Loader2,
    XCircle,
} from "lucide-vue-next";
import ToolExecutionPanel from "./ToolExecutionPanel.vue";

export interface TaskStep {
    title: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed";
    tools?: Array<{
        name: string;
        args: Record<string, any>;
        status: "running" | "success" | "error" | "pending";
        result?: any;
        error?: string;
    }>;
}

const props = defineProps<{
    steps: TaskStep[];
    status: "planning" | "running" | "completed" | "failed";
}>();

function getStatusText(): string {
    switch (props.status) {
        case "planning":
            return "规划中";
        case "running":
            return "执行中";
        case "completed":
            return "已完成";
        case "failed":
            return "失败";
        default:
            return "";
    }
}

function getStatusBadgeClass(): string {
    switch (props.status) {
        case "planning":
            return "bg-secondary text-secondary-foreground border-transparent";
        case "running":
            return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
        case "completed":
            return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
        case "failed":
            return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
        default:
            return "bg-muted text-muted-foreground";
    }
}

function getStepIcon(step: TaskStep) {
    switch (step.status) {
        case "completed":
            return CheckCircle2;
        case "running":
            return Loader2;
        case "failed":
            return XCircle;
        default:
            return Circle;
    }
}

function getStepIconClass(step: TaskStep, border = false) {
    if (border) {
        switch (step.status) {
            case "completed":
                return "border-green-500 text-white dark:text-black";
            case "failed":
                return "border-red-500 text-white dark:text-black";
            case "running":
                return "border-blue-500";
            default:
                return "border-muted text-muted-foreground";
        }
    }

    switch (step.status) {
        case "completed":
            return "text-green-500 fill-green-500/10";
        case "failed":
            return "text-red-500 fill-red-500/10";
        case "running":
            return "text-blue-500 animate-spin";
        default:
            return "text-muted-foreground";
    }
}
</script>

.badge-failed { @apply bg-red-100 text-red-700 dark:bg-red-900/30
dark:text-red-400; } .plan-body { @apply p-4 space-y-4; } .plan-step { @apply
flex gap-3 p-3 rounded-lg border border-border transition-all; } .step-pending {
@apply bg-muted/20; } .step-running { @apply bg-blue-50 dark:bg-blue-900/10
border-blue-200 dark:border-blue-800; }
