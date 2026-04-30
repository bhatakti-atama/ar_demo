const LOG_ENDPOINT = "/api/log";
const LOG_FLUSH_INTERVAL_MS = 2000;
const LOG_BATCH_SIZE = 50;

let pendingLogs = [];
let flushTimer = null;
let loggingEnabled = new URLSearchParams(window.location?.search).get("log") !== "0";
let remoteLoggingEnabled = new URLSearchParams(window.location?.search).get("remotelog") !== "0";

export const isLoggingEnabled = () => loggingEnabled;
export const isRemoteLoggingEnabled = () => remoteLoggingEnabled;

export const setLoggingEnabled = (enabled) => {
  loggingEnabled = enabled;
  console.log(`[debug-utils] Logging ${enabled ? "enabled" : "disabled"}`);
};

export const setRemoteLoggingEnabled = (enabled) => {
  remoteLoggingEnabled = enabled;
  console.log(`[debug-utils] Remote logging ${enabled ? "enabled" : "disabled"}`);
  if (!enabled && pendingLogs.length > 0) {
    pendingLogs = [];
  }
};

const flushLogs = async () => {
  if (pendingLogs.length === 0 || !remoteLoggingEnabled) return;
  const toSend = pendingLogs.splice(0, LOG_BATCH_SIZE);
  try {
    await fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: toSend }),
    });
  } catch {
    pendingLogs.unshift(...toSend);
  }
};

const scheduleFlush = () => {
  if (flushTimer || !remoteLoggingEnabled) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLogs();
  }, LOG_FLUSH_INTERVAL_MS);
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => void flushLogs());
  window.addEventListener("pagehide", () => void flushLogs());
}

export const createDebugLog = ({ bootTime, namespace, maxLines = 220, logElementId = "app-debug-log" }) => {
  /** @type {string[]} */
  const logBuffer = [];

  return (tag, ...parts) => {
    if (!loggingEnabled) return;
    
    const row = { tag, tMs: Math.round(performance.now() - bootTime) };
    const fmt = (p) => {
      if (p === undefined) {
        return "";
      }
      if (typeof p === "object" && p !== null) {
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      }
      return String(p);
    };
    const time = new Date().toISOString().slice(11, 23);
    const textParts = [tag, ...parts].map(fmt).filter(Boolean);
    const line = [time, namespace, ...textParts].join(" | ");
    const stack =
      textParts.length > 0
        ? `${line} | ${row.tMs}ms from boot`
        : `${line} | ${row.tMs}ms`;
    logBuffer.push(stack);
    if (logBuffer.length > maxLines * 2) {
      logBuffer.splice(0, logBuffer.length - maxLines);
    }
    console.log(`[${namespace}]`, tag, ...parts, { msFromBoot: row.tMs });
    const el = document.getElementById(logElementId);
    if (el) {
      el.textContent = logBuffer.slice(-maxLines).join("\n");
    }

    if (remoteLoggingEnabled) {
      pendingLogs.push(stack);
      scheduleFlush();
    }
  };
};

export const safeJson = (o) => {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return String(o);
  }
};
