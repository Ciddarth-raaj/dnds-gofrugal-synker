"use strict";

const sql = require("mssql");
const { getEnvConfig } = require("../config/env");

let pool = null;

/**
 * Get or create SQL Server connection pool. Uses env config; optional override for database.
 * @param {string} [database] - Override database name (e.g. user-provided dbname)
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool(database) {
  const { mssql } = getEnvConfig();
  const config = {
    user: mssql.user,
    password: mssql.password,
    server: mssql.server,
    database: database || mssql.database,
    options: { ...mssql.options },
  };
  if (pool) {
    if (config.database === pool.config.database) return pool;
    await pool.close();
    pool = null;
  }
  pool = await sql.connect(config);
  return pool;
}

/**
 * Check if a database exists on the server.
 * @param {string} dbName
 * @returns {Promise<boolean>}
 */
async function databaseExists(dbName) {
  const p = await getPool("master");
  const r = await p.request().input("name", sql.NVarChar, dbName).query(`
    SELECT 1 AS ok FROM sys.databases WHERE name = @name
  `);
  return r.recordset.length > 0;
}

/**
 * Check if a table exists in the given database.
 * @param {string} dbName
 * @param {string} tableName - TABLE_NAME (single table name)
 * @returns {Promise<boolean>}
 */
async function tableExists(dbName, tableName) {
  const p = await getPool(dbName);
  const r = await p
    .request()
    .input("tableName", sql.NVarChar, tableName)
    .query(`
    SELECT 1 AS ok
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = @tableName
  `);
  return r.recordset.length > 0;
}

/** MariaDB/MySQL max row size (bytes). Stay under 65535 to avoid ER_TOO_BIG_ROWSIZE. utf8mb4 = 4 bytes/char. */
const MAX_ROW_SIZE = 65000;

/**
 * Estimated byte size of a column type in MariaDB (utf8mb4). Used to avoid ER_TOO_BIG_ROWSIZE.
 */
function typeByteSize(typeStr) {
  if (!typeStr) return 0;
  const t = typeStr.toUpperCase();
  if (t === "TEXT" || t.startsWith("BLOB")) return 12; // stored off-row, pointer in row
  const vMatch = t.match(/^VARCHAR\((\d+)\)$/);
  if (vMatch) return Math.min(Number(vMatch[1], 10) * 4, 16383) || 12; // utf8mb4, max in-row ~16383*4
  if (t === "INT" || t === "INTEGER") return 4;
  if (t === "BIGINT") return 8;
  if (t === "DATETIME" || t === "TIMESTAMP") return 8;
  if (t.startsWith("DECIMAL")) return 8;
  return 16; // conservative for others
}

/**
 * Map SQL Server column type to MariaDB/MySQL-compatible type string for sync API.
 * Output: INT, BIGINT, VARCHAR(n), TEXT, DECIMAL(p,s), DATETIME, etc.
 */
function mapSqlTypeToApi(row) {
  const type = (row.DATA_TYPE || "").toLowerCase();
  const maxLen = row.CHARACTER_MAXIMUM_LENGTH;
  const precision = row.NUMERIC_PRECISION;
  const scale = row.NUMERIC_SCALE;

  switch (type) {
    case "int":
      return "INT";
    case "bigint":
      return "BIGINT";
    case "smallint":
    case "tinyint":
      return "INT";
    case "bit":
      return "INT";
    case "decimal":
    case "numeric":
      return `DECIMAL(${precision || 18},${scale != null ? scale : 0})`;
    case "float":
    case "real":
      return "DECIMAL(18,6)";
    case "varchar":
    case "char":
      if (maxLen === -1) return "TEXT";
      return maxLen != null && maxLen > 0 ? `VARCHAR(${maxLen})` : "VARCHAR(255)";
    case "nvarchar":
    case "nchar":
      if (maxLen === -1) return "TEXT";
      return maxLen != null && maxLen > 0 ? `VARCHAR(${Math.min(maxLen, 4000)})` : "VARCHAR(255)";
    case "text":
    case "ntext":
      return "TEXT";
    case "date":
    case "datetime":
    case "datetime2":
    case "smalldatetime":
      return "DATETIME";
    case "time":
      return "VARCHAR(50)";
    case "uniqueidentifier":
      return "VARCHAR(36)";
    case "binary":
    case "varbinary":
    case "image":
      return "VARCHAR(255)";
    default:
      return "VARCHAR(255)";
  }
}

/**
 * Get primary key column names for a table in the given database.
 * @param {string} dbName
 * @param {string} tableName
 * @returns {Promise<string[]>}
 */
async function getPrimaryKeyColumns(dbName, tableName) {
  const p = await getPool(dbName);
  const r = await p
    .request()
    .input("tableName", sql.NVarChar, tableName)
    .query(`
    SELECT c.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE c
      ON tc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
      AND tc.TABLE_SCHEMA = c.TABLE_SCHEMA
      AND tc.TABLE_NAME = c.TABLE_NAME
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      AND tc.TABLE_NAME = @tableName
    ORDER BY c.ORDINAL_POSITION
  `);
  return r.recordset.map((row) => row.COLUMN_NAME);
}

/**
 * Fetch table config (column definitions) in API shape.
 * @param {string} dbName
 * @param {string} tableName
 * @returns {Promise<{ table_config: Array, unique_keys: string[] }>}
 */
async function getTableConfig(dbName, tableName) {
  const p = await getPool(dbName);
  const cols = await p
    .request()
    .input("tableName", sql.NVarChar, tableName)
    .query(`
    SELECT
      COLUMN_NAME,
      DATA_TYPE,
      CHARACTER_MAXIMUM_LENGTH,
      NUMERIC_PRECISION,
      NUMERIC_SCALE,
      IS_NULLABLE,
      COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = @tableName
    ORDER BY ORDINAL_POSITION
  `);

  const pkColumns = await getPrimaryKeyColumns(dbName, tableName);
  // MariaDB/MySQL: only one PRIMARY KEY; only one AUTO_INCREMENT and it must be that key.
  const firstPkColumn = pkColumns.length > 0 ? pkColumns[0] : null;
  const table_config = cols.recordset.map((row) => {
    const isPk = row.COLUMN_NAME === firstPkColumn;
    const isIdentity = row.IS_IDENTITY === 1;
    return {
      name: row.COLUMN_NAME,
      type: mapSqlTypeToApi(row),
      primaryKey: isPk,
      autoIncrement: isPk && isIdentity,
      nullable: row.IS_NULLABLE === "YES",
    };
  });

  // Avoid ER_TOO_BIG_ROWSIZE: if row size exceeds limit, convert largest VARCHARs to TEXT.
  let total = table_config.reduce((sum, c) => sum + typeByteSize(c.type), 0);
  if (total > MAX_ROW_SIZE) {
    const varcharCols = table_config
      .filter((c) => /^VARCHAR\(\d+\)$/i.test(c.type))
      .map((c) => ({ ...c, size: typeByteSize(c.type) }))
      .sort((a, b) => b.size - a.size);
    for (const col of varcharCols) {
      if (total <= MAX_ROW_SIZE) break;
      const entry = table_config.find((c) => c.name === col.name);
      if (entry && entry.type !== "TEXT") {
        total -= typeByteSize(entry.type);
        entry.type = "TEXT";
        total += typeByteSize("TEXT");
      }
    }
  }

  const unique_keys = pkColumns.length > 0 ? pkColumns : [cols.recordset[0]?.COLUMN_NAME].filter(Boolean);
  if (unique_keys.length === 0) {
    throw new Error("Table has no primary key and no columns; cannot determine unique_keys.");
  }

  return { table_config, unique_keys };
}

/**
 * Fetch all rows from a table as array of plain objects (column name -> value).
 * @param {string} dbName
 * @param {string} tableName
 * @returns {Promise<Object[]>}
 */
async function getTableData(dbName, tableName) {
  const p = await getPool(dbName);
  const escaped = `[${tableName.replace(/\]/g, "]]")}]`;
  const r = await p.request().query(`SELECT * FROM ${escaped}`);
  return r.recordset.map((row) => {
    const obj = {};
    for (const key of Object.keys(row)) {
      let v = row[key];
      if (v == null) obj[key] = null;
      else if (v instanceof Date) obj[key] = v.toISOString().replace("T", " ").slice(0, 19);
      else if (Buffer.isBuffer(v)) obj[key] = v.toString("hex");
      else if (typeof v === "object") obj[key] = String(v);
      else obj[key] = v;
    }
    return obj;
  });
}

/**
 * Close the shared pool if open (e.g. before exit).
 */
async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = {
  getPool,
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  closePool,
};
