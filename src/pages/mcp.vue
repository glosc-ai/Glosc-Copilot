<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useMcpStore, type McpServer } from "@/stores/mcp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Play, Activity, ArrowLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";

const router = useRouter();
const mcpStore = useMcpStore();

const isDialogOpen = ref(false);
const editingServer = ref<McpServer | null>(null);

const form = ref({
    name: "",
    command: "",
    args: "",
    env: "",
});

const resetForm = () => {
    form.value = {
        name: "",
        command: "",
        args: "",
        env: "",
    };
    editingServer.value = null;
};

const openAddDialog = () => {
    resetForm();
    isDialogOpen.value = true;
};

const openEditDialog = (server: McpServer) => {
    editingServer.value = server;
    form.value = {
        name: server.name,
        command: server.command,
        args: server.args.join(" "),
        env: JSON.stringify(server.env, null, 2),
    };
    isDialogOpen.value = true;
};

const saveServer = async () => {
    const args = form.value.args.split(" ").filter(Boolean);
    let env = {};
    try {
        env = form.value.env ? JSON.parse(form.value.env) : {};
    } catch (e) {
        alert("Environment variables must be valid JSON");
        return;
    }

    if (editingServer.value) {
        await mcpStore.updateServer(editingServer.value.id, {
            name: form.value.name,
            command: form.value.command,
            args,
            env,
        });
    } else {
        await mcpStore.addServer({
            name: form.value.name,
            command: form.value.command,
            args,
            env,
            enabled: true,
        });
    }
    isDialogOpen.value = false;
    resetForm();
};

const deleteServer = async (id: string) => {
    if (confirm("Are you sure you want to delete this server?")) {
        await mcpStore.removeServer(id);
    }
};

const toggleServer = async (server: McpServer) => {
    await mcpStore.updateServer(server.id, { enabled: !server.enabled });
};

const testServer = (server: McpServer) => {
    console.log("Testing server:", server);
    alert(`Testing ${server.name}... (Not implemented)`);
};

const startServer = (server: McpServer) => {
    console.log("Starting server:", server);
    alert(`Starting ${server.name}... (Not implemented)`);
};

onMounted(async () => {
    await mcpStore.init();
});
</script>

<template>
    <div class="container mx-auto p-6 max-w-4xl">
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-4">
                <Button variant="ghost" size="icon" @click="router.back()">
                    <ArrowLeft class="w-4 h-4" />
                </Button>
                <h1 class="text-2xl font-bold">MCP Server Management</h1>
            </div>
            <Button @click="openAddDialog">
                <Plus class="w-4 h-4 mr-2" />
                Add Server
            </Button>
        </div>

        <div class="grid gap-4">
            <div
                v-for="server in mcpStore.servers"
                :key="server.id"
                class="border rounded-lg p-4 flex items-center justify-between bg-card text-card-foreground shadow-sm"
            >
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-semibold text-lg">{{ server.name }}</h3>
                        <span
                            :class="[
                                'px-2 py-0.5 rounded text-xs',
                                server.enabled
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
                            ]"
                        >
                            {{ server.enabled ? "Enabled" : "Disabled" }}
                        </span>
                    </div>
                    <p class="text-sm text-muted-foreground mt-1">
                        {{ server.command }} {{ server.args.join(" ") }}
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        @click="toggleServer(server)"
                    >
                        {{ server.enabled ? "Disable" : "Enable" }}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        @click="testServer(server)"
                    >
                        <Activity class="w-4 h-4 mr-1" />
                        Test
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        @click="startServer(server)"
                    >
                        <Play class="w-4 h-4 mr-1" />
                        Start
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        @click="openEditDialog(server)"
                    >
                        <Edit class="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="text-destructive hover:text-destructive"
                        @click="deleteServer(server.id)"
                    >
                        <Trash2 class="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div
                v-if="mcpStore.servers.length === 0"
                class="text-center py-12 text-muted-foreground"
            >
                No MCP servers configured. Click "Add Server" to get started.
            </div>
        </div>

        <Dialog v-model:open="isDialogOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{
                        editingServer ? "Edit Server" : "Add Server"
                    }}</DialogTitle>
                    <DialogDescription>
                        Configure your Model Context Protocol server.
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid gap-2">
                        <label class="text-sm font-medium">Name</label>
                        <Input
                            v-model="form.name"
                            placeholder="My MCP Server"
                        />
                    </div>
                    <div class="grid gap-2">
                        <label class="text-sm font-medium">Command</label>
                        <Input
                            v-model="form.command"
                            placeholder="node, python, etc."
                        />
                    </div>
                    <div class="grid gap-2">
                        <label class="text-sm font-medium">Arguments</label>
                        <Input
                            v-model="form.args"
                            placeholder="path/to/server.js --arg"
                        />
                    </div>
                    <div class="grid gap-2">
                        <label class="text-sm font-medium"
                            >Environment Variables (JSON)</label
                        >
                        <Textarea
                            v-model="form.env"
                            placeholder='{"KEY": "VALUE"}'
                            rows="4"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="isDialogOpen = false"
                        >Cancel</Button
                    >
                    <Button @click="saveServer">Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
