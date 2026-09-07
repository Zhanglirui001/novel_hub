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