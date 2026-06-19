### 小说编辑与润色 AI 工具（设定一致性优先）产品计划

### Summary
- 目标：在 `Web` 端打造一款面向网文日更作者的 AI 写作助手，核心能力是“续写+润色+一致性守护”，优先避免崩设定与 OOC。
- 成功标准（MVP）：作者在单章编辑流程中可完成“输入文本→AI建议→差异采纳→一致性通过”，并显著降低设定冲突率。
- 产品原则：`设定规则优先`，在不破设定前提下尽量保持作者文风；默认 `差异对比+逐条采纳` 交付。

### Key Changes / Implementation
- 核心能力拆分为 4 个服务：
  1. `Lore Service`：管理人物、世界观、时间线、术语表、禁忌规则，输出统一“设定上下文包”。
  2. `Style Service`：从作者历史文本抽取风格指纹（句长分布、词频偏好、叙事视角、节奏标签），生成“文风约束卡”。
  3. `Generation Service`：多模型路由执行续写/润色/改写任务，先生成候选，再做一致性校验与二次修正。
  4. `Consistency Guard`：检测设定冲突、人物行为偏移、时间线错误、术语漂移，并给出可执行修复建议。
- 关键流程（单章）：
  1. 载入设定与文风卡。
  2. 用户选择任务（续写/润色）。
  3. 路由最优模型生成候选。
  4. 守护器打分并标注冲突。
  5. 输出“差异补丁”供逐条采纳。
  6. 通过后落库并更新时间线与风格样本。
- 多模型路由策略（第一版即实现）：
  - `Planner模型`：解析任务与上下文、拆分子目标。
  - `Writer模型`：产出主要文本。
  - `Judge模型`：一致性审校与打分。
  - 路由维度：任务类型、章节长度、成本预算、目标延迟。
- 对外接口（产品级）：
  - `POST /projects`：创建作品。
  - `POST /lore/import`：导入角色/世界观/术语。
  - `POST /style/profile`：生成或刷新文风指纹。
  - `POST /draft/continue`：续写。
  - `POST /draft/polish`：润色。
  - `POST /consistency/check`：一致性检测。
  - `POST /patch/apply`：应用用户选中的差异补丁。
  - `GET /timeline`：查看事件时间线与冲突记录。
- 数据模型（最小集）：
  - `Project`、`Chapter`、`LoreItem`、`CharacterCard`、`StyleProfile`、`ConsistencyIssue`、`PatchSet`、`ModelRunLog`。
- 在你现有原型上的演进：
  - 前端迁移为 React/Next.js，后端保留 FastAPI 服务分层，将“Prompt直连”升级为“服务分层 + 路由 + 守护器”。

### Test Plan
- 功能测试：
  - 续写不引入设定冲突（人物关系、能力边界、世界规则）。
  - 润色不改变剧情事实（事件、因果、结局保持）。
  - 差异补丁可逐条采纳且可回滚。
- 一致性测试：
  - 构造 20+ 组冲突样本（OOC、时间线反转、术语混用）并验证命中率。
  - 同章多轮编辑后，设定冲突率持续下降。
- 文风测试：
  - 对比作者原文与输出文本的风格相似度指标（句长、词汇、叙事视角）达到阈值。
- 性能与成本：
  - 单次润色/续写端到端延迟、模型调用成本、失败重试率达标。
- 验收标准（MVP）：
  - 一致性问题召回率高于基线；
  - 作者可在一个界面内完成“生成-审校-采纳-落库”闭环；
  - 日更场景下可稳定连续使用。

### Assumptions & Defaults
- 默认中文网文场景，章节级工作流优先，不先做多语言。
- 默认 Web 单体应用 + API 服务，后续再拆分微服务。
- 默认多模型路由启用，先接商用 API；私有化部署不纳入 MVP。
- 默认一致性优先级高于文采提升，冲突时先修设定再微调文风。
- 默认仅支持“建议式编辑”（差异补丁），不做自动覆盖原文。




主要落地内容：

数据库层改为 MySQL + 自动建库建表（novel_hub）。
完成分层服务：Lore Service、Style Service、Generation Service（含 Planner/Writer/Judge 路由）、Consistency Guard、Patch Service。
提供完整 API：
POST /projects
POST /lore/import
POST /style/profile
POST /draft/continue
POST /draft/polish
POST /consistency/check
POST /patch/apply
GET /timeline
前端迁移为 Next.js，支持“项目管理→设定导入→文风画像→续写/润色→差异采纳→入库→时间线”闭环。
增加基础测试（核心逻辑层）。
关键文件：

requirements.txt
app/config.py
app/database.py
app/api.py
app/services/generation_service.py
app/services/lore_service.py
app/services/style_service.py
app/services/consistency_guard.py
app/services/patch_service.py
web/app/page.tsx
web/app/projects/[id]/page.tsx
web/components/workspace/workspace-shell.tsx
tests/test_core.py
验证结果：

python -m unittest discover -s tests -v：3 passed
python -c "import app.api; print('api_import_ok')"：成功（说明 API 可导入并已完成初始化）
可直接运行：

后端依赖安装：python -m pip install -r requirements.txt
启动 API：python -m uvicorn app.api:app --reload --port 8000
前端依赖安装：cd web; npm install
启动 Web 前端：npm run dev
访问地址：前端 http://localhost:3000；API 文档 http://localhost:8000/docs
补充说明：

我已将 MySQL 连接参数做成默认值（与你给定一致），也支持通过环境变量覆盖。