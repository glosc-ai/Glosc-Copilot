<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const uiStore = useUiStore();

const GITHUB_REPO_URL = "https://github.com/glosc-ai/Glosc-Copilot";
const RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
const ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
const WEBSITE_URL = "https://www.glosc.ai";

const activeTab = ref<"about" | "changelog" | "github">("about");

watch(
    () => uiStore.aboutOpen,
    (open) => {
        if (!open) return;
        activeTab.value = uiStore.aboutTab;
    },
    { immediate: true },
);

watch(
    () => activeTab.value,
    (tab) => {
        uiStore.aboutTab = tab;
    },
);

const appName = ref("Glosc Copilot");
const appVersion = ref<string>("0.1.0");
const isTauri = computed(() => Boolean((window as any).__TAURI_INTERNALS__));

async function openExternal(url: string) {
    if (!url) return;

    // Vite browser dev fallback
    if (!(window as any).__TAURI_INTERNALS__) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }

    try {
        const mod: any = await import("@tauri-apps/plugin-opener");
        const fn = mod?.openUrl || mod?.open;
        if (typeof fn === "function") {
            await fn(url);
            return;
        }
    } catch {
        // ignore
    }

    try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
    } catch {
        // ignore
    }
}

onMounted(async () => {
    try {
        if (!(window as any).__TAURI_INTERNALS__) return;
        const mod: any = await import("@tauri-apps/api/app");
        const getName = mod?.getName;
        const getVersion = mod?.getVersion;
        if (typeof getName === "function") {
            appName.value = await getName();
        }
        if (typeof getVersion === "function") {
            appVersion.value = await getVersion();
        }
    } catch {
        // ignore
    }
});

function close() {
    uiStore.closeAbout();
}
</script>

<template>
    <Dialog v-model:open="uiStore.aboutOpen">
        <DialogContent class="w-[92vw] max-w-xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
                <DialogTitle>关于</DialogTitle>
            </DialogHeader>

            <Tabs v-model="activeTab" class="w-full">
                <TabsList class="w-fit">
                    <TabsTrigger @click="activeTab = 'about'" value="about"
                        >关于</TabsTrigger
                    >
                    <TabsTrigger
                        @click="activeTab = 'changelog'"
                        value="changelog"
                        >更新日志</TabsTrigger
                    >
                    <TabsTrigger @click="activeTab = 'github'" value="github"
                        >GitHub</TabsTrigger
                    >
                </TabsList>

                <TabsContent value="about" class="mt-4">
                    <div class="space-y-3">
                        <div class="text-lg font-semibold">
                            {{ appName }}
                        </div>
                        <div class="text-sm text-muted-foreground">
                            版本：{{ appVersion }}
                            <span v-if="isTauri" class="ml-2">（桌面端）</span>
                            <span v-else class="ml-2">（浏览器预览）</span>
                        </div>

                        <div class="text-sm text-muted-foreground">
                            Glosc Copilot 是一款跨平台的 AI 智能助手，目前有
                            聊天模式、会议模式、工作区模式，支持上百款 AI
                            模型接入（包括 OpenAI、Anthropic、Azure
                            OpenAI、Mistral、Claude+、Gemini 等）,适配 MCP 工具
                            以及 Glosc Store 的高级功能。
                        </div>

                        <div class="flex items-center gap-2 flex-wrap">
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(WEBSITE_URL)"
                            >
                                官网
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(GITHUB_REPO_URL)"
                            >
                                打开 GitHub
                            </Button>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="changelog" class="mt-4">
                    <div class="space-y-3">
                        <div class="text-sm text-muted-foreground">
                            当前仓库未内置独立的更新日志文件。
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(RELEASES_URL)"
                            >
                                查看 Releases
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                @click="openExternal(ISSUES_URL)"
                            >
                                反馈问题
                            </Button>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="github" class="mt-4">
                    <div class="space-y-3">
                        <div class="text-sm">
                            仓库：
                            <span class="text-muted-foreground">
                                glosc-ai/Glosc-Copilot
                            </span>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(GITHUB_REPO_URL)"
                            >
                                打开仓库
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(ISSUES_URL)"
                            >
                                Issues
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openExternal(RELEASES_URL)"
                            >
                                Releases
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <DialogFooter>
                <Button variant="ghost" @click="close">关闭</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
