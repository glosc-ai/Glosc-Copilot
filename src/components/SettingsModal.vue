<script lang="ts" setup>
import { computed, watch } from "vue";
import { Textarea } from "@/components/ui/textarea";

const uiStore = useUiStore();
const settingsStore = useSettingsStore();

const themeModeProxy = computed({
    get: () => settingsStore.themeMode,
    set: (value: any) => {
        void settingsStore.setThemeMode(value);
    },
});

const languageProxy = computed({
    get: () => settingsStore.language,
    set: (value: any) => {
        void settingsStore.setLanguage(value);
    },
});

const assistantSystemPromptProxy = computed({
    get: () => settingsStore.assistantSystemPrompt,
    set: (value: string | number) => {
        void settingsStore.setAssistantSystemPrompt(String(value ?? ""));
    },
});

function resetAssistantSystemPrompt() {
    void settingsStore.resetAssistantSystemPrompt();
}

watch(
    () => uiStore.settingsOpen,
    (open) => {
        if (open) void settingsStore.init();
    },
    { immediate: true },
);
</script>

<template>
    <Dialog v-model:open="uiStore.settingsOpen">
        <DialogContent class="w-[92vw] max-w-2xl">
            <DialogHeader>
                <DialogTitle>设置</DialogTitle>
            </DialogHeader>

            <div class="space-y-6">
                <div class="grid gap-2">
                    <div class="text-xs text-muted-foreground">主题</div>
                    <Select v-model="themeModeProxy">
                        <SelectTrigger class="h-8 w-56">
                            <SelectValue placeholder="选择主题" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="system">跟随系统</SelectItem>
                            <SelectItem value="dark">暗色</SelectItem>
                            <SelectItem value="light">亮色</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="grid gap-2">
                    <div class="text-xs text-muted-foreground">语言</div>
                    <Select v-model="languageProxy" disabled>
                        <SelectTrigger class="h-8 w-56">
                            <SelectValue placeholder="选择语言" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="zh-CN">简体中文</SelectItem>
                        </SelectContent>
                    </Select>
                    <div class="text-xs text-muted-foreground">
                        当前仅支持简体中文
                    </div>
                </div>

                <div class="grid gap-2">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs text-muted-foreground">
                                AI 默认提示词
                            </div>
                            <div class="mt-1 text-xs text-muted-foreground">
                                每次普通对话都会附加。支持变量
                                <code v-text="'{{mcpList}}'" />
                                和
                                <code v-text="'{{toolList}}'" />
                                ，发送时会替换为当前启用能力。
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            @click="resetAssistantSystemPrompt"
                        >
                            恢复默认
                        </Button>
                    </div>
                    <Textarea
                        v-model="assistantSystemPromptProxy"
                        class="min-h-52 resize-y text-sm leading-relaxed"
                        placeholder="输入普通对话默认提示词"
                    />
                </div>
            </div>

            <DialogFooter>
                <Button variant="ghost" @click="uiStore.closeSettings()">
                    关闭
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
