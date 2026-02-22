#!/usr/bin/env node
"use strict";

const { getEnvConfig } = require("../config/env");
const { runSync } = require("../helpers/runSync");
const { ask } = require("./prompts");

async function main() {
  try {
    getEnvConfig();
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }

  console.log("Gofrugal DB Synker – sync a SQL Server table to the backend.\n");

  let dbName = process.argv[2] ? process.argv[2].trim() : "";
  let tableName = process.argv[3] ? process.argv[3].trim() : "";

  if (!dbName) dbName = await ask("Enter database name: ");
  if (!tableName) tableName = await ask("Enter table name: ");

  console.log("\nChecking database and table...");

  const result = await runSync(dbName, tableName);

  if (result.success) {
    console.log(`\n✅ ${result.message}`);
    return;
  }

  console.error("❌", result.error);
  process.exit(1);
}

main();
