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

async function databaseExists(dbName) {
  const data = loadDevTables();
  return Boolean(data.databases && data.databases[dbName]);
}

async function tableExists(dbName, tableName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  return Boolean(db && db.tables && db.tables[tableName]);
}

async function getTableConfig(dbName, tableName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  const table = db && db.tables && db.tables[tableName];
  if (!table) throw new Error(`Table "${tableName}" not found in dev data for database "${dbName}".`);
  return {
    table_config: table.table_config || [],
    unique_keys: table.unique_keys || [],
  };
}

async function getTableData(dbName, tableName) {
  const data = loadDevTables();
  const db = data.databases && data.databases[dbName];
  const table = db && db.tables && db.tables[tableName];
  if (!table) throw new Error(`Table "${tableName}" not found in dev data for database "${dbName}".`);
  return Array.isArray(table.table_items) ? table.table_items : [];
}

async function closePool() {
  // No-op in dev; no real connection.
}

module.exports = {
  listDatabases,
  listTables,
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  closePool,
};
