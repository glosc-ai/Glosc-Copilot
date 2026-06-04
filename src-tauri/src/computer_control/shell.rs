use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;

/// Result of a shell command execution.
#[derive(Serialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Execute a shell command using system shell (sh -c / cmd /C).
#[tauri::command]
pub fn computer_exec_command(
    _app: AppHandle,
    command: String,
) -> Result<ShellResult, String> {
    // Determine the shell command based on platform
    #[cfg(target_os = "windows")]
    let (shell_cmd, shell_arg) = ("cmd", "/C");
    #[cfg(not(target_os = "windows"))]
    let (shell_cmd, shell_arg) = ("sh", "-c");

    let output = Command::new(shell_cmd)
        .arg(shell_arg)
        .arg(&command)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    Ok(ShellResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
