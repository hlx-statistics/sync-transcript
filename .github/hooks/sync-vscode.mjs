/**
 * VS Code / Claude Code Stop hook: 读取 JSONL 转写 → 写入 <cwd>/chat/
 * - VS Code Copilot (session.start / user.message / …) → YYYYMMDD--<sessionId>.md
 * - Claude Code (type: user|assistant|system) → YYYYMMDD--<session_id>.txt（/export 风格）
 * 环境变量: VSCODE_EXPORT_DIR / CLAUDE_EXPORT_DIR（默认均为 <cwd>/chat）
 */
import fs from "fs/promises";
import path from "path";
import os from "os";

const CONTENT_WIDTH = 80;
const DURATION_VERBS = ["Baked", "Cooked", "Sautéed", "Brewed", "Churned"];

async function main() {
  const stdin = await readStdinJson();
  if (!stdin || stdin.stop_hook_active) process.exit(0);

  const cwd = stdin.cwd || process.cwd();
  let transcriptPath = resolveTranscriptPath(stdin);
  if (!transcriptPath) process.exit(0);

  let jsonl;
  try {
    jsonl = await readFileStable(transcriptPath, { retries: 12, delayMs: 80 });
  } catch {
    process.exit(0);
  }

  const rows = parseJsonl(jsonl.toString("utf8"));
  if (rows.length === 0) process.exit(0);

  const vscodeFormat = isVsCodeTranscript(rows);
  const text = vscodeFormat
    ? formatVsCodeTranscript(rows, { cwd })
    : formatExportTranscript(rows);
  if (!text.trim()) process.exit(0);

  const exportDir =
    process.env.VSCODE_EXPORT_DIR ||
    process.env.CLAUDE_EXPORT_DIR ||
    path.join(cwd, "chat");
  const outPath = await resolveExportPath({
    exportDir,
    stdin,
    transcriptPath,
    rows,
    ext: vscodeFormat ? ".md" : ".txt",
  });

  try {
    await fs.mkdir(exportDir, { recursive: true });
    await writeFileStable(outPath, Buffer.from(text, "utf8"), {
      retries: 8,
      delayMs: 60,
    });
  } catch {
    /* ignore */
  }

  process.exit(0);
}

function resolveTranscriptPath(stdin) {
  if (stdin.transcript_path && String(stdin.transcript_path).trim()) {
    let p = String(stdin.transcript_path).trim();
    if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
    return normalizeWindowsPath(p);
  }
  return null;
}

function normalizeWindowsPath(p) {
  const s = String(p).trim();
  if (process.platform !== "win32" || !s) return s;
  const m = s.match(/^\/+([A-Za-z]:\/(?:.*))$/);
  return m ? m[1].replace(/\//g, "\\") : s;
}

function isVsCodeTranscript(rows) {
  return rows.some((r) => {
    const t = r?.type;
    return (
      t === "session.start" ||
      t === "user.message" ||
      t === "assistant.message"
    );
  });
}

function formatVsCodeTranscript(rows, { cwd }) {
  const start = rows.find((r) => r.type === "session.start")?.data ?? {};
  const title = buildDefaultTitle(cwd);
  const blocks = [];

  for (const row of rows) {
    if (row.type === "tool.execution_start") {
      continue;
    }
    if (row.type === "tool.execution_complete") {
      const d = row.data ?? {};
      const ok = d.success !== false ? "ok" : "failed";
      const snippet = `> Tool result (${ok}): \`${d.toolCallId || "?"}\``;
      const prev = blocks[blocks.length - 1];
      if (prev?.role === "assistant") {
        prev.body = `${prev.body}\n\n${snippet}`;
      } else {
        blocks.push({ role: "assistant", body: snippet });
      }
      continue;
    }
    if (row.type === "user.message") {
      const body = String(row.data?.content ?? "").trim();
      if (body) blocks.push({ role: "user", body });
      continue;
    }
    if (row.type === "assistant.message") {
      const parts = [];
      const reasoning = row.data?.reasoningText;
      if (reasoning && String(reasoning).trim()) {
        parts.push(`_Reasoning:_\n\n${String(reasoning).trim()}`);
      }
      const content = String(row.data?.content ?? "").trim();
      if (content) parts.push(content);
      const tr = row.data?.toolRequests;
      if (Array.isArray(tr) && tr.length > 0) {
        for (const t of tr) {
          parts.push(
            `> **Tool** \`${t.name || "tool"}\`: ${summarizeToolArgs(t.arguments)}`,
          );
        }
      }
      if (parts.length) blocks.push({ role: "assistant", body: parts.join("\n\n") });
      continue;
    }
  }

  const merged = [];
  for (const b of blocks) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === b.role) {
      prev.body = `${prev.body}\n\n${b.body}`;
    } else {
      merged.push({ ...b });
    }
  }

  const h1 = `# ${title}`;
  const exported = formatVsCodeExportedLine(start);
  const bodyBlocks = merged.map((m) => {
    const who = m.role === "user" ? "**User**" : "**GitHub Copilot**";
    return `---\n\n${who}\n\n${m.body.trim()}\n\n`;
  });
  return `${h1}\n\n${exported}\n\n${bodyBlocks.join("")}`.trimEnd() + "\n";
}

function summarizeToolArgs(args) {
  if (args == null) return "";
  try {
    const s = typeof args === "string" ? args : JSON.stringify(args);
    return s.length > 240 ? s.slice(0, 240) + "…" : s;
  } catch {
    return "";
  }
}

function buildDefaultTitle(workspaceRoot) {
  try {
    const b = path.basename(path.resolve(workspaceRoot || "."));
    if (b && b !== "." && b !== "..") return `Chat transcript — ${b}`;
  } catch {
    /* ignore */
  }
  return "Chat transcript";
}

function formatVsCodeExportedLine(start) {
  const d = utcPlusOffset(new Date(), 8);
  const pad = (n) => String(n).padStart(2, "0");
  const ver =
    start.copilotVersion || start.vscodeVersion || process.env.VSCODE_VERSION || "?";
  return `_Exported on ${d.year}/${d.month + 1}/${d.day} at GMT+8 ${pad(d.hour)}:${pad(d.minute)}:${pad(d.second)} from VS Code GitHub Copilot (${ver})_`;
}

function utcPlusOffset(date, offsetHours) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  const shifted = new Date(utcMs + offsetHours * 3600_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

async function resolveExportPath({ exportDir, stdin, transcriptPath, rows, ext }) {
  if (process.env.VSCODE_EXPORT_FILE) {
    return process.env.VSCODE_EXPORT_FILE;
  }
  if (process.env.CLAUDE_EXPORT_FILE) {
    return process.env.CLAUDE_EXPORT_FILE;
  }

  const sessionId =
    stdin.session_id ||
    stdin.sessionId ||
    path.basename(transcriptPath, path.extname(transcriptPath));
  const safeId = String(sessionId).replace(/[/\\:?*"<>|]/g, "_");
  const ymd = await getYyyymmddPrefix(transcriptPath, rows);
  const suffix = ext || ".txt";
  return path.join(exportDir, `${ymd}--${safeId}${suffix}`);
}

async function getYyyymmddPrefix(transcriptPath, rows) {
  try {
    const st = await fs.stat(transcriptPath);
    if (isReasonableSessionDate(st.birthtime)) {
      return formatYyyymmddAsiaShanghai(st.birthtime);
    }
    if (isReasonableSessionDate(st.ctime)) {
      return formatYyyymmddAsiaShanghai(st.ctime);
    }
  } catch {
    /* ignore */
  }

  for (const row of rows) {
    if (!row.timestamp) continue;
    const d = new Date(row.timestamp);
    if (isReasonableSessionDate(d)) return formatYyyymmddAsiaShanghai(d);
  }

  return formatYyyymmddAsiaShanghai(new Date());
}

function isReasonableSessionDate(d) {
  if (!d || !(d instanceof Date)) return false;
  const y = d.getFullYear();
  return y >= 2018 && y <= 2040 && Number.isFinite(d.getTime());
}

function formatYyyymmddAsiaShanghai(date) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return s.replace(/-/g, "");
}

function parseJsonl(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function formatExportTranscript(rows) {
  const meta = extractSessionMeta(rows);
  const lines = [];
  lines.push(...renderWelcomeBanner(meta));
  lines.push("");

  let turnIndex = 0;
  const pendingStdout = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (row.type === "system") {
      if (row.subtype === "turn_duration") {
        if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
        lines.push(formatDurationLine(row.durationMs, turnIndex++));
        continue;
      }
      if (row.subtype === "local_command") {
        const stdout = parseLocalCommandStdout(row.content);
        if (stdout != null) {
          const target = pendingStdout[pendingStdout.length - 1];
          if (target) target.lines.push(...formatResultLines(stdout));
          continue;
        }
        const cmd = parseLocalCommandTags(row.content);
        if (cmd && !shouldSkipSlashCommand(cmd.name)) {
          lines.push(...formatUserLines(cmd.display));
          pendingStdout.push({ lines });
        }
        continue;
      }
      const stdout = parseLocalCommandStdout(row.content);
      if (stdout != null) {
        const target = pendingStdout[pendingStdout.length - 1];
        if (target) target.lines.push(...formatResultLines(stdout));
      }
      continue;
    }

    if (row.type === "user") {
      if (isLocalCommandCaveat(row)) continue;

      const content = getMessageContent(row);
      const cmd = parseLocalCommandTags(content);
      if (cmd) {
        if (shouldSkipSlashCommand(cmd.name)) continue;
        lines.push(...formatUserLines(cmd.display));
        pendingStdout.push({ lines });
        continue;
      }

      const stdout = parseLocalCommandStdout(content);
      if (stdout != null) {
        const target = pendingStdout[pendingStdout.length - 1];
        if (target) target.lines.push(...formatResultLines(stdout));
        continue;
      }

      if (row.isMeta) continue;

      const toolResults = extractToolResults(row);
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          const toolUse = findToolUse(rows, i, tr.toolUseId);
          if (!toolUse) continue;
          lines.push(...formatToolUseLine(toolUse));
          lines.push(...formatResultLines(tr.text, toolUse, tr.row));
        }
        continue;
      }

      const userText = extractPlainUserText(row);
      if (userText) {
        lines.push(...formatUserLines(userText));
        lines.push("");
      }
      continue;
    }

    if (row.type === "assistant") {
      const parts = extractAssistantParts(row);
      if (parts.text) {
        lines.push(...formatAssistantLines(parts.text));
        lines.push("");
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function extractSessionMeta(rows) {
  let version = "2.1.143";
  let cwd = "";
  let model = "Claude";
  for (const row of rows) {
    if (row.version) version = row.version;
    if (row.cwd) cwd = row.cwd;
    const m = row.message?.model;
    if (m && m !== "<synthetic>") model = m;
  }
  return { version, cwd, model };
}

function renderWelcomeBanner({ version, cwd, model }) {
  const leftW = 41;
  const rightW = 36;
  const title = ` Claude Code v${version} `;
  const titlePad = Math.max(0, leftW + rightW - title.length - 2);
  const modelLine = centerPad(`   ${model} · API Usage Billing   `, leftW);
  const cwdLine = centerPad(`         ${cwd}          `, leftW);

  const rows = [
    ["                                         ", "Tips for getting started           "],
    ["              Welcome back!              ", "Run /init to create a CLAUDE.md f… "],
    ["                                         ", "────────────────────────────────── "],
    ["                 ▐▛███▜▌                 ", "What's new                         "],
    ["                ▝▜█████▛▘                ", "Added plugin dependency enforceme… "],
    ["                  ▘▘ ▝▝                  ", "Added projected context cost (per… "],
    ["                                         ", "Added `worktree.bgIsolation: \"non… "],
    [modelLine, "/release-notes for more            "],
    [cwdLine, "                                   "],
  ];

  const out = [`╭───${title}${"─".repeat(titlePad)}╮`];
  for (const [left, right] of rows) {
    out.push(`│${left.slice(0, leftW).padEnd(leftW)}│ ${right.padEnd(rightW - 1)}│`);
  }
  out.push(`╰${"─".repeat(leftW + rightW + 1)}╯`);
  return out;
}

function centerPad(text, width) {
  const t = String(text);
  if (t.length >= width) return t.slice(0, width);
  const pad = width - t.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + t + " ".repeat(pad - left);
}

function formatUserLines(text) {
  return wrapPlainText(text, "> ", "  ", CONTENT_WIDTH);
}

function formatAssistantLines(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const out = [];
  const paras = trimmed.split(/\n{2,}/);
  for (let p = 0; p < paras.length; p++) {
    const lines = wrapPlainText(paras[p], "● ", "  ", CONTENT_WIDTH - 2);
    out.push(...lines);
    if (p < paras.length - 1) out.push("");
  }
  return out;
}

function formatToolUseLine(tool) {
  const head = `● ${tool.label}`;
  return wrapPlainText(head, "", "  ", CONTENT_WIDTH);
}

function formatResultLines(text, tool, resultRow) {
  const formatted = formatToolResultText(text, tool, resultRow);
  if (!formatted) return ["  ⎿  (No output)"];
  return wrapPlainText(formatted, "  ⎿  ", "     ", CONTENT_WIDTH);
}

function formatToolResultText(text, tool, resultRow) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const tur = resultRow?.toolUseResult;
  if (tool?.name === "Write" && tur && typeof tur === "object") {
    const fp = tur.file?.filePath || tool.input?.file_path;
    const n = tur.file?.numLines;
    if (fp && n != null) {
      return `Wrote ${n} lines to ${displayPath(fp)}`;
    }
  }

  if (tool?.name === "Edit" && tur && typeof tur === "object") {
    const fp = tur.file?.filePath || tool.input?.file_path;
    if (tur.message) return String(tur.message);
    if (fp) return `Updated ${displayPath(fp)}`;
  }

  if (tool?.name === "Read" && tur && typeof tur === "object" && tur.file) {
    const total = tur.file.totalLines ?? tur.file.numLines;
    const fp = displayPath(tur.file.filePath || tool.input?.file_path || "");
    if (total != null) return `Read ${total} lines from ${fp}`;
  }

  if (raw.startsWith("ERROR:") || raw.startsWith("Error:")) {
    return raw.split("\n")[0];
  }

  if (raw === "(No output)") return raw;

  const first = raw.split("\n")[0];
  if (first.length > 200) return first.slice(0, 200) + "...";
  return first;
}

function formatDurationLine(durationMs, turnIndex) {
  const verb = DURATION_VERBS[turnIndex % DURATION_VERBS.length];
  const sec = Math.max(1, Math.round((durationMs || 0) / 1000));
  if (sec < 60) return `✻ ${verb} for ${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `✻ ${verb} for ${m}m`;
  return `✻ ${verb} for ${m}m ${s}s`;
}

function extractAssistantParts(row) {
  const content = row.message?.content;
  const blocks = Array.isArray(content) ? content : content ? [content] : [];
  let text = "";
  const tools = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === "thinking") continue;
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (t && t !== "No response requested.") text += (text ? "\n\n" : "") + t;
    } else if (b.type === "tool_use") {
      tools.push({
        id: b.id,
        name: b.name || "Tool",
        input: b.input || {},
        label: formatToolLabel(b.name, b.input),
      });
    }
  }
  return { text, tools };
}

function formatToolLabel(name, input) {
  if (name === "Bash") {
    const cmd = (input?.command || "").trim();
    return `Bash(${cmd})`;
  }
  if (name === "Read" && input?.file_path) {
    return `Read(${displayPath(input.file_path)}${input.offset != null ? `, offset: ${input.offset}` : ""}${input.limit != null ? `, limit: ${input.limit}` : ""})`;
  }
  if (name === "Write" && input?.file_path) {
    return `Write(${displayPath(input.file_path)})`;
  }
  if (name === "Edit" && input?.file_path) {
    return `Edit(${displayPath(input.file_path)})`;
  }
  if (name === "Grep") {
    return `Grep(${input?.pattern || "…"})`;
  }
  if (name === "Glob" && input?.glob_pattern) {
    return `Glob(${input.glob_pattern})`;
  }
  if (name === "WebSearch" && input?.search_term) {
    return `WebSearch(${input.search_term})`;
  }
  if (name === "Task" && input?.description) {
    return `Task(${input.description})`;
  }
  return `${name}(${summarizeInput(input)})`;
}

function summarizeInput(input) {
  if (!input || typeof input !== "object") return "";
  const parts = [];
  if (input.command) parts.push(String(input.command).slice(0, 80));
  else if (input.file_path) parts.push(displayPath(input.file_path));
  else if (input.pattern) parts.push(input.pattern);
  else if (input.description) parts.push(input.description);
  return parts.join(", ").slice(0, 100) || "…";
}

function findToolUse(rows, resultIndex, toolUseId) {
  for (let j = resultIndex - 1; j >= 0; j--) {
    const row = rows[j];
    if (row.type !== "assistant") continue;
    const parts = extractAssistantParts(row);
    for (const t of parts.tools) {
      if (t.id === toolUseId) return t;
    }
  }
  return null;
}

function extractToolResults(row) {
  const content = row.message?.content;
  const blocks = Array.isArray(content) ? content : content ? [content] : [];
  const out = [];
  for (const b of blocks) {
    if (b?.type === "tool_result") {
      const text =
        typeof b.content === "string"
          ? b.content
          : Array.isArray(b.content)
            ? b.content
                .filter((x) => x?.type === "text")
                .map((x) => x.text)
                .join("\n")
            : "";
      out.push({
        toolUseId: b.tool_use_id,
        text,
        row,
      });
    }
  }
  return out;
}

function extractPlainUserText(row) {
  const content = getMessageContent(row);
  if (typeof content !== "string") return "";
  let t = content.trim();
  if (!t || t.startsWith("<system-reminder>")) return "";
  if (t.includes("<local-command")) return "";
  if (t.includes("<command-name>")) return "";
  t = stripUserQueryEnvelope(t);
  return t.trim();
}

function getMessageContent(row) {
  return row.message?.content ?? row.content ?? "";
}

function isLocalCommandCaveat(row) {
  const c = getMessageContent(row);
  return typeof c === "string" && c.includes("<local-command-caveat>");
}

function parseLocalCommandTags(content) {
  if (typeof content !== "string") return null;
  const name = content.match(/<command-name>([^<]*)<\/command-name>/)?.[1]?.trim();
  if (!name) return null;
  const args =
    content.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim() || "";
  const display = args ? `${name} ${args}`.trim() : name;
  return { name, display };
}

function parseLocalCommandStdout(content) {
  if (typeof content !== "string") return null;
  const m = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  return m ? m[1].trim() : null;
}

function shouldSkipSlashCommand(name) {
  if (process.env.CLAUDE_EXPORT_INCLUDE_EXPORT === "1") return false;
  return name === "/export";
}

function stripUserQueryEnvelope(s) {
  const m = String(s).match(/^[\s\n]*<user_query>([\s\S]*?)<\/user_query>[\s\n]*$/);
  return m ? m[1].trim() : String(s);
}

function displayPath(p) {
  return String(p || "").replace(/\//g, path.sep === "\\" ? "\\" : "/");
}

function wrapPlainText(text, prefix, contIndent, width) {
  const words = String(text).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const paragraph of words) {
    const chunks = paragraph.trim() ? [paragraph] : [""];
    for (const chunk of chunks) {
      if (!chunk) {
        out.push(prefix.trimEnd());
        continue;
      }
      let line = "";
      const tokens = chunk.split(/(\s+)/);
      for (const tok of tokens) {
        if (!tok) continue;
        if ((line + tok).length > width - contIndent.length && line) {
          out.push(applyPrefix(line, prefix, contIndent, out.length === 0));
          line = tok.trimStart();
        } else {
          line += tok;
        }
      }
      if (line || prefix) {
        out.push(applyPrefix(line, prefix, contIndent, out.length === 0));
      }
    }
  }
  if (out.length === 0) out.push(prefix.trimEnd());
  // Pad user lines like /export
  if (prefix === "> ") {
    return out.map((ln, i) => {
      if (i === 0 && ln.length < CONTENT_WIDTH) return ln.padEnd(CONTENT_WIDTH, " ");
      return ln;
    });
  }
  return out;
}

function applyPrefix(line, prefix, contIndent, isFirst) {
  if (!prefix && !contIndent) return line;
  if (isFirst) return prefix + line;
  return contIndent + line;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readFileStable(srcPath, { retries, delayMs }) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      return await fs.readFile(srcPath);
    } catch (e) {
      last = e;
      await delay(delayMs);
    }
  }
  const tmp =
    path.join(path.dirname(srcPath), `.hook-read-${process.pid}-${Date.now()}`) +
    path.extname(srcPath);
  try {
    await fs.copyFile(srcPath, tmp);
    try {
      return await fs.readFile(tmp);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  } catch {
    throw last;
  }
}

async function writeFileStable(destPath, data, { retries, delayMs }) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      await fs.writeFile(destPath, data);
      return;
    } catch (e) {
      last = e;
      await delay(delayMs);
    }
  }
  throw last;
}

main().catch(() => process.exit(0));
