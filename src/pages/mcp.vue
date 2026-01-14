<script setup lang="ts">
const router = useRouter();
const uiStore = useUiStore();

onMounted(async () => {
    uiStore.openMcpManager();

    // 兼容旧路由：如果用户仍访问 /mcp，则打开弹窗后跳回首页。
    if (router.currentRoute.value.path === "/mcp") {
        await router.replace("/");
    }
});
</script>

<template>
    <div class="container p-6 text-sm text-muted-foreground">
        工具管理已改为全局弹窗：请从顶部菜单“选项 → 工具”打开。
    </div>
</template>
