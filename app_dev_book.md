# App_dev_book

### 桌面应用化改造

> 请问如果想把该项目变成一键启动的应用？你是建议增加一个启动脚本还是改造成一个桌面应用？

我建议先增加“一键启动脚本”，暂时不要直接改造成桌面应用。

这个项目当前是 Next.js + FastAPI + MySQL 的标准 Web 架构。为了“一键启动”而立刻桌面化，会额外引入进程管理、数据库打包、端口分配、自动更新和安装包签名等问题，改造成本明显更高。

建议分阶段做：

1. 先实现 Windows 一键启动

增加 `start.ps1` 和 `start.bat`，自动完成：

- 检查 Python、Node.js、MySQL
- 首次运行时安装依赖
- 初始化数据库
- 启动 FastAPI 和 Next.js
- 等待服务就绪
- 自动打开 `http://localhost:3001`
- 防止重复启动
- 将日志和 PID 放到专用运行目录

同时增加 `stop.ps1`，一键关闭该项目启动的前后端进程。

这最适合目前的开发和内部使用场景，改动小，也不会破坏现有架构。

1. 再制作免环境安装版本

如果要交给不懂开发的用户，可以进一步：

- 前端执行生产构建，不再使用开发服务器
- Python 后端用 PyInstaller 打包
- 将 MySQL 改成 SQLite，或提供内置数据库服务
- 制作统一启动器
- 用 Inno Setup / NSIS 生成 Windows 安装包

做到双击桌面图标即可运行，不需要用户安装 Python、Node.js 或 MySQL。

1. 最后再考虑真正的桌面应用

如果需要系统托盘、文件拖放、本地菜单、离线使用、自动更新等桌面能力，再选择：

- Tauri：安装包小、资源占用低，但需要处理 Rust 与 Python 后端集成
- Electron：生态成熟、与 Next.js 接合自然，但体积和内存占用较大

对于 Novel Hub，我个人更倾向于“Tauri 外壳 + 现有 Web UI + FastAPI sidecar + SQLite”。但这已经属于产品化改造，而不仅是一键启动。

结论：当前最合理的是先做完善的启动/停止脚本。等功能稳定、准备分发给普通用户时，再改成桌面安装包。尤其建议在桌面化前先解决 MySQL 依赖，否则所谓的一键应用仍然要求用户单独配置数据库。



> 先实现完善的启动/停止脚本

已完成并验证一键启动/停止脚本：

- 双击 [start.bat](C:\\Data\\agentGroups\\novel_hub\\start.bat) 启动
- 双击 [stop.bat](C:\\Data\\agentGroups\\novel_hub\\stop.bat) 停止
- PowerShell 高级入口：[start.ps1](C:\\Data\\agentGroups\\novel_hub\\start.ps1)、[stop.ps1](C:\\Data\\agentGroups\\novel_hub\\stop.ps1)
- 使用说明：[STARTUP.md](C:\\Data\\agentGroups\\novel_hub\\STARTUP.md)

启动脚本支持：

- 检查 Python、Node.js 和 npm
- 首次自动安装缺失依赖
- 初始化并检查 MySQL
- 检查端口占用
- 启动前后端并等待健康检查通过
- 自动打开浏览器
- 保存日志和经过身份校验的 PID
- 重复启动时安全重启
- 启动失败时自动清理进程

> - 前端执行生产构建，不再使用开发服务器
> - Python 后端用 PyInstaller 打包
> - 将 MySQL 改成 SQLite，或提供内置数据库服务
> - 制作统一启动器
> - 用 Inno Setup / NSIS 生成 Windows 安装包
>
> 尝试做到双击桌面图标即可运行，不需要用户安装 Python、Node.js 或 MySQL。

已完成 Windows 桌面安装版，并已实际安装和验证。

安装包：[NovelHub-Setup-0.1.0.exe](C:/Data/agentGroups/novel_hub/release/NovelHub-Setup-0.1.0.exe)

实现内容：

- Next.js standalone 生产服务
- PyInstaller 打包 FastAPI 与统一启动器
- 默认切换至 SQLite
- 内置 Node.js，无需用户安装
- 桌面快捷方式一键启动并打开浏览器
- 重复启动只打开页面，不重复运行服务
- 开始菜单提供 `Stop Novel Hub`
- 用户数据保存在 `%LOCALAPPDATA%\NovelHub`
- 原 MySQL 数据已迁移：11 张表、37 条记录
- 安装器不会在卸载时删除作品数据

验收结果：

- 安装成功，桌面快捷方式已创建
- 安装目录独立启动成功
- 前端和 API 均返回 `200`
- 成功读取 2 个现有作品
- 停止入口正常释放全部端口
- 18 项测试全部通过
- 安装包约 78.3 MB
- SHA-256：`8983ED0B676792AFE9A3824078A62F02C2D28C28180BF93F8EED491D04ABC56A`

构建说明见 [PACKAGING.md](C:/Data/agentGroups/novel_hub/PACKAGING.md)。应用当前处于停止状态，现在可以直接双击桌面的 `Novel Hub` 图标运行。安装包尚未进行代码签名，因此在其他电脑上可能出现 Windows SmartScreen 的“未知发布者”提示。

> 将该项目朝向“Tauri 外壳 + 现有 Web UI + FastAPI sidecar + SQLite 的产品化方向改造，另外现有的ui你觉得还有可以改进的方向吗？我其实希望可以做成类似workbudy、codex等类似的桌面应用产品形式。而不是仅仅是一个ai修改和编辑的网页。

已完成第一阶段桌面产品化改造，项目现在的目标架构是：

```
Tauri 桌面壳
├─ Next.js 静态 Web UI
└─ FastAPI sidecar
   └─ SQLite 本地数据
```

主要落地内容：

- 新增 Tauri 2 桌面工程，负责无边框窗口、窗口控制、单实例和 sidecar 生命周期。
- Next.js 改为静态导出，正式版不再携带 Node.js 服务。
- 工作区路由改为 `/workspace/?project=ID`，适配静态桌面资源。
- FastAPI 独立打包为 sidecar，仅监听 `127.0.0.1:17831`。
- SQLite、备份和崩溃日志迁移到系统应用数据目录。
- 新增 sidecar 健康检查和 UI 运行状态指示。
- 首页升级为桌面应用概览：应用侧栏、工作流入口、运行状态、最近作品和快速创建。
- Windows 构建入口已从旧 PyInstaller 浏览器启动器切换到 Tauri。

关键文件：

- [桌面架构说明](C:/Data/agentGroups/novel_hub/TAURI_DESKTOP.md)
- [Tauri 配置](C:/Data/agentGroups/novel_hub/web/src-tauri/tauri.conf.json)
- [Tauri 生命周期管理](C:/Data/agentGroups/novel_hub/web/src-tauri/src/lib.rs)
- [FastAPI sidecar](C:/Data/agentGroups/novel_hub/sidecar.py)
- [桌面首页](C:/Data/agentGroups/novel_hub/web/app/page.tsx)
- [Windows 构建脚本](C:/Data/agentGroups/novel_hub/build_windows.ps1)

验证结果：

- Next.js 静态生产构建通过。
- 后端测试 `18 passed`。
- sidecar EXE 实际启动、SQLite 初始化和 `/health` 探针通过。
- 当前机器缺少 Rust 和 MSVC，因此尚未生成最终 MSI/NSIS；在装好工具链的构建机上运行 `.\build_windows.ps1` 即可继续。
- npm 当前报告 7 个依赖安全问题，其中包含 1 个 critical，正式发布前需要单独做依赖审计。

UI 产品方向上，我建议下一阶段优先做：

1. 全局命令面板：类似 Codex 的 `Ctrl+K`，统一打开作品、章节、AI 操作和设置。
2. 任务/运行中心：AI 续写、分析、一致性检查都变成可查看、取消、重试的任务。
3. 统一产物流：所有 AI 修改遵循“建议 → Diff → 接受/拒绝 → 版本记录”。
4. 项目级导航：写作、故事线、角色、世界观、灵感、素材和版本历史成为同级工作空间。
5. 桌面能力：拖拽导入、导出文件夹、最近文件、托盘、后台任务、自动更新。
6. 本地安全：API Key 从 SQLite 明文迁移到 Windows Credential Manager。
7. 恢复能力：SQLite 自动快照、章节版本历史和崩溃恢复。

现在它已经从“打开浏览器的 AI 编辑网页”迈到了真正桌面应用的架构基础；下一阶段重点应该是任务、产物、上下文和系统能力，而不是继续增加零散 AI 按钮。