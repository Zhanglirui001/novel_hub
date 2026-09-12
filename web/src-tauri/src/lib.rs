use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct Sidecar(Mutex<Option<CommandChild>>);

#[derive(Clone, serde::Serialize)]
struct RuntimeConfig {
    port: u16,
    token: String,
}

#[tauri::command]
fn runtime_config(config: tauri::State<'_, RuntimeConfig>) -> RuntimeConfig {
    config.inner().clone()
}

#[tauri::command]
async fn save_backup_file(name: String, content: String) -> Result<bool, String> {
    if content.len() > 128 * 1024 * 1024 {
        return Err("备份不能超过 128 MB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let safe_name = std::path::Path::new(&name).file_name()
            .and_then(|n| n.to_str()).unwrap_or("library.novelhub").to_string();
        let Some(path) = rfd::FileDialog::new().set_title("另存备份")
            .add_filter("Novel Hub 备份", &["novelhub", "novelhub-project"])
            .set_file_name(safe_name).save_file() else { return Ok(false); };
        use std::io::Write;
        let directory = path.parent().ok_or_else(|| "无效的保存路径".to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
        temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(path).map_err(|e| e.to_string())?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_diagnostics(content: String) -> Result<bool, String> {
    if content.len() > 2 * 1024 * 1024 {
        return Err("诊断信息不能超过 2 MB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let Some(path) = rfd::FileDialog::new().set_title("导出诊断信息")
            .add_filter("Novel Hub 诊断", &["txt"]).set_file_name("novel-hub-diagnostics.txt").save_file() else { return Ok(false); };
        let directory = path.parent().ok_or_else(|| "无效的保存路径".to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
        temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(path).map_err(|e| e.to_string())?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_backup_file, export_diagnostics, runtime_config])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let override_dir = std::env::var_os("NOVEL_HUB_DATA_DIR");
            let data_dir = override_dir.clone().map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            if !data_dir.is_absolute() {
                return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "NOVEL_HUB_DATA_DIR must be absolute").into());
            }
            let logs_dir = if override_dir.is_some() { data_dir.join("logs") } else { app.path().app_log_dir()? };
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(data_dir.join("backups"))?;
            std::fs::create_dir_all(&logs_dir)?;
            let runtime_config = RuntimeConfig { port: 17831, token: uuid::Uuid::new_v4().simple().to_string() };

            let (mut events, child) = app
                .shell()
                .sidecar("novelhub-sidecar")?
                .env("NOVEL_HUB_PACKAGED", "1")
                .env("NOVEL_HUB_IMPORT_LEGACY", if override_dir.is_some() { "0" } else { "1" })
                .env("NOVEL_HUB_HOST", "127.0.0.1")
                .env("NOVEL_HUB_PORT", runtime_config.port.to_string())
                .env("NOVEL_HUB_TOKEN", &runtime_config.token)
                .env("DATABASE_BACKEND", "sqlite")
                .env("SQLITE_PATH", data_dir.join("novel_hub.db"))
                .env("BACKUP_DIR", data_dir.join("backups"))
                .env("NOVEL_HUB_CRASH_LOG", logs_dir.join("sidecar-crash.log"))
                .env(
                    "CORS_ORIGINS",
                    "http://tauri.localhost,https://tauri.localhost,tauri://localhost",
                )
                .spawn()?;

            tauri::async_runtime::spawn(async move {
                // Draining events prevents a noisy sidecar from blocking on stdout.
                while events.recv().await.is_some() {}
            });
            app.manage(Sidecar(Mutex::new(Some(child))));
            app.manage(runtime_config);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<Sidecar>() {
                    if let Some(child) = state.0.lock().expect("sidecar lock poisoned").take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Novel Hub");

    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(state) = handle.try_state::<Sidecar>() {
                if let Some(child) = state.0.lock().expect("sidecar lock poisoned").take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
