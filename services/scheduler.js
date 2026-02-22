"use strict";

/**
 * Scheduler: runs sync at CRON times. All config and logs are stored as JSON files
 * in the backend (data/) so they persist across server restarts and sessions.
 * - data/schedule.json: { cronExpression, selectedTables }
 * - data/logs.json: array of sync log entries
 */
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const cronParser = require("cron-parser");
const { runSync } = require("../helpers/runSync");

const DATA_DIR = path.join(process.cwd(), "data");
const SCHEDULE_FILE = path.join(DATA_DIR, "schedule.json");
const LOGS_FILE = path.join(DATA_DIR, "logs.json");
const MAX_LOGS = 500;

let currentJob = null;
let currentExpression = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSchedule() {
  ensureDataDir();
  if (!fs.existsSync(SCHEDULE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveSchedule(schedule) {
  ensureDataDir();
  if (schedule) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2), "utf8");
  } else if (fs.existsSync(SCHEDULE_FILE)) {
    fs.unlinkSync(SCHEDULE_FILE);
  }
}

function loadLogs() {
  ensureDataDir();
  if (!fs.existsSync(LOGS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOGS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const logs = loadLogs();
  logs.unshift({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(0, MAX_LOGS), null, 2), "utf8");
}

async function runScheduledSync(tables) {
  for (const { dbName, tableName } of tables) {
    try {
      const result = await runSync(dbName, tableName);
      if (result.success) {
        appendLog({ dbName, tableName, status: "success", message: result.message, synced: result.synced });
      } else {
        appendLog({ dbName, tableName, status: "error", message: result.error });
      }
    } catch (e) {
      appendLog({ dbName, tableName, status: "error", message: e.message || String(e) });
    }
  }
}

function getNextRuns(expr, count = 2) {
  if (!expr?.trim()) return [];
  try {
    const interval = cronParser.parseExpression(expr.trim());
    const out = [];
    for (let i = 0; i < count; i++) {
      const next = interval.next();
      out.push(next.toDate().toISOString());
    }
    return out;
  } catch {
    return [];
  }
}

function setSchedule(cronExpression, selectedTables) {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    currentExpression = null;
  }
  if (!cronExpression?.trim() || !selectedTables?.length) {
    saveSchedule(null);
    return { nextRuns: [] };
  }
  const expr = cronExpression.trim();
  const tables = selectedTables;
  if (!cron.validate(expr)) {
    saveSchedule(null);
    throw new Error("Invalid CRON expression");
  }
  currentJob = cron.schedule(expr, async () => {
    await runScheduledSync(tables);
  });
  currentExpression = expr;
  saveSchedule({ cronExpression: expr, selectedTables: tables });
  return { nextRuns: getNextRuns(expr, 2) };
}

function clearSchedule() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    currentExpression = null;
  }
  saveSchedule(null);
  return { nextRuns: [] };
}

function getNextRunsForCurrent(count = 2) {
  return getNextRuns(currentExpression, count);
}

function init() {
  const schedule = loadSchedule();
  if (schedule?.cronExpression && schedule?.selectedTables?.length) {
    if (cron.validate(schedule.cronExpression)) {
      currentJob = cron.schedule(schedule.cronExpression, async () => {
        await runScheduledSync(schedule.selectedTables);
      });
      currentExpression = schedule.cronExpression;
    } else {
      console.warn("Scheduler: invalid saved cron, cleared.");
      saveSchedule(null);
    }
  }
}

init();

module.exports = {
  loadSchedule,
  setSchedule,
  clearSchedule,
  loadLogs,
  getNextRunsForCurrent,
  appendLog,
};
