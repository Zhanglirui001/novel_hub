# Novel Hub Windows 打包与发布

当前发布架构已经迁移为 Tauri 2：Next.js 静态资源由 WebView2 加载，FastAPI 作为
sidecar 由桌面壳管理，SQLite 数据保存在用户应用数据目录。最终用户不再需要浏览器、
Node.js、Python 或 MySQL。

完整架构、依赖和开发命令见 [TAURI_DESKTOP.md](TAURI_DESKTOP.md)。

## 构建

开发机需要 Python、Node.js、Rust stable、Visual Studio C++ Build Tools 与 Windows SDK。

```powershell
.\build_windows.ps1
```

只生成可执行文件、不生成 MSI/NSIS：

```powershell
.\build_windows.ps1 -SkipDependencyInstall -SkipInstaller
```

产物位于：

```text
web\src-tauri\target\release\
web\src-tauri\target\release\bundle\msi\
web\src-tauri\target\release\bundle\nsis\
```

## 用户数据

数据库、备份与日志由 Tauri 的应用数据 API 定位，不写入安装目录。应用升级不会覆盖作品。
旧 MySQL 数据仍可通过 `scripts/migrate_mysql_to_sqlite.py` 一次性迁移。
