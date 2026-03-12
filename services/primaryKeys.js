"use strict";

const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(process.cwd(), "data");
const PRIMARY_KEYS_FILE = path.join(DATA_DIR, "primary-keys.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function storageKey(dbName, tableName) {
  return `${(dbName || "").trim()}_${(tableName || "").trim()}`;
}

function loadAll() {
  ensureDataDir();
  if (!fs.existsSync(PRIMARY_KEYS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PRIMARY_KEYS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(data) {
  ensureDataDir();
  fs.writeFileSync(PRIMARY_KEYS_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Get user-set primary key columns for a table. Returns [] if not set (use schema default).
 * @returns {string[]}
 */
function getPrimaryKeys(dbName, tableName) {
  const all = loadAll();
  const key = storageKey(dbName, tableName);
  return Array.isArray(all[key]) ? all[key] : [];
}

/**
 * Set primary key columns for a table. Pass [] to clear override (use schema default).
 * @param {string[]} primaryKeys - Column names (order preserved for composite key)
 */
function setPrimaryKeys(dbName, tableName, primaryKeys) {
  const all = loadAll();
  const key = storageKey(dbName, tableName);
  if (!key || key === "_") return getPrimaryKeys(dbName, tableName);
  const list = Array.isArray(primaryKeys)
    ? primaryKeys.filter((c) => typeof c === "string" && c.trim() !== "").map((c) => c.trim())
    : [];
  if (list.length === 0) {
    delete all[key];
  } else {
    all[key] = list;
  }
  saveAll(all);
  return getPrimaryKeys(dbName, tableName);
}

module.exports = {
  storageKey,
  loadAll,
  getPrimaryKeys,
  setPrimaryKeys,
};
