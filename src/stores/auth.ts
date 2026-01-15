import { defineStore } from "pinia";
import { storeUtils } from "@/utils/StoreUtils";

export type AuthUserPublic = {
    id: string;
    email?: string;
    name?: string;
    githubLogin?: string;
    githubId?: number;
    avatarUrl?: string;
    microsoftOid?: string;
    appleSub?: string;
};

type DesktopAuthStartResponse = {
    ok: boolean;
    deviceId: string;
    verifyUrl: string;
    expiresAt: string;
    intervalSec: number;
};

type DesktopAuthStatusResponse =
    | {
          ok: boolean;
          status: "pending" | "expired" | "not_found";
          token: null;
          user: null;
          expiresAt?: string;
      }
    | {
          ok: boolean;
          status: "approved";
          token: string;
          user: AuthUserPublic | null;
          expiresAt?: string;
      };

function getWebHost() {
    return (
        import.meta.env.VITE_API_HOST ||
        import.meta.env.VITE_SITE_HOST ||
        "https://www.glosc.ai"
    );
}

function safeString(value: any) {
    return typeof value === "string"
        ? value
        : value == null
          ? ""
          : String(value);
}

async function openExternal(url: string) {
    if (!url) return;

    // Vite browser dev fallback
    if (!(window as any).__TAURI_INTERNALS__) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }

    try {
        // Prefer Tauri opener plugin if available
        const mod: any = await import("@tauri-apps/plugin-opener");
        const fn = mod?.openUrl || mod?.open;
        if (typeof fn === "function") {
            await fn(url);
            return;
        }
    } catch {
        // ignore
    }

    // Fallback: try shell open (may be blocked depending on allowlist)
    try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
    } catch {
        // ignore
    }
}

export const useAuthStore = defineStore("auth", {
    state: () => ({
        initialized: false,
        pending: false,
        token: null as string | null,
        user: null as AuthUserPublic | null,
        lastError: null as string | null,
        pollingDeviceId: null as string | null,
        pollingStartedAt: 0,
        authEpoch: 0,
    }),
    getters: {
        // Token is the source of truth for auth (Bearer token is sent to APIs).
        isLoggedIn: (state) => Boolean(state.token),
        displayName: (state) =>
            state.user?.name ||
            state.user?.email ||
            state.user?.githubLogin ||
            (state.user
                ? `用户 ${state.user.id}`
                : state.token
                  ? "已登录"
                  : ""),
    },
    actions: {
        authTokenKey() {
            return "auth_desktop_token_v1";
        },
        authUserKey() {
            return "auth_desktop_user_v1";
        },

        async init() {
            if (this.initialized) return;
            this.initialized = true;

            const epoch = this.authEpoch;

            try {
                const token = await storeUtils.get<string>(this.authTokenKey());
                const user = await storeUtils.get<AuthUserPublic>(
                    this.authUserKey()
                );

                // If login state changed (e.g. logout) while loading, ignore.
                if (this.authEpoch !== epoch) return;

                // Do not overwrite an already-established in-memory login state.
                this.token = this.token || token || null;
                this.user = this.user || user || null;

                if (this.token && !this.user) {
                    await this.refreshUser();
                }
            } catch (e: any) {
                console.error("Auth init failed", e);
            }
        },

        async setAuth(token: string | null, user: AuthUserPublic | null) {
            this.token = token;
            this.user = user;

            if (!token) {
                // More robust than delete: always overwrite persisted values.
                // This avoids cases where delete doesn't flush before app exit.
                await storeUtils.setMany(
                    [
                        {
                            key: this.authTokenKey(),
                            value: null,
                            encrypt: true,
                        },
                        { key: this.authUserKey(), value: null, encrypt: true },
                    ],
                    true
                );
                return;
            }

            await storeUtils.setMany([
                { key: this.authTokenKey(), value: token, encrypt: true },
                { key: this.authUserKey(), value: user, encrypt: true },
            ]);
        },

        async refreshUser() {
            if (!this.token) return;

            const epoch = this.authEpoch;
            const token = this.token;

            const host = getWebHost();
            try {
                const res = await fetch(`${host}/api/user/me`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                // 如果在请求过程中退出登录/切换登录态，则丢弃这次结果
                if (this.authEpoch !== epoch || this.token !== token) return;

                if (res.status === 401 || res.status === 403) {
                    this.lastError = "登录已失效，请重新登录";
                    await this.setAuth(null, null);
                    return;
                }

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = (await res.json().catch(() => null)) as any;
                const user = (data?.user || null) as AuthUserPublic | null;

                if (this.authEpoch !== epoch || this.token !== token) return;
                this.user = user;
                await storeUtils.set(this.authUserKey(), user, true);
            } catch (e: any) {
                const msg = e?.message || "无法刷新用户信息";
                this.lastError = msg;
                console.warn("refreshUser failed", e);
            }
        },

        async logout() {
            // bump epoch to invalidate any in-flight login/refresh
            this.authEpoch += 1;
            this.pending = false;
            this.pollingDeviceId = null;
            this.pollingStartedAt = 0;
            this.lastError = null;
            await this.setAuth(null, null);
        },

        async startLogin() {
            if (this.pending) return;
            this.pending = true;
            this.lastError = null;

            const epoch = this.authEpoch;

            try {
                const host = getWebHost();

                const startRes = await fetch(`${host}/api/desktop-auth/start`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client: "glosc-copilot",
                        deviceName: safeString(navigator?.userAgent || ""),
                    }),
                });

                if (!startRes.ok) {
                    const text = await startRes.text().catch(() => "");
                    throw new Error(text || `HTTP ${startRes.status}`);
                }

                const startData = (await startRes
                    .json()
                    .catch(() => null)) as DesktopAuthStartResponse | null;

                if (
                    !startData?.ok ||
                    !startData.deviceId ||
                    !startData.verifyUrl
                ) {
                    throw new Error("启动登录失败（返回数据不完整）");
                }

                if (this.authEpoch !== epoch) return;

                this.pollingDeviceId = startData.deviceId;
                this.pollingStartedAt = Date.now();

                await openExternal(startData.verifyUrl);

                if (this.authEpoch !== epoch) return;

                await this.pollForApproval({
                    deviceId: startData.deviceId,
                    intervalMs: Math.max(
                        1000,
                        (startData.intervalSec || 2) * 1000
                    ),
                    expiresAt: startData.expiresAt,
                });
            } catch (e: any) {
                const msg = e?.message || "启动登录失败";
                this.lastError = msg;
                ElMessage.error(msg);
            } finally {
                // 如果期间被 logout() 终止，不要把 pending 强行复活成 true
                if (this.authEpoch === epoch) {
                    this.pending = false;
                }
            }
        },

        async pollForApproval(params: {
            deviceId: string;
            intervalMs: number;
            expiresAt: string;
        }) {
            const host = getWebHost();
            const expiresTs = Date.parse(params.expiresAt);
            const maxWaitMs = 12 * 60 * 1000;
            const startedAt = Date.now();
            const epoch = this.authEpoch;

            while (true) {
                if (this.pollingDeviceId !== params.deviceId) return;
                if (this.authEpoch !== epoch) return;

                const now = Date.now();
                if (Number.isFinite(expiresTs) && now > expiresTs) {
                    this.lastError = "登录已过期，请重试";
                    ElMessage.warning(this.lastError);
                    return;
                }
                if (now - startedAt > maxWaitMs) {
                    this.lastError = "等待授权超时，请重试";
                    ElMessage.warning(this.lastError);
                    return;
                }

                try {
                    const url = `${host}/api/desktop-auth/status?deviceId=${encodeURIComponent(
                        params.deviceId
                    )}`;
                    const res = await fetch(url, {
                        method: "GET",
                        headers: { "Content-Type": "application/json" },
                    });

                    if (this.pollingDeviceId !== params.deviceId) return;
                    if (this.authEpoch !== epoch) return;

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const data = (await res
                        .json()
                        .catch(() => null)) as DesktopAuthStatusResponse | null;

                    if (data?.status === "approved" && data.token) {
                        if (this.pollingDeviceId !== params.deviceId) return;
                        if (this.authEpoch !== epoch) return;
                        await this.setAuth(data.token, data.user);
                        await this.refreshUser();
                        ElMessage.success("登录成功，已同步到桌面端");
                        return;
                    }

                    if (data?.status === "expired") {
                        this.lastError = "登录已过期，请重试";
                        ElMessage.warning(this.lastError);
                        return;
                    }
                } catch (e) {
                    // ignore transient failures
                }

                await new Promise((r) => setTimeout(r, params.intervalMs));
            }
        },

        openAccountPage() {
            const host = getWebHost();
            void openExternal(`${host}/me`);
        },
    },
});
