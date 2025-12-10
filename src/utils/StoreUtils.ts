import { Store } from "@tauri-apps/plugin-store";
import { Cryption } from "./Cryption";

export class StoreUtils {
    private store: Store | null = null;
    private initPromise: Promise<void> | null = null;

    private key = "if)_Qa?fc?(8Vil<kYC$9X0w)+07RrBj:SIZV>yTOLm}&_)yD8";

    constructor(private path: string = "store.bin") {
        this.init();
    }

    private async init() {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                try {
                    this.store = await Store.load(this.path);
                } catch (error) {
                    console.error("Failed to load store:", error);
                }
            })();
        }
        await this.initPromise;
    }

    private async ensureStore(): Promise<Store> {
        if (!this.store) {
            await this.init();
        }
        if (!this.store) {
            throw new Error(`Store not initialized: ${this.path}`);
        }
        return this.store;
    }

    /**
     * 获取值
     * @param key 键
     * @returns 值
     */
    async get<T>(key: string): Promise<T | null> {
        const store = await this.ensureStore();
        const data = await store.get<string>(key);
        if (!data) return null;

        if (data.startsWith("PLAIN:")) {
            try {
                return JSON.parse(data.substring(6)) as T;
            } catch (e) {
                // If it's not JSON, return as string (though we always stringify in set)
                // But for safety, if JSON.parse fails, maybe it was a raw string?
                // In set(), we do JSON.stringify(value) unless it's a string.
                // If value was "foo", jsonString is "foo".
                // If value was {a:1}, jsonString is "{\"a\":1}".
                // So JSON.parse should work if it was an object.
                // If it was a simple string "foo", JSON.parse("foo") -> "foo".
                // So JSON.parse is correct.
                return data.substring(6) as unknown as T;
            }
        }

        try {
            const decrypted = Cryption.decryptData(data, this.key);
            return JSON.parse(decrypted) as T;
        } catch (error) {
            console.warn(
                `Failed to decrypt or parse data for key: ${key}`,
                error
            );
            return null;
        }
    }

    /**
     * 设置值并保存
     * @param key 键
     * @param value 值
     * @param encrypt 是否加密，默认为 true
     */
    async set(key: string, value: any, encrypt: boolean = true) {
        const store = await this.ensureStore();
        const jsonString =
            typeof value === "string" ? value : JSON.stringify(value);

        let valueToStore: string;
        if (encrypt) {
            valueToStore = Cryption.encryptData(jsonString, this.key);
        } else {
            valueToStore = "PLAIN:" + jsonString;
        }

        await store.set(key, valueToStore);
        await store.save();
    }

    /**
     * 删除值并保存
     * @param key 键
     * @returns 是否删除成功
     */
    async delete(key: string) {
        const store = await this.ensureStore();
        const result = await store.delete(key);
        await store.save();
        return result;
    }

    /**
     * 检查键是否存在
     * @param key 键
     * @returns 是否存在
     */
    async has(key: string) {
        const store = await this.ensureStore();
        return await store.has(key);
    }

    /**
     * 清空所有数据并保存
     */
    async clear() {
        const store = await this.ensureStore();
        await store.clear();
        await store.save();
    }

    /**
     * 手动保存
     */
    async save() {
        const store = await this.ensureStore();
        await store.save();
    }
}

export const storeUtils = new StoreUtils();
