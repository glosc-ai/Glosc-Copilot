import { defineStore } from "pinia";

import { storeUtils } from "@/utils/StoreUtils";
import {
    buildCompatibleSkillsPrompt,
    discoverDefaultAgentSkillDirectories,
    discoverSkillsInDirectory,
    isSkillFromDirectory,
    type IImportedSkill,
} from "@/utils/SkillCompatibility";

const STORE_KEY = "compatible_skills_v1";
const DIRECTORIES_STORE_KEY = "compatible_skill_directories_v1";

export interface ISkillDirectoryConfig {
    id: string;
    path: string;
    label: string;
    agent: "Claude" | "Codex" | "OpenClaw" | "OpenCode" | "Custom";
    enabled: boolean;
    autoDiscovered: boolean;
    addedAt: number;
    updatedAt: number;
    lastSyncedAt?: number;
    lastSkillCount?: number;
    lastWarning?: string;
}

function cloneSkill(skill: IImportedSkill) {
    return {
        ...skill,
        userNote: skill.userNote || "",
        allowedTools: [...skill.allowedTools],
        metadata: { ...skill.metadata },
        warnings: [...skill.warnings],
        files: skill.files.map((file) => ({ ...file })),
        ecosystemTags: [...skill.ecosystemTags],
        source: { ...skill.source },
        packageMeta: skill.packageMeta
            ? {
                  ...skill.packageMeta,
                  capabilityTags: [...skill.packageMeta.capabilityTags],
                  toolNames: [...skill.packageMeta.toolNames],
                  bundledSkillNames: [...skill.packageMeta.bundledSkillNames],
              }
            : undefined,
    } satisfies IImportedSkill;
}

function normalizeDirectoryPath(path: string) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").trim();
}

function cloneDirectory(directory: ISkillDirectoryConfig) {
    return { ...directory } satisfies ISkillDirectoryConfig;
}

function canUseLocalFileSystem() {
    return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

export const useSkillsStore = defineStore("skills", {
    state: () => ({
        skills: [] as IImportedSkill[],
        skillDirectories: [] as ISkillDirectoryConfig[],
        initialized: false,
        directoriesSyncing: false,
        lastDirectorySyncWarnings: [] as string[],
    }),
    getters: {
        enabledSkills(state) {
            return state.skills.filter((skill) => skill.enabled);
        },
        enabledSkillCount(state) {
            return state.skills.filter((skill) => skill.enabled).length;
        },
        enabledSkillsSignature(state) {
            return state.skills
                .filter((skill) => skill.enabled)
                .map((skill) => `${skill.id}:${skill.updatedAt}:${skill.enabled ? 1 : 0}`)
                .join("|");
        },
    },
    actions: {
        async init() {
            if (this.initialized) return;
            const [stored, storedDirectories] = await Promise.all([
                storeUtils.get<IImportedSkill[]>(STORE_KEY),
                storeUtils.get<ISkillDirectoryConfig[]>(DIRECTORIES_STORE_KEY),
            ]);
            this.skills = Array.isArray(stored) ? stored.map(cloneSkill) : [];
            this.skillDirectories = Array.isArray(storedDirectories)
                ? storedDirectories.map(cloneDirectory)
                : [];
            this.initialized = true;

            if (canUseLocalFileSystem()) {
                await this.discoverDefaultDirectories();
                await this.syncSkillDirectories();
            }
        },
        async save() {
            await storeUtils.setMany(
                [
                    { key: STORE_KEY, value: this.skills, encrypt: false },
                    {
                        key: DIRECTORIES_STORE_KEY,
                        value: this.skillDirectories,
                        encrypt: false,
                    },
                ],
                false,
            );
        },
        async upsertImportedSkills(skills: IImportedSkill[]) {
            if (!Array.isArray(skills) || skills.length === 0) return;

            const next = [...this.skills];

            for (const incoming of skills) {
                const index = next.findIndex(
                    (skill) => skill.dedupeKey === incoming.dedupeKey,
                );
                if (index === -1) {
                    next.push(cloneSkill(incoming));
                    continue;
                }

                const existing = next[index];
                next[index] = {
                    ...cloneSkill(incoming),
                    id: existing.id,
                    enabled: existing.enabled,
                    userNote: existing.userNote || "",
                    importedAt: existing.importedAt,
                    updatedAt: Date.now(),
                };
            }

            next.sort((a, b) => b.updatedAt - a.updatedAt);
            this.skills = next;
            await this.save();
        },
        async toggleSkill(id: string, enabled: boolean) {
            const index = this.skills.findIndex((skill) => skill.id === id);
            if (index === -1) return;
            this.skills[index] = {
                ...this.skills[index],
                enabled,
                updatedAt: Date.now(),
            };
            await this.save();
        },
        async removeSkill(id: string) {
            this.skills = this.skills.filter((skill) => skill.id !== id);
            await this.save();
        },
        async setSkillNote(id: string, userNote: string) {
            const index = this.skills.findIndex((skill) => skill.id === id);
            if (index === -1) return;
            this.skills[index] = {
                ...this.skills[index],
                userNote,
            };
            await this.save();
        },
        async setSkillEnabledAll(enabled: boolean) {
            const nextUpdatedAt = Date.now();
            this.skills = this.skills.map((skill) => ({
                ...skill,
                enabled,
                updatedAt: nextUpdatedAt,
            }));
            await this.save();
        },
        async addSkillDirectory(params: {
            path: string;
            label?: string;
            agent?: ISkillDirectoryConfig["agent"];
            autoDiscovered?: boolean;
        }) {
            const path = normalizeDirectoryPath(params.path);
            if (!path) return;

            const now = Date.now();
            const index = this.skillDirectories.findIndex(
                (directory) => normalizeDirectoryPath(directory.path) === path,
            );

            if (index === -1) {
                const pathParts = path.split("/").filter(Boolean);
                this.skillDirectories.push({
                    id: crypto.randomUUID(),
                    path,
                    label:
                        params.label?.trim() ||
                        pathParts[pathParts.length - 1] ||
                        path,
                    agent: params.agent || "Custom",
                    enabled: true,
                    autoDiscovered: Boolean(params.autoDiscovered),
                    addedAt: now,
                    updatedAt: now,
                });
            } else {
                const existing = this.skillDirectories[index];
                this.skillDirectories[index] = {
                    ...existing,
                    label: params.label?.trim() || existing.label,
                    agent: params.agent || existing.agent,
                    autoDiscovered:
                        existing.autoDiscovered || Boolean(params.autoDiscovered),
                    enabled: true,
                    updatedAt: now,
                };
            }

            await this.save();
        },
        async discoverDefaultDirectories() {
            if (!canUseLocalFileSystem()) return;

            const discovered = await discoverDefaultAgentSkillDirectories();
            for (const directory of discovered) {
                await this.addSkillDirectory({
                    path: directory.path,
                    label: directory.label,
                    agent: directory.agent,
                    autoDiscovered: true,
                });
            }
        },
        async removeSkillDirectory(id: string) {
            const directory = this.skillDirectories.find((item) => item.id === id);
            if (!directory) return;

            this.skillDirectories = this.skillDirectories.filter((item) => item.id !== id);
            this.skills = this.skills.filter(
                (skill) => !isSkillFromDirectory(skill, directory.path),
            );
            await this.save();
        },
        async toggleSkillDirectory(id: string, enabled: boolean) {
            const index = this.skillDirectories.findIndex((item) => item.id === id);
            if (index === -1) return;

            this.skillDirectories[index] = {
                ...this.skillDirectories[index],
                enabled,
                updatedAt: Date.now(),
            };

            if (!enabled) {
                const directory = this.skillDirectories[index];
                this.skills = this.skills.filter(
                    (skill) => !isSkillFromDirectory(skill, directory.path),
                );
            }

            await this.save();
        },
        async syncSkillDirectories() {
            if (!canUseLocalFileSystem() || this.directoriesSyncing) return;

            this.directoriesSyncing = true;
            const warnings: string[] = [];
            const activeDirectories = this.skillDirectories.filter(
                (directory) => directory.enabled,
            );
            const seenDedupeKeys = new Set<string>();
            const importedSkills: IImportedSkill[] = [];

            try {
                for (const directory of activeDirectories) {
                    const result = await discoverSkillsInDirectory(directory.path);
                    importedSkills.push(...result.skills);
                    result.skills.forEach((skill) => seenDedupeKeys.add(skill.dedupeKey));
                    warnings.push(
                        ...result.warnings.map(
                            (warning) => `${directory.label || directory.path}：${warning}`,
                        ),
                    );

                    const index = this.skillDirectories.findIndex(
                        (item) => item.id === directory.id,
                    );
                    if (index !== -1) {
                        this.skillDirectories[index] = {
                            ...this.skillDirectories[index],
                            lastSyncedAt: Date.now(),
                            lastSkillCount: result.skills.length,
                            lastWarning: result.warnings[0],
                            updatedAt: Date.now(),
                        };
                    }
                }

                if (importedSkills.length > 0) {
                    await this.upsertImportedSkills(importedSkills);
                }

                this.skills = this.skills.filter((skill) => {
                    const sourceDirectory = activeDirectories.find((directory) =>
                        isSkillFromDirectory(skill, directory.path),
                    );
                    if (!sourceDirectory) return true;
                    return seenDedupeKeys.has(skill.dedupeKey);
                });
                this.lastDirectorySyncWarnings = warnings;
                await this.save();
            } finally {
                this.directoriesSyncing = false;
            }
        },
        getEnabledSkillsPrompt(options?: {
            title?: string;
            maxSkills?: number;
            maxChars?: number;
        }) {
            return buildCompatibleSkillsPrompt(this.enabledSkills, options);
        },
    },
});
