<script lang="ts" setup></script>
<template>
    <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="route" />
    </router-view>
</template>
<script lang="ts">
export default {
    name: "App",
};
</script>
<style lang="less" scoped></style>
