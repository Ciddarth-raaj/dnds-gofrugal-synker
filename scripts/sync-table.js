#!/usr/bin/env node
"use strict";

const { getEnvConfig } = require("../config/env");
const { syncTable } = require("../helpers/syncApi");
const {
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  closePool,
} = require("../helpers/sqlServer");
const { ask } = require("./prompts");

async function main() {
  let config;
  try {
    config = getEnvConfig();
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }

  console.log("Gofrugal DB Synker – sync a SQL Server table to the backend.\n");

  // Optional: npm run sync [dbName] [tableName]
  let dbName = process.argv[2] ? process.argv[2].trim() : "";
  let tableName = process.argv[3] ? process.argv[3].trim() : "";

  if (!dbName) dbName = await ask("Enter database name: ");
  if (!dbName) {
    console.error("❌ Database name is required.");
    process.exit(1);
  }

  if (!tableName) tableName = await ask("Enter table name: ");
  if (!tableName) {
    console.error("❌ Table name is required.");
    process.exit(1);
  }

  console.log("\nChecking database and table...");

  let exists;
  try {
    exists = await databaseExists(dbName);
  } catch (e) {
    console.error("❌ Failed to check database:", e.message);
    await closePool();
    process.exit(1);
  }

  if (!exists) {
    console.error(`❌ Database "${dbName}" does not exist.`);
    await closePool();
    process.exit(1);
  }
  console.log(`✅ Database "${dbName}" exists.`);

  try {
    exists = await tableExists(dbName, tableName);
  } catch (e) {
    console.error("❌ Failed to check table:", e.message);
    await closePool();
    process.exit(1);
  }

  if (!exists) {
    console.error(`❌ Table "${tableName}" does not exist in database "${dbName}".`);
    await closePool();
    process.exit(1);
  }
  console.log(`✅ Table "${tableName}" exists.`);

  console.log("\nFetching table config and data...");

  let tableConfig;
  let tableItems;
  try {
    tableConfig = await getTableConfig(dbName, tableName);
    tableItems = await getTableData(dbName, tableName);
  } catch (e) {
    console.error("❌ Failed to fetch table config or data:", e.message);
    await closePool();
    process.exit(1);
  }

  const batchSize = config.syncBatchSize || 5000;
  const totalRows = tableItems.length;
  console.log(`✅ Table config: ${tableConfig.table_config.length} columns, unique_keys: [${tableConfig.unique_keys.join(", ")}].`);
  console.log(`✅ Rows to sync: ${totalRows}.`);

  if (totalRows === 0) {
    console.log("No rows to sync; sending schema only.");
  }

  const payload = {
    table_name: tableName,
    table_config: tableConfig.table_config,
    unique_keys: tableConfig.unique_keys,
    table_items: [],
  };

  let synced = 0;
  for (let i = 0; i < tableItems.length; i += batchSize) {
    const chunk = tableItems.slice(i, i + batchSize);
    payload.table_items = chunk;
    try {
      const result = await syncTable(payload);
      synced += result.rows != null ? result.rows : chunk.length;
      console.log(`  Synced batch: ${chunk.length} rows (total so far: ${synced}).`);
    } catch (e) {
      console.error("❌ Sync API error:", e.message);
      if (e.body) console.error("   Response:", JSON.stringify(e.body, null, 2));
      await closePool();
      process.exit(1);
    }
  }

  await closePool();
  console.log(`\n✅ Done. Synced ${synced} rows to ${config.synker.baseUrl} for table "${tableName}".`);
}

main();
