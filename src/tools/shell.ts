import { defineTool } from "./registry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Bounded shell exec. The agent does NOT get arbitrary shell access — only
 * an allowlist of commands. Anything off-list rejects with a clear error.
 */
const ALLOWED_COMMANDS = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "find",
  "git",
  "node",
  "npm",
  "npx",
  "tsc",
]);

const ALLOWED_GIT_SUBCMDS = new Set([
  "status",
  "log",
  "diff",
  "branch",
  "remote",
  "show",
  "ls-files",
  "rev-parse",
]);

export interface ShellInput {
  command: string;
  args?: string[];
  cwd?: string;
  timeout_ms?: number;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  truncated: boolean;
}

const MAX_OUTPUT = 100_000;

export default defineTool<ShellInput, ShellOutput>({
  name: "shell.exec",
  description:
    "Run a bounded shell command. Allowlist: ls, pwd, cat, head, tail, wc, grep, find, git (read-only subcommands only), node, npm, npx, tsc. No pipes, no redirects, no shell metacharacters. Returns stdout/stderr/exit code, capped at 100k chars.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string" },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      timeout_ms: { type: "integer", minimum: 100, maximum: 60_000 },
    },
    required: ["command"],
    additionalProperties: false,
  },
  async handler({ command, args = [], cwd, timeout_ms = 15_000 }) {
    if (!ALLOWED_COMMANDS.has(command)) {
      throw new Error(`shell.exec: command "${command}" not on allowlist`);
    }
    if (command === "git") {
      const sub = args[0];
      if (!sub || !ALLOWED_GIT_SUBCMDS.has(sub)) {
        throw new Error(`shell.exec: git subcommand "${sub}" not on allowlist (read-only only)`);
      }
    }
    // No pipe/redirect characters — execFile already prevents shell injection
    // since we don't go through a shell, but defense in depth.
    for (const a of args) {
      if (typeof a !== "string" || /[;&|`$<>]/.test(a)) {
        throw new Error(`shell.exec: arg contains shell metacharacters: ${a}`);
      }
    }
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd,
        timeout: timeout_ms,
        maxBuffer: MAX_OUTPUT * 2,
      });
      return {
        stdout: stdout.length > MAX_OUTPUT ? stdout.slice(0, MAX_OUTPUT) : stdout,
        stderr: stderr.length > MAX_OUTPUT ? stderr.slice(0, MAX_OUTPUT) : stderr,
        exit_code: 0,
        truncated: stdout.length > MAX_OUTPUT || stderr.length > MAX_OUTPUT,
      };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
      return {
        stdout: (err.stdout ?? "").slice(0, MAX_OUTPUT),
        stderr: (err.stderr ?? err.message ?? "").slice(0, MAX_OUTPUT),
        exit_code: typeof err.code === "number" ? err.code : 1,
        truncated: false,
      };
    }
  },
});
