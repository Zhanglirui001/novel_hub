# Novel Hub · 小说编辑与润色 AI 助手

一款面向中文网文日更作者的 AI 写作工具，核心能力是 **续写 + 润色 + 一致性守护**，以「设定一致性优先」为设计原则，避免崩设定与 OOC，让作者在单章流程中完成「输入 → AI 建议 → 差异采纳 → 入库」闭环。

## 主要功能

- **项目管理**：创建作品，集中管理章节、设定与历史样本。
- **设定导入（Lore）**：维护角色卡、世界规则、术语表、禁忌、时间线，统一输出「设定上下文包」。
- **文风画像（Style）**：从作者历史文本抽取句长分布、词频偏好、叙事视角等指纹，形成「文风约束卡」。
- **续写 / 润色（Generation）**：基于多模型路由（Planner / Writer / Judge）生成候选文本，按预算与延迟自动选路。
- **一致性检测（Consistency Guard）**：识别设定冲突、人物 OOC、时间线错乱、术语漂移，并附带可执行修复建议。
- **差异补丁（Patch）**：以 diff 形式呈现 AI 建议，支持逐条采纳、回滚，避免自动覆盖原文。
- **时间线视图**：查看事件时间线与冲突变更记录。

## 架构概览

分层结构：`Next.js Web` 与 `FastAPI` 后端通过 REST API 协作，FastAPI 复用服务层逻辑，底层落地到 MySQL。

```
┌────────────────────────┐    ┌────────────────────────┐
│  Next.js Web (web/)    │───▶│  FastAPI (app/api.py)  │
└────────────────────────┘    └──────────┬─────────────┘
                                          │
                                          ▼
        ┌──────────────────────────────────┐
        │          app/services            │
        │  ┌────────────┐  ┌────────────┐  │
        │  │ LoreService │  │ StyleService│ │
        │  ├────────────┤  ├────────────┤  │
        │  │ Generation │  │ Consistency│  │
        │  │  Service    │  │   Guard   │  │
        │  ├────────────┤  └────────────┘  │
        │  │ PatchService│                  │
        │  └────────────┘                  │
        └────────────────┬─────────────────┘
                         ▼
            ┌────────────────────────┐
            │  MySQL (novel_hub)     │
            │  app/database.py       │
            └────────────────────────┘
```

### 目录结构

```
novel_hub/
├── requirements.txt              # 后端依赖清单
├── app/
│   ├── api.py                    # FastAPI 路由层
│   ├── config.py                 # 配置（含 .env 加载）
│   ├── database.py               # MySQL 连接 / 建库建表
│   ├── schemas.py                # Pydantic 请求模型
│   └── services/
│       ├── lore_service.py       # 设定上下文管理
│       ├── style_service.py      # 文风指纹生成
│       ├── generation_service.py # 多模型路由 + 续写 / 润色
│       ├── consistency_guard.py  # 一致性检测
│       ├── patch_service.py      # 差异补丁应用
│       └── modeling.py           # 模型路由策略
├── web/                          # Next.js 前端应用
│   ├── app/                      # 路由与页面
│   ├── components/               # 仪表盘、工作台与 UI 组件
│   └── lib/                      # API 客户端 / 类型 / Query hooks
└── tests/
    └── test_core.py              # 核心逻辑层单测
```

### 多模型路由策略

| 角色 | 职责 |
| --- | --- |
| `Planner` | 解析任务与上下文、拆分子目标 |
| `Writer` | 产出主要文本 |
| `Judge` | 一致性审校与打分 |

路由维度：任务类型、章节长度、成本预算、目标延迟。

### API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/projects` | 创建作品 |
| `POST` | `/lore/import` | 导入角色 / 世界观 / 术语 |
| `POST` | `/style/profile` | 生成或刷新文风指纹 |
| `POST` | `/draft/continue` | 续写 |
| `POST` | `/draft/polish` | 润色 |
| `POST` | `/consistency/check` | 一致性检测 |
| `POST` | `/patch/apply` | 应用用户选中的差异补丁 |
| `GET`  | `/timeline` | 查看事件时间线与冲突记录 |

## 环境要求

- Python 3.10+
- Node.js 18+
- MySQL 5.7 / 8.0（启动时会自动建库 `novel_hub` 和相关表）

## 配置

支持在项目根目录的 `.env` 中覆盖默认 MySQL 配置（不存在时使用代码中的默认值）：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=novel_hub
MYSQL_CHARSET=utf8mb4
```

> `.env` 已加入 `.gitignore`，请勿提交真实密钥。可建立 `.env.example` 作为模板。

## 启动方式

### 1. 安装后端依赖

```powershell
python -m pip install -r requirements.txt
```

### 2. 启动 API 服务（FastAPI）

```powershell
python -m uvicorn app.api:app --reload --port 8000
```

默认监听 `http://127.0.0.1:8000`，交互文档：`http://127.0.0.1:8000/docs`。

### 3. 安装并启动前端（Next.js）

```powershell
cd web
npm install
npm run dev
```

默认访问 `http://localhost:3000`。前端默认请求 `http://localhost:8000`，可在 `web/.env.local` 中通过 `NEXT_PUBLIC_API_BASE` 覆盖。

### 4. 运行测试

```powershell
python -m unittest discover -s tests -v
```

## 典型工作流

1. 在 **项目管理** 创建作品。
2. 进入 **设定导入**，按 JSON 数组录入角色卡、世界规则、术语、禁忌、时间线事件。
3. 进入 **文风画像**，粘贴作者历史文本（用 `\n---\n` 分隔多段），生成文风指纹。
4. 进入 **正文续写** 或 **文本润色**，输入正文 → 选择预算 / 延迟 → 生成建议。
5. 查看一致性评分与冲突报告，勾选要采纳的差异补丁，**应用补丁并保存章节**。
6. 在 **时间线** 中复盘事件与冲突变更记录。

## 设计原则

- **设定优先**：冲突时先修设定再微调文风。
- **建议式编辑**：仅以差异补丁形式输出，不自动覆盖原文。
- **服务分层**：UI 与 API 共用服务层，避免逻辑分裂。
- **可扩展路由**：模型路由策略集中在 `services/modeling.py`，便于接入更多商用 / 私有模型。
