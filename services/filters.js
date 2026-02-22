"use strict";

const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(process.cwd(), "data");
const FILTERS_FILE = path.join(DATA_DIR, "filters.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filterKey(dbName, tableName) {
  return `${(dbName || "").trim()}_${(tableName || "").trim()}`;
}

function loadAll() {
  ensureDataDir();
  if (!fs.existsSync(FILTERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILTERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(data) {
  ensureDataDir();
  fs.writeFileSync(FILTERS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getFilters(dbName, tableName) {
  const all = loadAll();
  const key = filterKey(dbName, tableName);
  return Array.isArray(all[key]) ? all[key] : [];
}

function setFilters(dbName, tableName, filters) {
  const all = loadAll();
  const key = filterKey(dbName, tableName);
  if (!key || key === "_") return;
  if (!Array.isArray(filters) || filters.length === 0) {
    delete all[key];
  } else {
    all[key] = filters;
  }
  saveAll(all);
  return getFilters(dbName, tableName);
}

module.exports = {
  filterKey,
  loadAll,
  getFilters,
  setFilters,
};
