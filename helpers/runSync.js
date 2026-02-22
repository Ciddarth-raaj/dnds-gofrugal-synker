"use strict";

const { getEnvConfig } = require("../config/env");
const { syncTable } = require("./syncApi");
const {
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  closePool,
} = require("./sqlServer");

/**
 * Run full sync for a database and table: validate, fetch config + data, POST to synker API.
 * @param {string} dbName
 * @param {string} tableName
 * @returns {Promise<{ success: boolean, synced?: number, message?: string, error?: string }>}
 */
async function runSync(dbName, tableName) {
  const trimmedDb = (dbName || "").trim();
  const trimmedTable = (tableName || "").trim();

  if (!trimmedDb) {
    return { success: false, error: "Database name is required." };
  }
  if (!trimmedTable) {
    return { success: false, error: "Table name is required." };
  }

  let config;
  try {
    config = getEnvConfig();
  } catch (e) {
    return { success: false, error: e.message };
  }

  try {
    const existsDb = await databaseExists(trimmedDb);
    if (!existsDb) {
      return { success: false, error: `Database "${trimmedDb}" does not exist.` };
    }

    const existsTable = await tableExists(trimmedDb, trimmedTable);
    if (!existsTable) {
      return { success: false, error: `Table "${trimmedTable}" does not exist in database "${trimmedDb}".` };
    }

    const tableConfig = await getTableConfig(trimmedDb, trimmedTable);
    const tableItems = await getTableData(trimmedDb, trimmedTable);

    // In dev, send one row per request so backend applies each (avoids only-first-row synced).
    const batchSize = config.isDev ? 10 : (config.syncBatchSize || 5000);
    const payload = {
      table_name: trimmedTable,
      table_config: tableConfig.table_config,
      unique_keys: tableConfig.unique_keys,
      table_items: [],
    };

    let synced = 0;
    for (let i = 0; i < tableItems.length; i += batchSize) {
      const chunk = tableItems.slice(i, i + batchSize);
      payload.table_items = chunk;
      const result = await syncTable(payload);
      synced += result.rows != null ? result.rows : chunk.length;
    }

    await closePool();

    return {
      success: true,
      synced,
      message: `Synced ${synced} rows for table "${trimmedTable}".`,
    };
  } catch (e) {
    await closePool().catch(() => { });
    const message = e.body ? (e.body.msg || e.message) : e.message;
    return { success: false, error: message };
  }
}

module.exports = { runSync };
