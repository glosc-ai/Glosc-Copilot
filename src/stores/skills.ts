import { defineStore } from "pinia";
import { generateText } from "ai";

import { storeUtils } from "@/utils/StoreUtils";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import {
    createLanguageModelFromProvider,
    resolveCustomProviderSelection,
} from "@/utils/LocalAiProvider";
import {
    buildCompatibleSkillsPrompt,
    discoverDefaultAgentSkillDirectories,
    isSkillFromDirectory,
    type ICompatibleSkillPromptDirectory,
    type IImportedSkill,
} from "@/utils/SkillCompatibility";
import { readSkillsDirectoryWithGloscMcp } from "@/utils/SkillMcpReader";

const STORE_KEY = "compatible_skills_v1";
const DIRECTORIES_STORE_KEY = "compatible_skill_directories_v1";
const ORGANIZE_SKILLS_BATCH_SIZE = 20;
const ORGANIZE_SKILL_INSTRUCTION_MAX_CHARS = 900;

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

interface ISkillOrganizationSuggestion {
    id: string;
    tags: string[];
    note: string;
}

interface ISkillOrganizationResult {
    updated: number;
    suggested: number;
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
    return String(path || "")
        .replace(/\\/g, "/")
        .replace(/\/+$/, "")
        .trim();
}

function cloneDirectory(directory: ISkillDirectoryConfig) {
    return { ...directory } satisfies ISkillDirectoryConfig;
}

function extractJsonObject(input: string): Record<string, unknown> {
    const text = String(input || "").trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || text;
    try {
        return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start >= 0 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1)) as Record<
                string,
                unknown
            >;
        }
        throw new Error("AI 返回内容不是有效 JSON");
    }
}

function chunkSkills(skills: IImportedSkill[]) {
    const chunks: IImportedSkill[][] = [];
    for (
        let index = 0;
        index < skills.length;
        index += ORGANIZE_SKILLS_BATCH_SIZE
    ) {
        chunks.push(skills.slice(index, index + ORGANIZE_SKILLS_BATCH_SIZE));
    }
    return chunks;
}

function truncateText(input: string, maxChars: number) {
    const text = String(input || "")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeTag(input: string) {
    return String(input || "")
        .replace(/[{}[\]"'`]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 18);
}

function mergeSkillTags(generatedTags: string[], existingTags: string[]) {
    const blocked = new Set([
        "skill",
        "skills",
        "agent skill",
        "agent skills",
        "agent-skills",
        "assistant",
    ]);
    const seen = new Set<string>();
    const result: string[] = [];

    const addTag = (rawTag: string, skipGeneric: boolean) => {
        const tag = normalizeTag(rawTag);
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) return;
        if (skipGeneric && blocked.has(key)) return;
        seen.add(key);
        result.push(tag);
    };

    for (const rawTag of generatedTags) {
        addTag(rawTag, true);
        if (result.length >= 8) break;
    }

    for (const rawTag of existingTags) {
        addTag(rawTag, false);
        if (result.length >= 8) break;
    }

    return result;
}

function normalizeNote(input: string) {
    return String(input || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90);
}

function getStringArray(input: unknown) {
    if (!Array.isArray(input)) return [];
    return input.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseOrganizationSuggestions(input: string) {
    const parsed = extractJsonObject(input);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const suggestions: ISkillOrganizationSuggestion[] = [];

    for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const id = String(record.id || "").trim();
        if (!id) continue;

        suggestions.push({
            id,
            tags: getStringArray(record.tags),
            note: normalizeNote(String(record.note || "")),
        });
    }

    return suggestions;
}

function getUserLanguage(settingsLanguage: string) {
    const candidates = [
        settingsLanguage,
        typeof navigator !== "undefined" ? navigator.language : "",
        ...(typeof navigator !== "undefined" ? navigator.languages || [] : []),
    ];
    return (
        candidates.map((item) => String(item || "").trim()).find(Boolean) ||
        "zh-CN"
    );
}

function getLanguageInstruction(language: string) {
    const normalized = String(language || "").toLowerCase();
    if (normalized.startsWith("zh")) return "简体中文";
    if (normalized.startsWith("ja")) return "日语";
    if (normalized.startsWith("ko")) return "韩语";
    if (normalized.startsWith("en")) return "English";
    return language || "用户使用的语言";
}

function buildSkillOrganizationInput(skill: IImportedSkill) {
    return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        currentTags: skill.ecosystemTags,
        currentNote: skill.userNote || "",
        compatibility: skill.compatibility,
        allowedTools: skill.allowedTools,
        source: skill.source.label,
        packageKind: skill.packageMeta?.kind || "",
        packageName:
            skill.packageMeta?.displayName ||
            skill.packageMeta?.packageName ||
            "",
        packageSummary: skill.packageMeta?.summary || "",
        bundledMcpCount: skill.bundledMcpCount,
        files: skill.files.slice(0, 12).map((file) => file.path),
        instructions: truncateText(
            skill.instructions || skill.rawMarkdown,
            ORGANIZE_SKILL_INSTRUCTION_MAX_CHARS,
        ),
    };
}

function buildSkillOrganizationPrompt(
    skills: IImportedSkill[],
    language: string,
) {
    const languageInstruction = getLanguageInstruction(language);
    const skillInputs = skills.map(buildSkillOrganizationInput);

    return [
        "你是 Agent Skills 信息整理助手。",
        `请使用用户偏好的语言：${languageInstruction}。`,
        "请根据每个 Skill 的名称、描述、指令摘要、工具、来源和文件名，为每个 Skill 生成便于检索的标签和一句备注。",
        "只输出 JSON，不要 Markdown，不要解释。",
        'JSON 格式：{"items":[{"id":"skill id","tags":["标签1","标签2"],"note":"一句备注"}]}',
        "规则：",
        "- 只处理输入中提供的 id，不要编造 id。",
        "- tags 每个 Skill 3 到 5 个，使用短词或短语，优先体现能力、场景、工具类型。",
        "- 避免使用 skill、skills、assistant、agent-skills 这类泛泛标签。",
        "- note 20 到 60 个字，说明适合何时使用；不要包含换行。",
        "- tags 和 note 使用用户语言；技术名词、产品名、命令名可以保留原文。",
        `Skills：${JSON.stringify(skillInputs)}`,
    ].join("\n");
}

function haveSameStringArray(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
}

function canUseLocalFileSystem() {
    return (
        typeof window !== "undefined" &&
        Boolean((window as any).__TAURI_INTERNALS__)
    );
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
                .map(
                    (skill) =>
                        `${skill.id}:${skill.updatedAt}:${skill.enabled ? 1 : 0}`,
                )
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
                const incomingSkill = cloneSkill(incoming);
                next[index] = {
                    ...incomingSkill,
                    id: existing.id,
                    enabled: existing.enabled,
                    ecosystemTags: mergeSkillTags(
                        existing.ecosystemTags,
                        incomingSkill.ecosystemTags,
                    ),
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
        async organizeSkillsWithAi(): Promise<ISkillOrganizationResult> {
            if (this.skills.length === 0) {
                return { updated: 0, suggested: 0 };
            }

            const settingsStore = useSettingsStore();
            const chatStore = useChatStore();
            await settingsStore.init();

            let selectedModelId = settingsStore.getAssignedModelId("skills");
            if (!selectedModelId) {
                if (!chatStore.selectedModel) {
                    await chatStore.loadAvailableModels();
                }
                selectedModelId = chatStore.selectedModel?.id || null;
            }

            const resolved = resolveCustomProviderSelection(
                selectedModelId,
                settingsStore.getCustomModelProviderById,
            );
            if (!resolved) {
                throw new Error(
                    "请先在模型设置中为 Skills 管理模型选择一个已验证的本地或自定义服务商模型。",
                );
            }

            const language = getUserLanguage(settingsStore.language);
            const suggestionMap = new Map<
                string,
                ISkillOrganizationSuggestion
            >();

            for (const skillBatch of chunkSkills(this.skills)) {
                const { text } = await generateText({
                    model: createLanguageModelFromProvider(
                        resolved.provider,
                        resolved.rawModelId,
                    ),
                    prompt: buildSkillOrganizationPrompt(skillBatch, language),
                    temperature: 0.2,
                });

                for (const suggestion of parseOrganizationSuggestions(text)) {
                    suggestionMap.set(suggestion.id, suggestion);
                }
            }

            if (suggestionMap.size === 0) {
                return { updated: 0, suggested: 0 };
            }

            const now = Date.now();
            let updated = 0;

            this.skills = this.skills.map((skill) => {
                const suggestion = suggestionMap.get(skill.id);
                if (!suggestion) return skill;

                const nextTags = mergeSkillTags(
                    suggestion.tags,
                    skill.ecosystemTags,
                );
                const currentNote = String(skill.userNote || "").trim();
                const nextNote = currentNote || suggestion.note;
                const tagsChanged = !haveSameStringArray(
                    skill.ecosystemTags,
                    nextTags,
                );
                const noteChanged = !currentNote && Boolean(nextNote);

                if (!tagsChanged && !noteChanged) return skill;
                updated += 1;

                return {
                    ...skill,
                    ecosystemTags: tagsChanged ? nextTags : skill.ecosystemTags,
                    userNote: nextNote,
                    updatedAt: now,
                } satisfies IImportedSkill;
            });

            if (updated > 0) {
                await this.save();
            }

            return { updated, suggested: suggestionMap.size };
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
                        existing.autoDiscovered ||
                        Boolean(params.autoDiscovered),
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
            const directory = this.skillDirectories.find(
                (item) => item.id === id,
            );
            if (!directory) return;

            this.skillDirectories = this.skillDirectories.filter(
                (item) => item.id !== id,
            );
            this.skills = this.skills.filter(
                (skill) => !isSkillFromDirectory(skill, directory.path),
            );
            await this.save();
        },
        async toggleSkillDirectory(id: string, enabled: boolean) {
            const index = this.skillDirectories.findIndex(
                (item) => item.id === id,
            );
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

            const mcpStore = useMcpStore();

            this.directoriesSyncing = true;
            const warnings: string[] = [];
            const activeDirectories = this.skillDirectories.filter(
                (directory) => directory.enabled,
            );
            const seenDedupeKeys = new Set<string>();
            const importedSkills: IImportedSkill[] = [];

            try {
                for (const directory of activeDirectories) {
                    const result = await readSkillsDirectoryWithGloscMcp(
                        mcpStore,
                        directory.path,
                    );
                    importedSkills.push(...result.skills);
                    result.skills.forEach((skill) =>
                        seenDedupeKeys.add(skill.dedupeKey),
                    );
                    warnings.push(
                        ...result.warnings.map(
                            (warning) =>
                                `${directory.label || directory.path}：${warning}`,
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
                    const sourceDirectory = activeDirectories.find(
                        (directory) =>
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
            const directories = this.skillDirectories.map(
                (directory) =>
                    ({
                        label: directory.label,
                        path: directory.path,
                        agent: directory.agent,
                        enabled: directory.enabled,
                        lastSkillCount: directory.lastSkillCount,
                        lastWarning: directory.lastWarning,
                    }) satisfies ICompatibleSkillPromptDirectory,
            );

            return buildCompatibleSkillsPrompt(this.enabledSkills, {
                ...options,
                directories,
            });
        },
    },
});
