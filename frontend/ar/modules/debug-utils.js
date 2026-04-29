export const createDebugLog = ({ bootTime, namespace, maxLines = 220, logElementId = "app-debug-log" }) => {
  /** @type {string[]} */
  const logBuffer = [];

  return (tag, ...parts) => {
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
  };
};

export const safeJson = (o) => {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return String(o);
  }
};
