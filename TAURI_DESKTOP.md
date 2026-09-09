# Novel Hub 桌面架构

## 产品运行模型

```text
Tauri 2（窗口、单实例、进程生命周期）
  ├─ Next.js 静态 UI（打包进 WebView，不再携带 Node.js）
  └─ FastAPI sidecar（仅监听 127.0.0.1:17831）
       └─ SQLite WAL（系统应用数据目录）
```

Windows 用户数据由 Tauri 放在应用数据目录，包括 `novel_hub.db`、`backups/`
和日志。卸载/升级应用包不会把作品放进安装目录。

浏览器开发模式仍使用 `http://localhost:3001` + `http://127.0.0.1:8000`。

## 首次准备

安装 Rust stable、Windows C++ Build Tools、WebView2，然后执行：

```powershell
cd web
npm install
cd ..
.\scripts\prepare_tauri_sidecar.ps1
```

sidecar 会生成到 Tauri 要求的目标三元组文件名：

```text
web/src-tauri/binaries/novelhub-sidecar-x86_64-pc-windows-msvc.exe
```

## 开发与发布

```powershell
cd web
npm run desktop:dev

# 生成 MSI / NSIS 安装包
npm run desktop:build
```

前端可独立验证：

```powershell
cd web
npm run build
```

## 边界约定

- Tauri 只负责系统能力，不承载业务逻辑。
- FastAPI 是桌面应用唯一的数据/模型能力入口。
- Web UI 不直接读写 SQLite，确保浏览器开发与桌面运行行为一致。
- 生产前端使用静态路由：`/workspace/?project=ID` 与 `/inspiration/?project=ID`。
- sidecar 仅绑定 loopback，并通过严格 CORS 限制到 Tauri origin。

## 下一阶段产品能力

建议按优先级继续推进：全局命令面板、任务队列与运行中心、项目级文件导入导出、
可恢复版本历史、系统托盘/后台任务、自动更新与代码签名。AI 输出应统一进入“建议 →
差异预览 → 用户确认 → 写入”的产物流，而不是直接散落在不同面板中。
