// Claude, through the Claude Code CLI in print mode (`claude -p`). Used by the
// AI teacher and the quiz question generator. Every call is one-shot with no
// tools, no MCP servers and no project settings, and returns JSON that
// matches a schema.
//
// The CLI uses whatever it is logged in with. For heavy use (a class many
// students attend), log it in with an API key (ANTHROPIC_API_KEY in
// backend/.env) rather than a personal subscription.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const MODEL = process.env.AI_TEACHER_MODEL || "sonnet";

/** CLAUDE_BIN, else `claude` on the PATH, else the newest copy bundled with the VS Code extension. */
function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH || "").split(":")) {
    if (dir && existsSync(join(dir, "claude"))) return join(dir, "claude");
  }
  for (const p of [join(homedir(), ".local", "bin", "claude"), join(homedir(), ".claude", "local", "claude")]) {
    if (existsSync(p)) return p;
  }
  const ext = join(homedir(), ".vscode", "extensions");
  try {
    const found = readdirSync(ext)
      .filter((d) => d.startsWith("anthropic.claude-code-"))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((d) => join(ext, d, "resources", "native-binary", "claude"))
      .find((p) => existsSync(p));
    if (found) return found;
  } catch {}
  return null;
}

export const CLAUDE_BIN = findClaude();
export const claudeAvailable = () => !!CLAUDE_BIN;

export function askClaude({ system, prompt, schema, timeoutMs = 120_000 }) {
  if (!CLAUDE_BIN) return Promise.reject(new Error("The Claude CLI wasn't found. Set CLAUDE_BIN in backend/.env"));
  const args = [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    "--system-prompt", system,
    "--json-schema", JSON.stringify(schema),
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--disable-slash-commands",
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(CLAUDE_BIN, args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      let res;
      try {
        res = JSON.parse(out);
      } catch {
        return reject(new Error(`Claude CLI failed (${code}): ${(err || out).slice(-300)}`));
      }
      if (res.is_error) return reject(new Error(`Claude: ${String(res.result).slice(0, 300)}`));
      if (res.structured_output) return resolve(res.structured_output);
      try {
        resolve(JSON.parse(res.result));
      } catch {
        reject(new Error("Claude didn't return the expected JSON"));
      }
    });
    p.stdin.end(prompt);
  });
}
