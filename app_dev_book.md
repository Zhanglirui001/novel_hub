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

### 当前距离桌面应用产品还差什么？

当前已经是“可运行的桌面 Alpha”，但还不是适合公开交付的桌面产品。核心写作功能基本成型，主要差距集中在发布可靠性、数据安全和运维闭环。

优先级最高的缺口：

1. 发布链路尚未闭环
   当前 `release` 中是旧版 0.1.0 启动器，仍携带 Node；Tauri 配置已到 0.2.0，但没有发现对应 MSI/NSIS 成品。本机又缺少 Rust/Cargo，因此尚未验证最新版能从干净环境完整构建、安装和启动。版本号也不统一：前端/API 为 0.1.0，Tauri 为 0.2.0，旧安装器为 0.1.0。参见 [tauri.conf.json (line 4)](/C:/Data/agentGroups/novel_hub/web/src-tauri/tauri.conf.json:4)、[package.json (line 3)](/C:/Data/agentGroups/novel_hub/web/package.json:3)。

2. 数据恢复能力不足
   已有 SQLite、自动保存和“单章导出 TXT”，但没有：

   - 整个项目导入/导出
   - 数据库自动快照与一键恢复
   - 可浏览、可回滚的章节历史版本
   - 正式、带版本号且可回退的数据库迁移机制

   对小说创作产品来说，这是公开发布前最大的信任门槛。

3. API Key 仍是明文存储
   Key 不会回传到前端，但目前保存在 SQLite 的 `model_settings.api_key` 字段中。应迁移到 Windows Credential Manager、Tauri Stronghold 或系统密钥环。[database.py (line 514)](/C:/Data/agentGroups/novel_hub/app/database.py:514)

4. 桌面异常处理还偏开发态
   sidecar 可以启动和随应用退出，但尚缺少启动超时页、崩溃后的自动重启、端口占用处理、可读错误说明和“导出诊断信息”。固定本地端口加 CORS 也不能阻止其他本机程序调用接口，最好增加随机会话令牌或改为 IPC。

5. 缺少正式更新与签名
   尚未看到自动更新、安装包/可执行文件代码签名、发布通道、升级回滚和变更日志。未签名安装包在 Windows 上会明显影响用户信任和安装转化。

6. 产品生命周期功能不完整
   项目目前只有创建、列表、查看接口，没有完整的项目重命名、删除、归档、复制和导入流程。首次启动引导、示例项目、API 配置向导、关闭窗口时未保存确认也需要补齐。

7. 测试覆盖离“可发布”仍有距离
   本次验证结果：

   - 后端 18 个单测全部通过
   - 前端生产构建与 TypeScript 检查通过
   - `npm run lint` 已失效，因为 Next.js 16 不再支持当前的 `next lint` 调用
   - 缺少 API/SQLite 集成测试、数据库升级测试、前端 E2E、sidecar 崩溃测试以及安装/升级/卸载冒烟测试
   - Tauri Rust 部分因当前环境没有 Cargo，尚未复验

我的判断是：

- 内部自用/小范围试用：已经接近，可在修复打包链和数据恢复后进入。
- 面向普通用户公开发布：至少还需要一个“可靠性与发布工程”里程碑。
- 托盘、全局命令面板、后台任务中心等属于增强项，不应挡住首个稳定版。

建议发布顺序是：统一版本并产出 Tauri 安装包 → 全项目备份/恢复和版本历史 → Key 安全存储 → 异常恢复与诊断 → 签名和自动更新 → E2E/干净机验收。完成前四项后，可以定义为 `0.5 Beta`；签名、更新和发布验收完成后，再进入 `1.0`。







两个最高优先级缺口已经补上，可以按 0.3.0 内部试用包 使用。还不是面向普通用户的 1.0：安装包未签名，也没有自动更新。

**1. 版本统一，并打出 Tauri 安装包**

所有发布元数据现为 0.3.0：`app/version.py`、前端 `package.json`、Tauri、`Cargo.toml`、旧 Inno 安装脚本。`python scripts/check_release_version.py` 已通过。

本机已有 Rust 1.98 和便携 MSVC，完整构建成功。安装包在：

| 文件                                          | 大小    | SHA-256                                                      |
| :-------------------------------------------- | :------ | :----------------------------------------------------------- |
| `release/0.3.0/Novel Hub_0.3.0_x64-setup.exe` | 41.5 MB | `BE7ED31F2456FD7EC5B03167A8C938FB9B38CCAC63E1853D683D62F70EBFDA79` |
| `release/0.3.0/Novel Hub_0.3.0_x64_en-US.msi` | 42.0 MB | `4457E633267F505D27696D56BC44D466AC0F890CEC90DFDD03292396B404BC05` |

旧的 `release/NovelHub-Setup-0.1.0.exe` 不再代表当前源码。当前包未签名，Windows 仍可能弹出 SmartScreen。

**2. 全项目备份 / 恢复和版本历史**

已落地并可在打包服务里跑通：

- 全书架 `.novelhub`：校验预览、事务恢复、恢复前安全副本、启动时每日快照；不包含 API Key。
- 单部作品 `.novelhub-project`：作品卡片「导出」；「备份与恢复」可导入。导入只新增作品并重映射 ID，不覆盖现有书架。
- 章节历史：保存/自动保存/AI 补丁会留快照；可预览并恢复为新版本；冲突则拒绝覆盖。
- 架构迁移：`schema_migrations` 当前为版本 1。失败的迁移随启动事务回滚；更高版本数据库拒绝打开。回退已成功的升级请用升级前的书架备份。

操作说明见 [RECOVERY.md](vscode-file://vscode-app/c:/Users/LiruiZhang/AppData/Local/Programs/cursor/resources/app/out/vs/code/electron-sandbox/workbench/RECOVERY.md)。

**验证**

- 后端 32 个单测通过（含恢复、迁移回滚、作品导入导出、HTTP 流程）
- 前端 TypeScript 检查通过
- 打包 sidecar 冒烟：启动、持久化、历史回滚、整库恢复、作品导入、每日快照
- 桌面壳冒烟：隔离数据目录启动，`/health` 返回 `0.3.0` / `schema_version: 1`

没有在浏览器里点过仪表盘对话框（当前环境没有可用的浏览器自动化）。恢复 UI 的行为由 API 测试和打包冒烟覆盖。

按你之前的发布顺序，接下来应是：Key 安全存储 → 异常恢复与诊断 → 签名和自动更新。前两项加上现在这两项，可以定义为 0.5 Beta；签名、更新和干净机验收后再进 1.0。

### 重新打包

> 请问后续我修改代码后如何重新打包？直接再运行powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1命令吗？

是的。后续修改完成后，直接在项目根目录执行下面的命令即可重新生成完整的 Tauri 安装包：

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1
```

它会依次：

1. 校验各模块版本是否一致。
2. 安装/更新 Python 和前端构建依赖。
3. 用 PyInstaller 重新构建 FastAPI sidecar。
4. 构建 Next.js 静态前端。
5. 构建 Tauri 可执行文件及 NSIS、MSI 安装包。
6. 将安装包复制至 `release\0.3.0\` 并输出 SHA-256。

日常反复打包、且依赖没有变化时，可以节省安装依赖的时间：

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -SkipDependencyInstall
```

仅需验证桌面可执行文件，不生成安装包时：

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -SkipDependencyInstall -SkipInstaller
```

版本升级时，先同步更新 `web/package.json`、`web/src-tauri/tauri.conf.json` 和项目的发布版本配置；脚本会在构建开始时检查它们是否一致。



确认了：项目当前没有 `.venv`，所以激活失败是正常的。打包实际使用的是 Conda 的全局 Python：

```
D:\conda\python.exe
```

该环境混入了许多不属于项目的包和调试器注入，PyInstaller 在分析这些依赖时卡住。先创建一个隔离的构建环境，再从这个环境构建。

在项目根目录依次执行：

```
D:\conda\python.exe -m venv .venv
$env:Path = "$PWD\.venv\Scripts;$env:Path"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1
```

第三条命令首次运行时会在 `.venv` 内安装项目的 Python 依赖和 PyInstaller，然后构建 sidecar 与 Tauri 安装包。以后重新打包时，仍在同一个终端执行：

```
$env:Path = "$PWD\.venv\Scripts;$env:Path"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -SkipDependencyInstall
```

这样 `python` 会解析为 `.venv\Scripts\python.exe`，不再扫描 Conda 全局环境

---

Cargo 无法通过 DNS 解析 `index.crates.io`，导致无法下载 Rust 依赖 `cc`，所以 Tauri 构建终止。构建脚本本身执行到了 `web\src-tauri` 的编译阶段，没有发现项目代码错误。

先解决网络/DNS，再重跑。建议按这个顺序检查：

```
Resolve-DnsName index.crates.io
Test-NetConnection index.crates.io -Port 443
```

当 DNS 查询能返回地址、443 端口可连接后，执行：

```
$env:Path = "$PWD\.venv\Scripts;$env:Path"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build_windows.ps1 -SkipDependencyInstall
```

如果你使用代理，需让 Cargo 走代理。例如本地代理监听 `127.0.0.1:7890` 时，在当前 PowerShell 会话执行：

```
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

然后重新运行打包脚本。不要把上述代理端口照搬，必须替换为你本机代理软件实际开放的 HTTP 代理端口。



### 测试优化







