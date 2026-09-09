use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct Sidecar(Mutex<Option<CommandChild>>);

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let logs_dir = app.path().app_log_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(data_dir.join("backups"))?;
            std::fs::create_dir_all(&logs_dir)?;

            let (mut events, child) = app
                .shell()
                .sidecar("novelhub-sidecar")?
                .env("NOVEL_HUB_PACKAGED", "1")
                .env("NOVEL_HUB_HOST", "127.0.0.1")
                .env("NOVEL_HUB_PORT", "17831")
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
