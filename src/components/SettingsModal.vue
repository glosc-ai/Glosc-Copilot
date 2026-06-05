<script lang="ts" setup>
import { computed, watch } from "vue";

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
        <DialogContent class="w-[92vw] max-w-md">
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
            </div>

            <DialogFooter>
                <Button variant="ghost" @click="uiStore.closeSettings()">
                    关闭
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
