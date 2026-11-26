# novel_hub → SQLite 迁移可行性清单

> ✅ **已于 2026-11-26 完成迁移**：`database.py` 改为 stdlib `sqlite3` + `%s→?` 兼容层（各 service 的 SQL 零改动），数据已从 MySQL 迁入 `novel_hub/novel_hub.db`（46 行），18 个单测全过。以下为迁移过程清单，留作记录。

> 结论：**可行，但不是小改**。成本集中在「SQL 方言替换」和「连接层重写」。接口层（REST / bridge / MCP）**完全不受影响**——它们只走 HTTP，只有后端 DB 层要动。

## 0. 现状：SQL 调用点分布（共 ≈209 处 `.execute()`）

| 文件 | 处数 | 说明 |
|---|---:|---|
| `app/database.py` | 52 | 连接层 + 全部建表 DDL（含**一段重复 DDL**，见下） |
| `app/services/inspiration_service.py` | ~50 | 灵感卡片 / 看板 / 提案 |
| `app/services/checkin_service.py` | 28 | 打卡 / 待办 |
| `app/services/storyline_service.py` | 19 | 故事线图 |
| `app/api.py` | 15 | 项目 / 章节内联 SQL |
| `app/services/chat_service.py` | 14 | 聊天 |
| `app/services/lore_service.py` | 12 | 设定 |
| `app/services/generation_service.py` | 11 | 生成 / 补丁 |
| `app/services/mainline_service.py` | 10 | 主线 |
| `app/services/style_service.py` | 7 | 文风 |
| `app/services/settings_service.py` | 3 | LLM 设置 |
| `app/services/backup_service.py` | 1 | 备份 |
| `app/services/writing_agent.py` | 1 | 写手 |

## 1. 需要改的点（按难度）

### A. 连接层（`app/database.py`，约 643 行）— 重写
- [ ] `pymysql` → `sqlite3`（stdlib）；`DictCursor` → `conn.row_factory = sqlite3.Row`
- [ ] `_base_connect()` 改 `sqlite3.connect(path, ...)`，去掉 MySQL host/port/user/password
- [ ] `get_conn()`：去掉连接池；保留「成功 commit / 异常 rollback / 关闭」语义（sqlite3 可用 `autocommit` 或手动事务）
- [ ] 建议 `PRAGMA journal_mode=WAL; foreign_keys=ON; busy_timeout=5000;`
- [ ] `config.py`：MySQL 参数 → `sqlite_path`（如 `novel_hub.db`）
- [ ] `requirements.txt`：删 `PyMySQL`

### B. DDL（`init_db()` 里的 CREATE TABLE）— 全部改
每个建表语句：
- [ ] `INT ... AUTO_INCREMENT PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- [ ] 去掉 `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
- [ ] `DECIMAL(12,6)` → `NUMERIC`（仅 `model_run_logs.cost_estimate`）
- [ ] `DATE` → `TEXT`（`daily_todos.todo_date`、`daily_checkins.checkin_date`，存 `YYYY-MM-DD`）
- [ ] `BOOLEAN` → `INTEGER`（0/1，代码侧已按 bool 用）
- [ ] `MEDIUMTEXT/TEXT/VARCHAR(n)/DOUBLE` → `TEXT/TEXT/TEXT/REAL`（SQLite 忽略长度）
- [ ] 表内联 `INDEX idx_xxx(...)` → SQLite 不支持内联 INDEX，需拆成独立 `CREATE INDEX IF NOT EXISTS`
- [ ] **顺手清理**：`inspiration_cards / inspiration_boards / board_nodes / board_edges / board_chat_sessions / ai_proposals` 这 6 张表的 DDL 在 `init_db` 里**重复定义了两遍**（约 452–547 行与 548–643 行），可删掉一组

### C. 方言替换（散落各 service）— 机械但面广（工作量最大）
- [ ] **`%s` 占位符 → `?`**：约 150+ 条带参 SQL。可用脚本批量替换，但要排除非 SQL 的 `%s`（字符串格式化）
- [ ] `ON DUPLICATE KEY UPDATE` ×2（`checkin_service.py:417`、`inspiration_service.py:415`）→ `ON CONFLICT(...) DO UPDATE SET ...`
- [ ] `_column_exists`（`SHOW COLUMNS`）→ `PRAGMA table_info`
- [ ] `_index_exists`（`SHOW INDEX`）→ `PRAGMA index_list`
- [ ] `ALTER TABLE ... ADD COLUMN ... AFTER xxx`（`database.py:97`）→ SQLite 无 `AFTER`，去掉该子句
- [ ] 反引号标识符 `` `table` `` → 可保留（SQLite 兼容）或统一改双引号
- [ ] `lastrowid` ×16 → **无需改**（sqlite3 同名字段，语义一致）
- [ ] `COALESCE / MAX / ORDER BY / LIKE / COUNT` → 全部兼容，无需改

### D. 测试与回归
- [ ] `tests/test_core.py` 跑通（当前 3 passed）
- [ ] 冒烟全接口：项目 / 章节 / 设定 / 文风 / 续写 / 一致性 / 补丁 / 时间线 / 灵感 / 故事线 / 主线 / 聊天 / 打卡 / 备份 / 设置
- [ ] 前端 + `bridge sync/pull` + MCP 工具各跑一遍

## 2. 工作量估算

| 阶段 | 预估 |
|---|---|
| A 连接层重写 | 1–1.5 天 |
| B DDL 全改 | 0.5–1 天 |
| C 方言替换（含 `%s` 全量） | 1–2 天（脚本 + 逐条 review） |
| D 测试回归 | 1 天 |
| **合计** | **≈3–5 人天**（有脚本辅助可压到 2–3 天） |

## 3. 兼容性好消息（省力的地方）
- `lastrowid` / `COALESCE` / `ORDER BY` / `LIKE` / `COUNT` 全部兼容
- JSON 全在 Python 侧 `json.dumps/loads`（不依赖数据库 JSON 函数）
- 表之间没有真实外键（只有索引）→ 不涉及 FK 迁移
- 数据量小（单本小说）→ 数据迁移可「从工作区 Markdown 重建」或一次性 `mysqldump` 转换，无需分批

## 4. 建议
- **目标只是「另一台电脑免装 MySQL」** → 值得做，按上面 3–5 天。
- **目标只是「内容跨机器同步」** → 别迁，`Markdown + bridge sync` 已经够。
- **折中（推荐先做）** → 不动 DB，先给 `bridge` 加 `export`（脱敏 SQL/JSON 导出）+ `.gitignore`，把"可 diff 的文本备份"纳入 git，零风险。
