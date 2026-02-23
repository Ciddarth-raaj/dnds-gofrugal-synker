"use strict";

const express = require("express");
const { getEnvConfig } = require("./config/env");
const { runSync } = require("./helpers/runSync");
const { listDatabases, listTables, getTableConfig, getTablePreview } = require("./helpers/sqlServer");
const scheduler = require("./services/scheduler");
const filtersService = require("./services/filters");

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

// Get columns for a table (for filter UI)
app.get("/api/databases/:dbName/tables/:tableName/columns", async (req, res) => {
  try {
    const { dbName, tableName } = req.params;
    const config = await getTableConfig(dbName, tableName);
    const columns = (config.table_config || []).map((c) => ({ name: c.name, type: c.type || "VARCHAR(255)" }));
    res.json({ columns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preview: first 50 rows of a table (for View modal)
app.get("/api/databases/:dbName/tables/:tableName/preview", async (req, res) => {
  try {
    const { dbName, tableName } = req.params;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = await getTablePreview(dbName, tableName, limit);
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all filters (keyed by dbName_tableName)
app.get("/api/filters", (req, res) => {
  try {
    const filters = filtersService.loadAll();
    res.json({ filters });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save filters for a table. Body: { dbName, tableName, filters: [{ column, operator, value }] }
app.post("/api/filters", (req, res) => {
  try {
    const { dbName, tableName, filters } = req.body || {};
    if (!dbName || !tableName) {
      return res.status(400).json({ error: "dbName and tableName are required." });
    }
    const updated = filtersService.setFilters(dbName, tableName, Array.isArray(filters) ? filters : []);
    res.json({ success: true, filters: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get current schedule (for UI prefill), next 2 run times, and paused state
app.get("/api/schedule", (req, res) => {
  try {
    const schedule = scheduler.loadSchedule();
    const nextRuns = scheduler.getNextRunsForCurrent(2);
    const paused = scheduler.isPaused();
    res.json({ schedule, nextRuns, paused });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save schedule: backend runs one CRON only; previous CRON is stopped before starting the new one. Body: { cronExpression, selectedTables }
app.post("/api/schedule", (req, res) => {
  try {
    const { cronExpression, selectedTables } = req.body || {};
    if (!cronExpression?.trim() || !selectedTables?.length) {
      const result = scheduler.clearSchedule();
      return res.json({ success: true, schedule: null, nextRuns: result.nextRuns, paused: false });
    }
    const result = scheduler.setSchedule(cronExpression.trim(), selectedTables);
    res.json({
      success: true,
      schedule: { cronExpression: cronExpression.trim(), selectedTables, paused: false },
      nextRuns: result.nextRuns,
      paused: false,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Clear schedule (stop CRON, remove saved)
app.delete("/api/schedule", (req, res) => {
  try {
    const result = scheduler.clearSchedule();
    res.json({ success: true, nextRuns: result.nextRuns, paused: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pause or resume scheduled sync. Body: { paused: true } to stop, { paused: false } to resume.
app.post("/api/schedule/pause", (req, res) => {
  try {
    const { paused } = req.body || {};
    const schedule = scheduler.loadSchedule();
    if (!schedule?.cronExpression) {
      return res.status(400).json({ error: "No schedule set. Save a schedule first." });
    }
    const newPaused = scheduler.setPaused(Boolean(paused));
    res.json({ success: true, paused: newPaused });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logs (sync runs from Sync button or from CRON). Schedule and paused state included.
app.get("/api/logs", (req, res) => {
  try {
    const logs = scheduler.loadLogs();
    const nextRuns = scheduler.getNextRunsForCurrent(3);
    const schedule = scheduler.loadSchedule();
    const paused = scheduler.isPaused();
    res.json({ logs, nextRuns, schedule, paused });
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
