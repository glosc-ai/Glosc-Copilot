import { defineStore } from "pinia";

import { storeUtils } from "@/utils/StoreUtils";
import {
    buildCompatibleSkillsPrompt,
    type IImportedSkill,
} from "@/utils/SkillCompatibility";

const STORE_KEY = "compatible_skills_v1";

function cloneSkill(skill: IImportedSkill) {
    return {
        ...skill,
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

export const useSkillsStore = defineStore("skills", {
    state: () => ({
        skills: [] as IImportedSkill[],
        initialized: false,
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
            const stored = await storeUtils.get<IImportedSkill[]>(STORE_KEY);
            this.skills = Array.isArray(stored) ? stored.map(cloneSkill) : [];
            this.initialized = true;
        },
        async save() {
            await storeUtils.set(STORE_KEY, this.skills, false);
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
        async setSkillEnabledAll(enabled: boolean) {
            const nextUpdatedAt = Date.now();
            this.skills = this.skills.map((skill) => ({
                ...skill,
                enabled,
                updatedAt: nextUpdatedAt,
            }));
            await this.save();
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
