"use strict";

const express = require("express");
const { getEnvConfig } = require("./config/env");
const { runSync } = require("./helpers/runSync");
const { listDatabases, listTables } = require("./helpers/sqlServer");
const scheduler = require("./services/scheduler");

const app = express();
app.use(express.json());

// Allow frontend (dev on port 3000 or with VITE_API_URL) to call this backend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3080;

// Health check for UI and scripts
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// List databases (dev: from JSON; prod: SQL Server)
app.get("/api/databases", async (req, res) => {
  try {
    const databases = await listDatabases();
    res.json({ databases });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List tables in a database
app.get("/api/databases/:dbName/tables", async (req, res) => {
  try {
    const tables = await listTables(req.params.dbName);
    res.json({ tables });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get current schedule (for UI prefill) and next 2 run times
app.get("/api/schedule", (req, res) => {
  try {
    const schedule = scheduler.loadSchedule();
    const nextRuns = scheduler.getNextRunsForCurrent(2);
    res.json({ schedule, nextRuns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save schedule: backend runs CRON and calls sync API at schedule times. Body: { cronExpression, selectedTables }
app.post("/api/schedule", (req, res) => {
  try {
    const { cronExpression, selectedTables } = req.body || {};
    if (!cronExpression?.trim() || !selectedTables?.length) {
      const result = scheduler.clearSchedule();
      return res.json({ success: true, schedule: null, nextRuns: result.nextRuns });
    }
    const result = scheduler.setSchedule(cronExpression.trim(), selectedTables);
    res.json({
      success: true,
      schedule: { cronExpression: cronExpression.trim(), selectedTables },
      nextRuns: result.nextRuns,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Clear schedule (stop CRON, remove saved)
app.delete("/api/schedule", (req, res) => {
  try {
    const result = scheduler.clearSchedule();
    res.json({ success: true, nextRuns: result.nextRuns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logs (sync runs from Sync button or from CRON). Schedule included so UI can show "in English".
app.get("/api/logs", (req, res) => {
  try {
    const logs = scheduler.loadLogs();
    const nextRuns = scheduler.getNextRunsForCurrent(3);
    const schedule = scheduler.loadSchedule();
    res.json({ logs, nextRuns, schedule });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Run sync: backend calls actual synker API (GOFRUGAL_SYNKER_BASE_URL). Used by UI "Sync" and by CRON.
app.post("/api/sync", async (req, res) => {
  const { dbName, tableName } = req.body || {};
  const result = await runSync(dbName, tableName);
  if (result.success) {
    scheduler.appendLog({ dbName, tableName, status: "success", message: result.message, synced: result.synced });
    return res.json({ success: true, synced: result.synced, message: result.message });
  }
  scheduler.appendLog({ dbName, tableName, status: "error", message: result.error });
  res.status(400).json({ success: false, error: result.error });
});

app.listen(PORT, () => {
  try {
    getEnvConfig();
  } catch (e) {
    console.warn("Env config not loaded (missing .env?):", e.message);
  }
  console.log(`Backend running at http://localhost:${PORT}`);
});
