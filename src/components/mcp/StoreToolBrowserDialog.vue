<script setup lang="ts">
import {
    Search,
    Loader2,
    Download,
    PackagePlus,
    ExternalLink,
    BookmarkPlus,
    LibraryBig,
} from "lucide-vue-next";

import { openUrl } from "@tauri-apps/plugin-opener";

import type { StorePlugin } from "@/utils/GloscStoreApi";
import { GloscStoreApi } from "@/utils/GloscStoreApi";
import { installStoreTool } from "@/utils/StoreToolInstaller";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
    (e: "update:open", v: boolean): void;
    (e: "installed", plugin: StorePlugin): void;
}>();

const authStore = useAuthStore();
const mcpStore = useMcpStore();

const localOpen = computed({
    get: () => props.open,
    set: (v) => emit("update:open", v),
});

const loading = ref(false);
const libraryLoading = ref(false);
const errorMessage = ref<string | null>(null);
const q = ref("");
const libraryQuery = ref("");
const activeTab = ref<"browse" | "library">("browse");
const items = ref<StorePlugin[]>([]);
const librarySlugs = ref<Set<string>>(new Set());
const libraryItems = ref<StorePlugin[]>([]);

const installingSlugs = ref<Set<string>>(new Set());
const acquiringSlugs = ref<Set<string>>(new Set());

const installedBySlug = computed(() => {
    const map = new Map<string, { version?: string }>();
    for (const s of mcpStore.servers) {
        if (s.type !== "stdio") continue;
        const slug = s.env?.GLOSC_STORE_SLUG;
        if (!slug) continue;
        map.set(String(slug), { version: s.env?.GLOSC_STORE_VERSION });
    }
    return map;
});

function isInstalled(slug: string) {
    return installedBySlug.value.has(slug);
}

function isInLibrary(slug: string) {
    return librarySlugs.value.has(slug);
}

function getStoreDetailUrl(slug: string) {
    return `${GloscStoreApi.host()}/store/plugins/${encodeURIComponent(slug)}`;
}

async function openStoreDetail(plugin: StorePlugin) {
    try {
        const url = getStoreDetailUrl(plugin.slug);
        if (!(window as any).__TAURI_INTERNALS__) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }
        await openUrl(url);
    } catch (e) {
        ElMessage.error("无法打开 Glosc Store 页面");
    }
}

async function load() {
    loading.value = true;
    errorMessage.value = null;

    try {
        const res = await GloscStoreApi.listPlugins({
            category: "工具",
            q: q.value.trim() || undefined,
            sort: "popular",
            limit: 50,
            offset: 0,
        });
        let nextItems = res.items || [];

        // Fallback: 如果“工具”分类暂无数据，尝试按可安装类型拉取。
        if (!nextItems.length) {
            const [pkg, file] = await Promise.all([
                GloscStoreApi.listPlugins({
                    q: q.value.trim() || undefined,
                    sort: "popular",
                    sourceType: "package",
                    limit: 50,
                    offset: 0,
                }),
                GloscStoreApi.listPlugins({
                    q: q.value.trim() || undefined,
                    sort: "popular",
                    sourceType: "file",
                    limit: 50,
                    offset: 0,
                }),
            ]);
            const merged = [...(pkg.items || []), ...(file.items || [])];
            const dedup = new Map<string, StorePlugin>();
            for (const p of merged) dedup.set(p.id, p);
            nextItems = Array.from(dedup.values());
        }

        items.value = nextItems;
    } catch (e: any) {
        errorMessage.value = e?.message || "加载 Glosc Store 失败";
    } finally {
        loading.value = false;
    }
}

async function loadLibrary() {
    libraryLoading.value = true;
    try {
        if (!authStore.isLoggedIn || !authStore.token) {
            librarySlugs.value = new Set();
            libraryItems.value = [];
            return;
        }
        const res = await GloscStoreApi.listLibrary(authStore.token);
        const nextItems = res.items || [];
        const slugs = nextItems
            .map((p) => String(p.slug || "").trim())
            .filter(Boolean);
        librarySlugs.value = new Set(slugs);
        libraryItems.value = nextItems;
    } catch {
        librarySlugs.value = new Set();
        libraryItems.value = [];
    } finally {
        libraryLoading.value = false;
    }
}

watch(
    () => props.open,
    async (open) => {
        if (!open) return;
        await authStore.init();
        await Promise.all([load(), loadLibrary()]);
        activeTab.value = "browse";
    }
);

watch(
    () => authStore.isLoggedIn,
    async (loggedIn) => {
        if (!localOpen.value) return;
        if (!loggedIn) {
            librarySlugs.value = new Set();
            return;
        }
        await loadLibrary();
    }
);

async function onInstall(plugin: StorePlugin) {
    if (installingSlugs.value.has(plugin.slug)) return;
    if (isInstalled(plugin.slug)) return;
    if (!isInLibrary(plugin.slug) && plugin.pricing?.type !== "free") {
        await openStoreDetail(plugin);
        return;
    }

    installingSlugs.value = new Set(installingSlugs.value).add(plugin.slug);
    try {
        await installStoreTool({
            plugin,
            authToken: authStore.token,
            mcpStore,
            autoEnable: true,
        });

        ElMessage.success(`已安装：${plugin.name}`);
        emit("installed", plugin);
        localOpen.value = false;
        if (authStore.isLoggedIn && authStore.token) {
            librarySlugs.value = new Set(librarySlugs.value).add(plugin.slug);
        }
    } catch (e: any) {
        const msg = e?.message || String(e);
        ElMessage.error(msg);
    } finally {
        const next = new Set(installingSlugs.value);
        next.delete(plugin.slug);
        installingSlugs.value = next;
    }
}

const filteredLibraryItems = computed(() => {
    const keyword = libraryQuery.value.trim().toLowerCase();
    if (!keyword) return libraryItems.value;
    return libraryItems.value.filter((p) => {
        const text = [p.name, p.summary, ...(p.tags || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return text.includes(keyword);
    });
});

async function onAcquire(plugin: StorePlugin) {
    if (acquiringSlugs.value.has(plugin.slug)) return;
    if (!authStore.isLoggedIn || !authStore.token) {
        authStore.startLogin();
        return;
    }
    acquiringSlugs.value = new Set(acquiringSlugs.value).add(plugin.slug);
    try {
        await GloscStoreApi.acquireToLibrary(plugin.slug, authStore.token);
        librarySlugs.value = new Set(librarySlugs.value).add(plugin.slug);
        ElMessage.success("已添加到库");
    } catch (e: any) {
        const msg = e?.message || "添加失败";
        ElMessage.error(msg);
    } finally {
        const next = new Set(acquiringSlugs.value);
        next.delete(plugin.slug);
        acquiringSlugs.value = next;
    }
}

function close() {
    localOpen.value = false;
}
</script>

<template>
    <Dialog v-model:open="localOpen">
        <DialogContent class="w-[90vw] md:max-w-225 h-[85vh] flex flex-col">
            <DialogHeader>
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <DialogTitle>Glosc Store · 工具</DialogTitle>
                        <DialogDescription>
                            浏览、加入库并安装到 MCP 工具管理。
                        </DialogDescription>
                    </div>
                    <div class="flex items-center gap-2">
                        <Button variant="ghost" @click="close">关闭</Button>
                    </div>
                </div>
            </DialogHeader>

            <div class="flex items-center gap-2">
                <Button
                    size="sm"
                    :variant="activeTab === 'browse' ? 'default' : 'outline'"
                    @click="activeTab = 'browse'"
                >
                    <Search class="w-4 h-4 mr-2" />
                    浏览
                </Button>
                <Button
                    size="sm"
                    :variant="activeTab === 'library' ? 'default' : 'outline'"
                    @click="activeTab = 'library'"
                >
                    <LibraryBig class="w-4 h-4 mr-2" />
                    我的库
                </Button>
            </div>

            <div v-if="activeTab === 'browse'" class="flex items-center gap-2">
                <div class="relative flex-1">
                    <Search
                        class="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                    />
                    <Input
                        v-model="q"
                        placeholder="搜索工具（例如：MCP、表格、README）"
                        class="pl-9"
                        @keydown.enter="load"
                    />
                </div>
                <Button variant="outline" :disabled="loading" @click="load">
                    <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                    刷新
                </Button>
                <Button
                    variant="outline"
                    v-if="!authStore.isLoggedIn"
                    @click="authStore.startLogin"
                >
                    登录后加入库
                </Button>
            </div>

            <div class="flex-1 overflow-y-auto pr-1 mt-4">
                <div v-if="errorMessage" class="text-sm text-destructive">
                    {{ errorMessage }}
                </div>

                <div
                    v-else-if="activeTab === 'browse'"
                    class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                >
                    <div
                        v-for="p in items"
                        :key="p.id"
                        class="border rounded-lg bg-card text-card-foreground shadow-sm p-4 flex flex-col"
                    >
                        <div class="flex flex-col gap-3 h-full">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <div
                                        class="font-semibold truncate cursor-pointer hover:underline max-w-full"
                                        @click="openStoreDetail(p)"
                                        title="查看详情"
                                    >
                                        {{ p.name }}
                                    </div>
                                    <Badge variant="secondary">{{
                                        p.pricing.type === "free"
                                            ? "免费"
                                            : "付费"
                                    }}</Badge>
                                    <Badge variant="outline">{{
                                        p.source?.type || "unknown"
                                    }}</Badge>
                                    <Badge
                                        v-if="isInLibrary(p.slug)"
                                        variant="outline"
                                    >
                                        已在库中
                                    </Badge>
                                    <Badge
                                        v-if="isInstalled(p.slug)"
                                        variant="outline"
                                    >
                                        已安装
                                    </Badge>
                                </div>
                                <div
                                    class="text-sm text-muted-foreground mt-1 line-clamp-3"
                                >
                                    {{ p.summary }}
                                </div>
                                <div class="text-xs text-muted-foreground mt-2">
                                    安装量：{{ p.installCount }} · 评分：{{
                                        p.ratingAvg
                                    }}
                                    ({{ p.ratingCount }})
                                </div>
                            </div>

                            <div
                                class="mt-auto flex flex-wrap items-center justify-end gap-2"
                            >
                                <Button
                                    size="sm"
                                    variant="outline"
                                    @click="openStoreDetail(p)"
                                >
                                    <ExternalLink class="w-4 h-4 mr-2" />
                                    详情
                                </Button>

                                <Button
                                    v-if="isInstalled(p.slug)"
                                    size="sm"
                                    variant="secondary"
                                    disabled
                                >
                                    已安装
                                </Button>

                                <Button
                                    v-else-if="isInLibrary(p.slug)"
                                    size="sm"
                                    variant="default"
                                    :disabled="installingSlugs.has(p.slug)"
                                    @click="onInstall(p)"
                                >
                                    <Loader2
                                        v-if="installingSlugs.has(p.slug)"
                                        class="w-4 h-4 mr-2 animate-spin"
                                    />
                                    <Download
                                        v-else-if="p.source?.type === 'file'"
                                        class="w-4 h-4 mr-2"
                                    />
                                    <PackagePlus v-else class="w-4 h-4 mr-2" />
                                    安装
                                </Button>

                                <Button
                                    v-else-if="p.pricing.type === 'free'"
                                    size="sm"
                                    variant="default"
                                    :disabled="
                                        acquiringSlugs.has(p.slug) ||
                                        libraryLoading
                                    "
                                    @click="onAcquire(p)"
                                >
                                    <Loader2
                                        v-if="acquiringSlugs.has(p.slug)"
                                        class="w-4 h-4 mr-2 animate-spin"
                                    />
                                    <BookmarkPlus v-else class="w-4 h-4 mr-2" />
                                    {{
                                        authStore.isLoggedIn
                                            ? "入库"
                                            : "登录后加入库"
                                    }}
                                </Button>

                                <Button
                                    v-else
                                    size="sm"
                                    variant="default"
                                    @click="openStoreDetail(p)"
                                >
                                    <ExternalLink class="w-4 h-4 mr-2" />
                                    购买
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div
                        v-if="!loading && items.length === 0"
                        class="text-sm text-muted-foreground"
                    >
                        没有找到工具。
                    </div>
                </div>

                <div v-else class="grid gap-3">
                    <div class="flex items-center gap-2">
                        <div class="relative flex-1">
                            <Search
                                class="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                            />
                            <Input
                                v-model="libraryQuery"
                                placeholder="搜索我的库"
                                class="pl-9"
                            />
                        </div>
                        <Button
                            variant="outline"
                            :disabled="libraryLoading"
                            @click="loadLibrary"
                        >
                            <Loader2
                                v-if="libraryLoading"
                                class="w-4 h-4 mr-2 animate-spin"
                            />
                            刷新库
                        </Button>
                    </div>

                    <div
                        v-if="!authStore.isLoggedIn"
                        class="rounded-lg border bg-card p-6 text-sm text-muted-foreground flex items-center justify-between"
                    >
                        <span>登录后可查看并安装你的工具库。</span>
                        <Button size="sm" @click="authStore.startLogin">
                            去登录
                        </Button>
                    </div>

                    <div
                        v-else-if="libraryLoading"
                        class="text-sm text-muted-foreground"
                    >
                        加载我的库...
                    </div>

                    <div
                        v-else
                        class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    >
                        <div
                            v-for="p in filteredLibraryItems"
                            :key="p.id"
                            class="border rounded-lg bg-card text-card-foreground shadow-sm p-4 flex flex-col"
                        >
                            <div class="flex flex-col gap-3 h-full">
                                <div class="min-w-0">
                                    <div
                                        class="flex items-center gap-2 flex-wrap"
                                    >
                                        <div
                                            class="font-semibold truncate cursor-pointer hover:underline max-w-full"
                                            @click="openStoreDetail(p)"
                                            title="查看详情"
                                        >
                                            {{ p.name }}
                                        </div>
                                        <Badge variant="secondary">{{
                                            p.pricing.type === "free"
                                                ? "免费"
                                                : "付费"
                                        }}</Badge>
                                        <Badge variant="outline">{{
                                            p.source?.type || "unknown"
                                        }}</Badge>
                                        <Badge variant="outline"
                                            >已在库中</Badge
                                        >
                                        <Badge
                                            v-if="isInstalled(p.slug)"
                                            variant="outline"
                                        >
                                            已安装
                                        </Badge>
                                    </div>
                                    <div
                                        class="text-sm text-muted-foreground mt-1 line-clamp-3"
                                    >
                                        {{ p.summary }}
                                    </div>
                                </div>

                                <div
                                    class="mt-auto flex flex-wrap items-center justify-end gap-2"
                                >
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        @click="openStoreDetail(p)"
                                    >
                                        <ExternalLink class="w-4 h-4 mr-2" />
                                        详情
                                    </Button>
                                    <Button
                                        v-if="isInstalled(p.slug)"
                                        size="sm"
                                        variant="secondary"
                                        disabled
                                    >
                                        已安装
                                    </Button>
                                    <Button
                                        v-else
                                        size="sm"
                                        variant="default"
                                        :disabled="installingSlugs.has(p.slug)"
                                        @click="onInstall(p)"
                                    >
                                        <Loader2
                                            v-if="installingSlugs.has(p.slug)"
                                            class="w-4 h-4 mr-2 animate-spin"
                                        />
                                        <Download
                                            v-else-if="
                                                p.source?.type === 'file'
                                            "
                                            class="w-4 h-4 mr-2"
                                        />
                                        <PackagePlus
                                            v-else
                                            class="w-4 h-4 mr-2"
                                        />
                                        安装
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div
                            v-if="
                                !libraryLoading &&
                                filteredLibraryItems.length === 0
                            "
                            class="text-sm text-muted-foreground"
                        >
                            我的库暂无工具。
                        </div>
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>
</template>
