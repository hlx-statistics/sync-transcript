# sync-transcript

将会话内容同步到项目内 `chat/` 目录，便于版本管理与检索。

| 工具 | Hook 时机 | 配置文件 | 输出 |
|------|-----------|----------|------|
| [Cursor](https://cursor.com/docs/hooks) | 每轮助手回复后（`afterAgentResponse`） | `.cursor/hooks.json` | `chat/YYYYMMDD--<conversation_id>.md` |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) | 会话停止时（`Stop`） | `.claude/settings.json` | `chat/YYYYMMDD--<session_id>.txt` |

---

## Cursor

### 🤖 自动安装

复制给 Cursor Agent 的内容：

```text
请在本项目（当前工作区根目录）安装 Cursor 会话同步 Hook：打开 GitHub 仓库 https://github.com/hlx-statistics/sync-transcript.git ，严格按该仓库 README 里「Cursor › 📋 给 Cursor Agent 的安装任务说明」执行；从当前分支拉取 `.cursor/hooks/sync-transcript.mjs` 并合并 `.cursor/hooks.json`，不要覆盖我已有的其它 Hook。
```

#### 📋 给 Cursor Agent 的安装任务说明

**目标**：在用户当前打开的**工作区根目录**部署 Hook，使助手每轮回复结束后自动生成 `chat/YYYYMMDD--<conversation_id>.md`。

**约束**：

- 所有路径相对于工作区根；`hooks.json` 中的 `command` 必须为：`node .cursor/hooks/sync-transcript.mjs`（与本文档一致）。
- `node` 须在用户环境中可用（`node -v`）。
- 若已存在 `.cursor/hooks.json`，**禁止整文件覆盖**：只合并 `hooks.afterAgentResponse`，保留其余键与其它 Hook。
- **幂等**：若 `afterAgentResponse` 数组里已有任一元素的 `command` 等于 `node .cursor/hooks/sync-transcript.mjs`，则不再追加该项。
- 创建目录：`mkdir -p`（POSIX）或 `New-Item -ItemType Directory -Force`（PowerShell）。

**安装清单**：

1. 令 `ROOT` = 工作区根目录（Cursor 打开的文件夹）。
2. 确保目录存在：`ROOT/.cursor/hooks/`。
3. 将本仓库中的 `.cursor/hooks/sync-transcript.mjs` 写入 `ROOT/.cursor/hooks/sync-transcript.mjs`（内容与 upstream 一致）。
4. 处理 `ROOT/.cursor/hooks.json`：
   - **不存在**：写入下文「手动安装」中的 `hooks.json` 示例全文。
   - **已存在**：解析 JSON；若无顶层 `"version"`，设为 `1`；若无 `hooks`，设为 `{}`。将 `hooks.afterAgentResponse` 视为数组（缺失则 `[]`）；按上文幂等规则追加本条 command；写回文件且保持合法 JSON 格式。
5. 告知用户：若 Hook 未触发，可重启 Cursor；可按「安装后自检」检查 `ROOT/chat/*.md`。

### 🛠️ 手动安装

在工作区根目录：

1. 将 `sync-transcript.mjs` 保存为 `.cursor/hooks/sync-transcript.mjs`（无目录则先建 `.cursor/hooks/`）。
2. 编辑 `.cursor/hooks.json`。若没有该文件，使用下列全文；若已有其它 Hook，只在 `hooks.afterAgentResponse` 里**追加**一条（勿重复相同 `command`），勿删掉原有条目。

```json
{
  "version": 1,
  "hooks": {
    "afterAgentResponse": [
      {
        "command": "node .cursor/hooks/sync-transcript.mjs"
      }
    ]
  }
}
```

### ⚙️ 运行环境

- Cursor 支持 Hooks；建议在 Composer / Agent 会话中验证。
- `node` 在 `PATH` 中。
- 用 Cursor **打开文件夹**作为工作区；多根工作区以 stdin `workspace_roots[0]` 为准。

### ✅ 安装后自检

助手回复结束后，工作区根下应出现 `chat/YYYYMMDD--<conversation_id>.md`。未生效时可重启 Cursor。

### 📝 导出格式（Markdown）

导出为近似 Cursor「Export Transcript」的 Markdown。

**示例**：[`chat/20260515--f0f4a38e-0c2f-4ef4-8780-ccc333db55d5.md`](chat/20260515--f0f4a38e-0c2f-4ef4-8780-ccc333db55d5.md)

### 🗑️ 卸载

从 `.cursor/hooks.json` 移除对应 `afterAgentResponse` 项；按需删除 `.cursor/hooks/sync-transcript.mjs` 及 `chat/*.md`。

---

## Claude Code

### 🤖 自动安装

复制给 Claude Code Agent 的内容：

```text
请在本项目（当前工作区根目录）安装 Claude Code 会话同步 Hook：打开 GitHub 仓库 https://github.com/hlx-statistics/sync-transcript.git ，严格按该仓库 README 里「Claude Code › 📋 给 Claude Code Agent 的安装任务说明」执行；从当前分支拉取 `.claude/hooks/sync-export.mjs` 并合并 `.claude/settings.json` 的 `hooks.Stop`，不要覆盖我已有的其它 Hook。
```

#### 📋 给 Claude Code Agent 的安装任务说明

**目标**：在用户当前打开的**工作区根目录**部署 `Stop` Hook，使 Claude Code 会话停止时自动生成 `chat/YYYYMMDD--<session_id>.txt`（终端 `/export` 风格，每会话一份、每轮覆盖）。

**约束**：

- 所有路径相对于工作区根；`settings.json` 内 `command` 必须为：`node .claude/hooks/sync-export.mjs`（与本文档一致）。
- `node` 须在用户环境中可用（`node -v`）。
- 若已存在 `.claude/settings.json`，**禁止整文件覆盖**：只合并 `hooks.Stop`，保留其余键与其它 Hook。
- **幂等**：若 `Stop` 数组内任一 `hooks[].command` 已等于 `node .claude/hooks/sync-export.mjs`，则不再追加。
- 创建目录：`mkdir -p`（POSIX）或 `New-Item -ItemType Directory -Force`（PowerShell）。

**安装清单**：

1. 令 `ROOT` = 工作区根目录（Claude Code 当前项目目录）。
2. 确保目录存在：`ROOT/.claude/hooks/`。
3. 将本仓库中的 `.claude/hooks/sync-export.mjs` 写入 `ROOT/.claude/hooks/sync-export.mjs`（内容与 upstream 一致）。
4. 处理 `ROOT/.claude/settings.json`：
   - **不存在**：写入下文「手动安装」中的 `settings.json` 示例全文。
   - **已存在**：解析 JSON；若无 `hooks`，设为 `{}`。将 `hooks.Stop` 视为数组（缺失则 `[]`）；在 `Stop` 中按幂等规则追加或合并含上述 `command` 的条目（结构见示例）；写回文件且保持合法 JSON 格式。
5. 告知用户：结束一次 Claude Code 会话后，按「安装后自检」检查 `ROOT/chat/*.txt`；可选环境变量见「运行环境」。

### 🛠️ 手动安装

在工作区根目录：

1. 将 `sync-export.mjs` 保存为 `.claude/hooks/sync-export.mjs`（无目录则先建 `.claude/hooks/`）。
2. 编辑 `.claude/settings.json`。若没有该文件，使用下列全文；若已有其它 Hook，只在 `hooks.Stop` 里**合并**下列结构（勿重复相同 `command`），勿删掉原有条目。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/sync-export.mjs"
          }
        ]
      }
    ]
  }
}
```

### ⚙️ 运行环境

- Claude Code 支持 Hooks（`Stop`）。
- `node` 在 `PATH` 中；工作目录为项目根（脚本使用 stdin 中的 `cwd`）。

**可选环境变量**：

| 变量 | 说明 |
|------|------|
| `CLAUDE_EXPORT_DIR` | 导出目录，默认 `<cwd>/chat` |
| `CLAUDE_EXPORT_FILE` | 固定输出文件路径（设置后忽略日期/会话命名规则） |
| `CLAUDE_EXPORT_INCLUDE_EXPORT` | 设为 `1` 时在导出中保留 `/export` 类 slash 命令行（默认跳过） |

### ✅ 安装后自检

结束一次 Claude Code 会话后，工作区根下应出现 `chat/YYYYMMDD--<session_id>.txt`。

### 📝 导出格式（终端文本）

导出为与 Claude Code `/export` 一致的终端风格纯文本（`.txt`），非 Markdown。

**示例**（待测试后替换为真实文件）：`chat/TBD--<session_id>.txt` — 占位路径，维护者验证通过后会提交样例并更新本链接。

### 🗑️ 卸载

从 `.claude/settings.json` 移除对应 `Stop` → `command` 项；按需删除 `.claude/hooks/sync-export.mjs` 及 `chat/*.txt`。

---

## 📁 项目结构

| 路径 | 说明 |
|------|------|
| `.cursor/hooks.json` | Cursor：注册 `afterAgentResponse` |
| `.cursor/hooks/sync-transcript.mjs` | Cursor：导出脚本 → `.md` |
| `.claude/settings.json` | Claude Code：注册 `Stop` |
| `.claude/hooks/sync-export.mjs` | Claude Code：导出脚本 → `.txt` |
| `chat/` | 导出目录（`.md` 与 `.txt` 可并存） |
| `LICENSE` | MIT 许可全文 |

---

## 📤 Git 提交建议

| 路径 | 说明 |
|------|------|
| `chat/YYYYMMDD--<conversation_id>.md` | Cursor 会话 |
| `chat/YYYYMMDD--<session_id>.txt` | Claude Code 会话 |

若不希望把聊天记录提交到远端，可将 `chat/` 加入 `.gitignore`。

---

## 📄 许可证

本仓库采用 **MIT License**，Copyright (c) 2026 HLX；条款全文见根目录 [`LICENSE`](LICENSE)。
