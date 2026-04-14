fn is_truthy_env(name: &str) -> bool {
    matches!(
        std::env::var(name).ok().as_deref(),
        Some("1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON")
    )
}

fn main() {
    // 为 App Store 构建注入一个显式 cfg，方便在 Rust 侧关闭不允许的能力。
    println!("cargo:rustc-check-cfg=cfg(app_store)");

    if is_truthy_env("GLOSC_APP_STORE") {
        println!("cargo:rustc-cfg=app_store");
    }

    tauri_build::build()
}
