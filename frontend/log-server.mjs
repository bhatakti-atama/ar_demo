#!/usr/bin/env node
/**
 * Simple log server that receives telemetry from the AR app and writes to log.txt
 * Run alongside the Vite dev server: node log-server.mjs
 */

import { createServer } from "node:http";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, "..", "log.txt");
const PORT = 3001;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const formatTimestamp = () => new Date().toISOString();

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/log") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { logs } = JSON.parse(body);
        if (Array.isArray(logs) && logs.length > 0) {
          const lines = logs.map((line) => `${formatTimestamp()} | ${line}`).join("\n") + "\n";
          await appendFile(LOG_FILE, lines);
          console.log(`[log-server] Wrote ${logs.length} log entries`);
        }
        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[log-server] Error:", err.message);
        res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/log/clear") {
    try {
      await writeFile(LOG_FILE, `--- Log cleared at ${formatTimestamp()} ---\n`);
      console.log("[log-server] Log file cleared");
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end("Not found");
});

await writeFile(LOG_FILE, `--- AR Telemetry Log Started at ${formatTimestamp()} ---\n`);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[log-server] Telemetry log server running on http://0.0.0.0:${PORT}`);
  console.log(`[log-server] Writing logs to: ${LOG_FILE}`);
});
