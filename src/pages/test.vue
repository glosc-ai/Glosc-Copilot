<script lang="ts" setup>
import { VueDraggableNext } from "vue-draggable-next";

const list = ref([
    {
        name: "John",
        id: 1,
    },
    {
        name: "Joao",
        id: 2,
    },
    {
        name: "Jean",
        id: 3,
    },
    {
        name: "Gerard",
        id: 4,
    },
]);

function dragover(e: any) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}
</script>
<template>
    <div class="lex justify-center">
        <VueDraggableNext
            :list="list"
            item-key="id"
            handle=".drag-handle"
            @move="dragover"
        >
            <div
                class="list-group-item m-1 p-3 rounded-md text-center cursor-pointer"
                v-for="item in list"
                :key="item.id"
            >
                <span class="drag-handle">⋮⋮</span>
                {{ item.name }}
            </div>
        </VueDraggableNext>
    </div>
</template>
<style lang="less" scoped></style>
