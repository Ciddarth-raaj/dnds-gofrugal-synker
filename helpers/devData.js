"use strict";

const path = require("path");
const fs = require("fs");
const { getEnvConfig } = require("../config/env");

let cached = null;

function loadDevTables() {
  if (cached) return cached;
  const { devTablesPath } = getEnvConfig();
  const fullPath = path.isAbsolute(devTablesPath)
    ? devTablesPath
    : path.join(process.cwd(), devTablesPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  cached = JSON.parse(raw);
  return cached;
}

async function listDatabases() {
  const data = loadDevTables();
  if (!data.databases) return [];
  return Object.keys(data.databases);
}

async function listTables(dbName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  if (!db || !db.tables) return [];
  return Object.keys(db.tables);
}

async function listViews(dbName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  if (!db || !db.views) return [];
  return Object.keys(db.views);
}

async function databaseExists(dbName) {
  const data = loadDevTables();
  return Boolean(data.databases && data.databases[dbName]);
}

async function tableExists(dbName, tableName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  return Boolean(
    db &&
      ((db.tables && db.tables[tableName]) || (db.views && db.views[tableName]))
  );
}

async function getTableConfig(dbName, tableName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  const table =
    (db && db.tables && db.tables[tableName]) ||
    (db && db.views && db.views[tableName]);
  if (!table)
    throw new Error(
      `Table or view "${tableName}" not found in dev data for database "${dbName}".`
    );
  return {
    table_config: table.table_config || [],
    unique_keys: table.unique_keys || [],
  };
}

/** Normalize to YYYY-MM-DD for date comparison. Handles "2025-02-22", "2025-02-22 10:00:00", ISO. */
function toDateOnly(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

function rowMatchesFilters(row, filters) {
  if (!filters || filters.length === 0) return true;
  for (const f of filters) {
    const val = row[f.column];
    const op = (f.operator || "eq").toLowerCase();
    if (op === "eq") {
      const v = f.value;
      if (v == null || v === "") continue;
      const dateVal = toDateOnly(val);
      const dateV = toDateOnly(v);
      if (dateVal != null && dateV != null) {
        if (dateVal === dateV) continue;
        return false;
      }
      if (val != null && String(val) === String(v)) continue;
      return false;
    }
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      const v = f.value;
      if (v == null || v === "") continue;
      const dateVal = toDateOnly(val);
      const dateV = toDateOnly(v);
      if (dateVal != null && dateV != null) {
        const cmp = dateVal.localeCompare(dateV);
        if (op === "gt" && cmp <= 0) return false;
        if (op === "gte" && cmp < 0) return false;
        if (op === "lt" && cmp >= 0) return false;
        if (op === "lte" && cmp > 0) return false;
        continue;
      }
      const numVal = Number(val);
      const numV = Number(v);
      if (Number.isNaN(numVal) || Number.isNaN(numV)) {
        const sVal = val == null ? "" : String(val);
        const sV = String(v);
        const cmp = sVal.localeCompare(sV);
        if (op === "gt" && cmp <= 0) return false;
        if (op === "gte" && cmp < 0) return false;
        if (op === "lt" && cmp >= 0) return false;
        if (op === "lte" && cmp > 0) return false;
      } else {
        if (op === "gt" && numVal <= numV) return false;
        if (op === "gte" && numVal < numV) return false;
        if (op === "lt" && numVal >= numV) return false;
        if (op === "lte" && numVal > numV) return false;
      }
      continue;
    }
    if (op === "range" && Array.isArray(f.value) && f.value.length >= 2) {
      const [lo, hi] = f.value;
      if (lo == null || hi == null) continue;
      const dateVal = toDateOnly(val);
      const dateLo = toDateOnly(lo);
      const dateHi = toDateOnly(hi);
      if (dateVal != null && dateLo != null && dateHi != null) {
        if (dateVal < dateLo || dateVal > dateHi) return false;
        continue;
      }
      const numVal = Number(val);
      const numLo = Number(lo);
      const numHi = Number(hi);
      if (!Number.isNaN(numVal) && !Number.isNaN(numLo) && !Number.isNaN(numHi)) {
        if (numVal < numLo || numVal > numHi) return false;
      } else {
        const sVal = val == null ? "" : String(val);
        if (sVal.localeCompare(String(lo)) < 0 || sVal.localeCompare(String(hi)) > 0) return false;
      }
    }
  }
  return true;
}

async function getTableData(dbName, tableName, filters = []) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  const table =
    (db && db.tables && db.tables[tableName]) ||
    (db && db.views && db.views[tableName]);
  if (!table)
    throw new Error(
      `Table or view "${tableName}" not found in dev data for database "${dbName}".`
    );
  const rows = Array.isArray(table.table_items) ? table.table_items : [];
  if (!filters || filters.length === 0) return rows;
  return rows.filter((row) => rowMatchesFilters(row, filters));
}

async function closePool() {
  // No-op in dev; no real connection.
}

module.exports = {
  listDatabases,
  listTables,
  listViews,
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  closePool,
};
