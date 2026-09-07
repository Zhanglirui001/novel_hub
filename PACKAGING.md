# Novel Hub Windows 打包与发布

当前 Windows 发布结构：

- Next.js 使用 `output: "standalone"` 生成生产服务器，不运行开发服务器。
- FastAPI 与统一启动器使用 PyInstaller 打包为 `NovelHub.exe`。
- 数据库使用 Python 内置 SQLite，无需安装 MySQL。
- Node.js 运行时随应用一起安装，最终用户无需安装 Node.js。
- Inno Setup 生成按当前用户安装的 Windows 安装程序，无需管理员权限。

## 最终用户

运行 `NovelHub-Setup-0.1.0.exe` 完成安装，然后双击桌面的 `Novel Hub` 图标。
启动器会同时启动 API 和 Web 服务，等待就绪后在默认浏览器打开应用。

重复双击图标不会启动第二套服务，只会再次打开页面。

停止应用可从开始菜单运行 `Stop Novel Hub`。卸载程序不会删除用户的作品数据。

用户数据位置：

```text
%LOCALAPPDATA%\NovelHub\novel_hub.db
%LOCALAPPDATA%\NovelHub\backups\
%LOCALAPPDATA%\NovelHub\logs\
```

## 开发机完整构建

要求开发机安装 Python、Node.js 和 Inno Setup 6。执行：

```powershell
.\build_windows.ps1
```

脚本会依次安装构建依赖、构建 Next.js standalone、构建 PyInstaller
启动器、复制内置 Node 运行时并编译安装程序。

常用选项：

```powershell
# 已安装全部依赖时跳过安装步骤
.\build_windows.ps1 -SkipDependencyInstall

# 只生成 release/NovelHub 便携目录，不生成安装程序
.\build_windows.ps1 -SkipDependencyInstall -SkipInstaller
```

输出：

```text
release\NovelHub\
release\NovelHub-Setup-0.1.0.exe
```

## 从旧 MySQL 迁移

在仍能连接原 MySQL 的开发环境执行一次：

```powershell
python scripts\migrate_mysql_to_sqlite.py `
  --target "$env:LOCALAPPDATA\NovelHub\novel_hub.db"
```

迁移工具会先初始化完整 SQLite 表结构，再复制原库中同名表和字段。
