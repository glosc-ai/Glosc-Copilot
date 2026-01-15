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
        <router-view />
    </div>
</template>
<script lang="ts">
export default {
    name: "Default",
};
</script>
<style lang="less" scoped></style>
