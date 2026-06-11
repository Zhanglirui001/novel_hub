# Novel Hub Web（前端）

现代杂志风、以编辑器为中心的沉浸式写作工作台。基于 **Next.js（App Router）+ TypeScript + Tailwind + shadcn/ui**，对接 `app/api.py` 的 FastAPI 后端。

## 技术栈

- Next.js 15 / React 18 / TypeScript
- Tailwind CSS + shadcn/ui（new-york 风格）
- TanStack Query（数据请求与缓存）
- next-themes（明/暗主题）+ sonner（通知）
- 字体：Noto Serif SC（标题）/ Noto Sans SC（正文）

## 快速开始

### 1. 启动后端（在仓库根目录）

```bash
# 需要本地 MySQL 运行；无需 LLM API key（默认走离线启发式生成）
uvicorn app.api:app --reload --port 8000
```

访问 http://localhost:8000/docs 确认接口可用。

### 2. 启动前端（在 web/ 目录）

```bash
cd web
cp .env.local.example .env.local   # 如后端不在 8000 端口可在此修改
npm install
npm run dev
```

打开 http://localhost:3000。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | FastAPI 后端地址 |

后端通过 `CORS_ORIGINS` 环境变量控制允许的来源（默认已允许 `http://localhost:3000`）。

## 页面结构

- `/` — 书架仪表盘：项目画廊 + 新建作品
- `/projects/[id]` — 沉浸式工作台（三栏）
  - 左：章节导航（可折叠）
  - 中：标题 + 正文编辑器（限定阅读栏宽）
  - 右：助手面板（创作 / 一致性 / 修改 / 设定 / 文风 / 时间线）

## 典型工作流

1. 新建作品 → 进入工作台
2. 「设定」面板导入角色 / 术语 / 禁忌（含 `required` 标签的术语参与一致性校验）
3. 编辑器输入正文 → 「创作」面板选续写/润色 → 生成
4. 查看一致性评分环与冲突报告
5. 「修改」面板逐条采纳补丁 → 应用并保存章节（版本递增）

## 目录

```
web/
  app/            # 路由与页面
  components/
    ui/           # shadcn 原子组件
    dashboard/    # 仪表盘
    workspace/    # 工作台三栏与助手面板
  lib/            # api 客户端 / 类型 / query hooks
```
