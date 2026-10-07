/**
 * Minimal structured logger. One line per event: a human-readable message
 * followed by key=value fields, so logs stay greppable locally and parseable
 * in hosted log drains. Set LOG_FORMAT=json for strict JSON lines.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return ORDER[level] ?? ORDER.info;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === "string") return /[\s="]/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

function emit(level: Level, scope: string, msg: string, fields: Fields = {}) {
  if (ORDER[level] < threshold()) return;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (process.env.LOG_FORMAT === "json") {
    const normalized = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? v.message : v]),
    );
    out(JSON.stringify({ ts: new Date().toISOString(), level, scope, msg, ...normalized }));
    return;
  }
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(" ");
  out(`${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${kv ? `  ${kv}` : ""}`);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, fields) => emit("debug", scope, msg, fields),
    info: (msg, fields) => emit("info", scope, msg, fields),
    warn: (msg, fields) => emit("warn", scope, msg, fields),
    error: (msg, fields) => emit("error", scope, msg, fields),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
