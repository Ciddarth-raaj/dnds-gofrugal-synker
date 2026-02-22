"use strict";

require("dotenv").config();

const required = [
  "MSSQL_USER",
  "MSSQL_PASSWORD",
  "MSSQL_SERVER",
  "MSSQL_INSTANCE",
  "GOFRUGAL_SYNKER_BASE_URL",
];

const optional = {
  MSSQL_DATABASE: "master",
  MSSQL_ENCRYPT: "false",
  MSSQL_TRUST_SERVER_CERTIFICATE: "true",
  SYNC_BATCH_SIZE: "5000",
};

function getEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") return null;
  return value;
}

function loadEnv() {
  const missing = required.filter((key) => !getEnv(key));
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill in values.`
    );
  }

  const env = {
    // SQL Server (GoFrugal source)
    mssql: {
      user: getEnv("MSSQL_USER"),
      password: getEnv("MSSQL_PASSWORD"),
      server: getEnv("MSSQL_SERVER"),
      database: getEnv("MSSQL_DATABASE") || optional.MSSQL_DATABASE,
      options: {
        instanceName: getEnv("MSSQL_INSTANCE"),
        encrypt: getEnv("MSSQL_ENCRYPT") === "true",
        trustServerCertificate: getEnv("MSSQL_TRUST_SERVER_CERTIFICATE") === "true",
      },
    },
    // Gofrugal Synker API (dailyneeds backend)
    synker: {
      baseUrl: getEnv("GOFRUGAL_SYNKER_BASE_URL").replace(/\/$/, ""),
      syncPath: "/gofrugal-synker/sync",
    },
    syncBatchSize: parseInt(getEnv("SYNC_BATCH_SIZE") || optional.SYNC_BATCH_SIZE, 10) || 5000,
  };

  return env;
}

let cached = null;

function getEnvConfig() {
  if (!cached) cached = loadEnv();
  return cached;
}

module.exports = { getEnvConfig, getEnv };
