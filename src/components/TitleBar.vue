<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    Minus,
    Square,
    X,
    Maximize2,
    UserRound,
    LogIn,
    LogOut,
    RefreshCcw,
    ExternalLink,
} from "lucide-vue-next";
import { computed, ref, onMounted } from "vue";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const appWindow = getCurrentWindow();
const chatStore = useChatStore();
const uiStore = useUiStore();
const authStore = useAuthStore();
const router = useRouter();

const isMaximized = ref(false);

onMounted(async () => {
    isMaximized.value = await appWindow.isMaximized();
    authStore.init().catch(() => {});
    // Listen for resize events to update state if needed,
    // but for simplicity we'll just toggle state on click
});

const minimize = () => appWindow.minimize();
const toggleMaximize = async () => {
    await appWindow.toggleMaximize();
    isMaximized.value = await appWindow.isMaximized();
};
const close = () => appWindow.close();

const createNewChat = async () => {
    await chatStore.createNewConversation(true);
    // 如果当前不在首页，创建会话后自动跳转到聊天界面
    if (router.currentRoute.value.path !== "/") {
        await router.push("/");
    }
};

const openMcpManager = () => {
    uiStore.openMcpManager();
};

const openSettings = () => {
    uiStore.openSettings();
};

const handleLogin = async () => {
    await authStore.startLogin();
};

const handleLogout = async () => {
    await authStore.logout();
    ElMessage.success("已退出登录");
};

const refreshUser = async () => {
    await authStore.refreshUser();
    ElMessage.success("已刷新用户信息");
};

const openAccount = () => {
    authStore.openAccountPage();
};

const openWorkspaceFolder = async () => {
    // 新建/打开工作区本质都是“选择一个文件夹作为根目录”
    // 通过 query 参数触发 workspace 页面弹出选择框
    await router.push({
        path: "/workspace",
        query: { pick: String(Date.now()) },
    });
};

const openMeetings = async () => {
    await router.push("/meeting");
};

const formatUsd = (cents?: number | null) => {
    const safe =
        typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
    const value = Math.max(0, Math.trunc(safe)) / 100;
    const text = value
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
    return `$${text}`;
};

const balanceText = computed(() => {
    const wallet = authStore.user?.wallet;
    if (!wallet) return "";
    const total = formatUsd(wallet.totalCents);
    return total;
});

const balanceTip = computed(() => {
    const wallet = authStore.user?.wallet;
    if (!wallet) return [] as string[];
    const lines: string[] = [];
    const freeCents = wallet.freeChatCents ?? 0;
    const cashCents = wallet.cashCents ?? 0;
    if (freeCents > 0) {
        lines.push(`免费 ${formatUsd(freeCents)}`);
    }
    if (cashCents > 0) {
        lines.push(`付费 ${formatUsd(cashCents)}`);
    }
    if (freeCents > 0 && cashCents > 0) {
        lines.push(`合计 ${formatUsd(freeCents + cashCents)}`);
    }
    return lines;
});
</script>

<template>
    <div
        data-tauri-drag-region
        class="app-header h-10 flex items-center justify-between bg-background border-b select-none px-4 fixed top-0 left-0 right-0 z-50"
    >
        <div class="flex items-center gap-2 text-sm font-medium">
            <img src="/favicon.ico" class="w-4 h-4" alt="Logo" />
            <!-- <span>Glosc Copilot</span> -->
            <div class="flex">
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="ghost"> 开始 </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-20" align="start">
                        <DropdownMenuGroup>
                            <DropdownMenuItem @click="createNewChat"
                                >新建会话
                            </DropdownMenuItem>
                            <DropdownMenuItem @click="openMeetings">
                                AI 会议
                            </DropdownMenuItem>
                            <DropdownMenuItem @click="openWorkspaceFolder">
                                打开文件夹
                            </DropdownMenuItem>
                            <!-- <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    工作区
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem
                                            @click="openWorkspaceFolder"
                                        >
                                            新建工作区
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            @click="openWorkspaceFolder"
                                        >
                                            打开工作区
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub> -->
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="ghost"> 选项 </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-20" align="start">
                        <DropdownMenuGroup>
                            <DropdownMenuItem @click="openMcpManager">
                                工具
                            </DropdownMenuItem>
                            <DropdownMenuItem @click="openSettings">
                                设置
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
        <div class="title-bar-dragger"></div>
        <div class="flex items-center gap-1 no-drag">
            <Button
                v-if="!authStore.isLoggedIn"
                variant="ghost"
                size="sm"
                class="h-8 px-2"
                @click="handleLogin"
            >
                <LogIn class="w-4 h-4" />
                <span class="ml-2">登录</span>
            </Button>
            <DropdownMenu v-else>
                <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="sm" class="h-8 px-2">
                        <img
                            v-if="authStore.user?.avatarUrl"
                            :src="authStore.user?.avatarUrl"
                            class="w-5 h-5 rounded-full"
                            alt="avatar"
                        />
                        <UserRound v-else class="w-4 h-4" />
                        <span class="ml-2 max-w-35 truncate">
                            {{ authStore.displayName }}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="w-56" align="end">
                    <DropdownMenuLabel class="space-y-1">
                        <div class="text-sm font-medium">
                            {{ authStore.displayName }}
                        </div>
                        <div
                            v-if="authStore.user?.email"
                            class="text-xs text-muted-foreground"
                        >
                            {{ authStore.user?.email }}
                        </div>
                        <TooltipProvider v-if="balanceText">
                            <div class="text-xs text-muted-foreground">
                                余额：
                                <Tooltip v-if="balanceTip.length">
                                    <TooltipTrigger as-child>
                                        <span
                                            class="cursor-help underline decoration-dotted"
                                        >
                                            {{ balanceText }}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <div class="space-y-1">
                                            <div
                                                v-for="line in balanceTip"
                                                :key="line"
                                            >
                                                {{ line }}
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                                <span v-else>{{ balanceText }}</span>
                            </div>
                        </TooltipProvider>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="refreshUser">
                        <RefreshCcw class="w-4 h-4 mr-2" />
                        刷新用户信息
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="openAccount">
                        <ExternalLink class="w-4 h-4 mr-2" />
                        打开账户页
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="handleLogout">
                        <LogOut class="w-4 h-4 mr-2" />
                        退出登录
                    </DropdownMenuItem>
                    <!-- <template v-else>
                        <DropdownMenuItem>
                            <LogIn class="w-4 h-4 mr-2" />
                            打开网页登录
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                            <span class="text-xs text-muted-foreground">
                                登录后会自动同步到桌面端
                            </span>
                        </DropdownMenuItem>
                    </template> -->
                </DropdownMenuContent>
            </DropdownMenu>

            <button
                @click="minimize"
                class="p-2 hover:bg-accent rounded-md transition-colors"
            >
                <Minus class="w-4 h-4" />
            </button>
            <button
                @click="toggleMaximize"
                class="p-2 hover:bg-accent rounded-md transition-colors"
            >
                <Maximize2 v-if="!isMaximized" class="w-4 h-4" />
                <Square v-else class="w-4 h-4" />
            </button>
            <button
                @click="close"
                class="p-2 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors"
            >
                <X class="w-4 h-4" />
            </button>
        </div>
    </div>
</template>
<style scoped lang="less">
.app-header {
    // 禁用选中
    user-select: none;
}
.title-bar-dragger {
    -webkit-app-region: drag;
    user-select: none;
}

.no-drag {
    -webkit-app-region: no-drag;
}
</style>
