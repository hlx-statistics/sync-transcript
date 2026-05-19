# sync-transcript

将会话内容同步到项目内 `chat/` 目录，便于版本管理与检索。支持 **Cursor**、**Claude Code**、**VS Code（GitHub Copilot Agent）**。

| 工具 | Hook 时机 | 配置文件 | 输出 |
|------|-----------|----------|------|
| [Cursor](#cursor) | 每轮助手回复后（`afterAgentResponse`） | `.cursor/hooks.json` | `chat/YYYYMMDD--<conversation_id>.md` |
| [Claude Code](#claude-code) | 会话停止时（`Stop`） | `.claude/settings.json` | `chat/YYYYMMDD--<session_id>.txt` |
| [VS Code（GitHub Copilot）](#vs-code-github-copilot) | Agent 会话停止时（`Stop`） | `.github/hooks/*.json` | `chat/YYYYMMDD--<session_id>.md` |

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

**示例**：[`chat/20260518--7f7b6371-83c4-487e-bee5-595b6497ec89.txt`](chat/20260518--7f7b6371-83c4-487e-bee5-595b6497ec89.txt)

### 🗑️ 卸载

从 `.claude/settings.json` 移除对应 `Stop` → `command` 项；按需删除 `.claude/hooks/sync-export.mjs` 及 `chat/*.txt`。

---

## VS Code（GitHub Copilot）

在 **VS Code** 中通过 **GitHub Copilot** 扩展使用 Agent 聊天；Hook 由 VS Code 平台在会话生命周期节点调用（与 [Agent hooks（Preview）](https://code.visualstudio.com/docs/copilot/customization/hooks) 一致）。配置默认放在 `.github/hooks/` 目录下的 `*.json` 文件中（非 GitHub 网站 Webhooks）。

> **说明**：与 Cursor 的「每轮导出」不同，Copilot 版在 **Agent 会话结束**（`Stop`）时写入 `chat/`；同一 `sessionId` 的文件会被覆盖更新。

### 🤖 自动安装

复制给 VS Code / Copilot Agent 的内容：

```text
请在本项目（当前工作区根目录）安装 VS Code GitHub Copilot 会话同步 Hook：打开 GitHub 仓库 https://github.com/hlx-statistics/sync-transcript.git ，严格按该仓库 README 里「VS Code（GitHub Copilot）› 📋 给 Agent 的安装任务说明」执行；从当前分支拉取 `.github/hooks/sync-vscode.mjs` 与 `.github/hooks/sync-transcript.json`，不要覆盖我已有的其它 Hook。
```

#### 📋 给 Agent 的安装任务说明

**目标**：在用户当前打开的**工作区根目录**部署 `Stop` Hook，使 Copilot Agent 会话结束时自动生成 `chat/YYYYMMDD--<session_id>.md`。

**约束**：

- 所有路径相对于工作区根；Hook JSON 中 `command` 必须为：`node .github/hooks/sync-vscode.mjs`（与本文档一致）。
- `node` 须在用户环境中可用（`node -v`）。
- VS Code 默认扫描 `ROOT/.github/hooks/*.json`；若已存在其它 Hook 配置文件，**禁止整文件覆盖**：只合并 `hooks.Stop`，保留其余键与其它 Hook。
- **幂等**：若任一 `*.json` 的 `hooks.Stop` 数组中已有 `command` 等于 `node .github/hooks/sync-vscode.mjs`，则不再追加。
- 创建目录：`mkdir -p`（POSIX）或 `New-Item -ItemType Directory -Force`（PowerShell）。

**安装清单**：

1. 令 `ROOT` = 工作区根目录（VS Code 打开的文件夹）。
2. 确保目录存在：`ROOT/.github/hooks/`。
3. 将本仓库中的 `.github/hooks/sync-vscode.mjs` 写入 `ROOT/.github/hooks/sync-vscode.mjs`（内容与 upstream 一致）。
4. 处理 `ROOT/.github/hooks/sync-transcript.json`：
   - **不存在**：写入下文「手动安装」中的 `sync-transcript.json` 示例全文。
   - **已存在**：解析 JSON；若无 `hooks`，设为 `{}`。将 `hooks.Stop` 视为数组（缺失则 `[]`）；按上文幂等规则追加本条 `command`；写回文件且保持合法 JSON 格式。也可新建 `ROOT/.github/hooks/sync-transcript.json`，勿与现有 Hook 冲突。
5. 告知用户：结束一次 Copilot Agent 会话后，按「安装后自检」检查 `ROOT/chat/*.md`；若 Hook 未触发可重启 VS Code，或在命令面板运行 **Chat: Configure Hooks**。

### 🛠️ 手动安装

在工作区根目录：

1. 将 `sync-vscode.mjs` 保存为 `.github/hooks/sync-vscode.mjs`（无目录则先建 `.github/hooks/`）。
2. 在 `.github/hooks/` 下新建或编辑 Hook 配置（文件名任意，须为 `.json`）。若没有，使用下列全文；若已有其它 Hook，只在 `hooks.Stop` 里**追加**一条（勿重复相同 `command`）：

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "node .github/hooks/sync-vscode.mjs"
      }
    ]
  }
}
```

### ⚙️ 运行环境

- VS Code（或 Insiders）+ **GitHub Copilot** 扩展；需支持 Agent Hooks（Preview）。部分组织可能通过策略禁用 Hooks。
- 在 **Agent 会话**中验证（普通 Inline Chat 不一定写入同一套转写）。
- `node` 在 `PATH` 中；Hook stdin 提供 `cwd`、`sessionId`（或 `session_id`）、`transcript_path`。

**可选环境变量**：

| 变量 | 说明 |
|------|------|
| `VSCODE_EXPORT_DIR` | 导出目录，默认 `<cwd>/chat` |
| `VSCODE_EXPORT_FILE` | 固定输出文件路径（设置后忽略日期/会话命名规则） |
| `CLAUDE_EXPORT_DIR` | 未设置 `VSCODE_EXPORT_DIR` 时的回退目录（与 Claude Code 脚本共用逻辑时） |
| `CLAUDE_EXPORT_FILE` | 固定输出路径（Claude 格式回退为 `.txt` 时使用） |

**格式回退**：脚本根据转写 JSONL 自动识别——Copilot 转写（`session.start` / `user.message` 等）→ **Markdown（`.md`）**；若为 Claude Code 旧格式 → **终端风格 `.txt`**（与 `.claude/hooks/sync-export.mjs` 一致）。

**兼容配置**：VS Code 也会加载 `.claude/settings.json` 中的 `Stop` Hook；若你已用 Claude Code 配置，可让 `command` 指向同一 `sync-vscode.mjs`，无需重复维护两份逻辑（注意避免同一事件注册两次相同命令）。

### ✅ 安装后自检

结束一次 Copilot Agent 会话后，工作区根下应出现 `chat/YYYYMMDD--<session_id>.md`。可在输出面板查看 **GitHub Copilot Chat Hooks** 是否执行成功。

### 📝 导出格式（Markdown）

导出为 Markdown：标题、导出时间、**User** / **GitHub Copilot** 分块（含工具调用摘要）。

**示例**：[`chat/20260519--911fb7fc-a85e-4b56-958f-bb1fa12910f0.md`](chat/20260519--911fb7fc-a85e-4b56-958f-bb1fa12910f0.md)（VS Code GitHub Copilot Agent 导出，含工具调用摘要）

### 🗑️ 卸载

从 `.github/hooks/*.json` 中移除对应 `Stop` → `command` 项；按需删除 `.github/hooks/sync-vscode.mjs` 及 `chat/*.md`（若与 Cursor 共用 `chat/`，勿误删其它工具的导出文件）。

---

## 📁 项目结构

| 路径 | 说明 |
|------|------|
| `.cursor/hooks.json` | Cursor：注册 `afterAgentResponse` |
| `.cursor/hooks/sync-transcript.mjs` | Cursor：导出脚本 → `.md` |
| `.claude/settings.json` | Claude Code：注册 `Stop`（VS Code 亦可加载） |
| `.claude/hooks/sync-export.mjs` | Claude Code：导出脚本 → `.txt` |
| `.github/hooks/*.json` | VS Code Copilot：注册 `Stop` 等 Hook |
| `.github/hooks/sync-vscode.mjs` | VS Code Copilot：导出脚本 → `.md`（Copilot 转写）或 `.txt`（Claude 转写回退） |
| `chat/` | 导出目录（`.md` 与 `.txt` 可并存） |
| `LICENSE` | MIT 许可全文 |

---

## 📤 Git 提交建议

| 路径 | 说明 |
|------|------|
| `chat/YYYYMMDD--<conversation_id>.md` | Cursor 会话 |
| `chat/YYYYMMDD--<session_id>.md` | VS Code GitHub Copilot Agent 会话 |
| `chat/YYYYMMDD--<session_id>.txt` | Claude Code 会话 |

若不希望把聊天记录提交到远端，可将 `chat/` 加入 `.gitignore`。

---

## 📄 许可证

本仓库采用 **MIT License**，Copyright (c) 2026 HLX；条款全文见根目录 [`LICENSE`](LICENSE)。
