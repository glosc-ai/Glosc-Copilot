<script lang="ts" setup>
const authStore = useAuthStore();

onMounted(() => {
    authStore.init().catch(() => {});
});
</script>
<template>
    <div class="pt-10">
        <TitleBar />
        <McpManagerDialog />
        <router-view v-slot="{ Component, route }">
            <component :is="Component" :key="route.fullPath" />
        </router-view>
    </div>
</template>
<script lang="ts">
export default {
    name: "Default",
};
</script>
<style lang="less" scoped></style>
