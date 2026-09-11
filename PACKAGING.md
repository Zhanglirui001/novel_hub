# Novel Hub Windows 打包与发布

当前版本：0.3.0。发布前运行 `python scripts/check_release_version.py` 检查 API、前端、Tauri 和安装元数据的一致性。
新的安装包由 Tauri 构建，集中复制到 `release/0.3.0/`；旧的 `release/NovelHub-Setup-0.1.0.exe` 是历史产物，不代表当前源码。
`installer/NovelHub.iss` 和 `desktop_launcher.py` 仅保留给旧架构参考，不属于当前构建链。

当前发布架构已经迁移为 Tauri 2：Next.js 静态资源由 WebView2 加载，FastAPI 作为
sidecar 由桌面壳管理，SQLite 数据保存在用户应用数据目录。最终用户不再需要浏览器、
Node.js、Python 或 MySQL。

完整架构、依赖和开发命令见 [TAURI_DESKTOP.md](TAURI_DESKTOP.md)。

## 构建

开发机需要 Python、Node.js、Rust stable、Visual Studio C++ Build Tools 与 Windows SDK。

```powershell
.\build_windows.ps1
```

脚本也支持项目内 `.runtime/msvc` 的便携 C++/SDK 工具链，并自动发现当前用户安装的 Rust。Rust 依赖使用提交的 `Cargo.lock` 锁定。
安装包需要 WebView2；本机没有时安装程序会下载官方引导程序，此首次安装步骤需要网络。
当前安装包未进行代码签名。

数据备份及恢复说明见 [RECOVERY.md](RECOVERY.md)。

可用 `NOVEL_HUB_DATA_DIR` 指定绝对数据目录，用于隔离测试或独立书架；默认仍使用系统应用数据目录。指定独立目录时不自动导入旧版数据。
打包后运行 `python scripts/smoke_sidecar.py dist/novelhub-sidecar.exe` 和 `python scripts/smoke_desktop.py web/src-tauri/target/release/novel-hub.exe` 验证实际可执行文件，两者使用临时书架并在测试结束后停止测试进程。

只生成可执行文件、不生成 MSI/NSIS：

```powershell
.\build_windows.ps1 -SkipDependencyInstall -SkipInstaller
```

产物位于：

```text
release\0.3.0\Novel Hub_0.3.0_x64-setup.exe
release\0.3.0\Novel Hub_0.3.0_x64_en-US.msi
web\src-tauri\target\release\novel-hub.exe
```

## 用户数据

数据库、备份与日志由 Tauri 的应用数据 API 定位，不写入安装目录。应用升级不会覆盖作品。
旧 MySQL 数据仍可通过 `scripts/migrate_mysql_to_sqlite.py` 一次性迁移。
