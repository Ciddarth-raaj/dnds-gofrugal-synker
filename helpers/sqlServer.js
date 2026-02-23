"use strict";

const sql = require("mssql");
const { getEnvConfig } = require("../config/env");
const devData = require("./devData");

let pool = null;

function isDev() {
  try {
    return getEnvConfig().isDev === true;
  } catch {
    return false;
  }
}

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
 * List all database names on the server.
 * @returns {Promise<string[]>}
 */
async function listDatabases() {
  if (isDev()) return devData.listDatabases();
  const p = await getPool("master");
  const r = await p.request().query(`
    SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name
  `);
  return r.recordset.map((row) => row.name);
}

/**
 * List all table names in a database.
 * @param {string} dbName
 * @returns {Promise<string[]>}
 */
async function listTables(dbName) {
  if (isDev()) return devData.listTables(dbName);
  const p = await getPool(dbName);
  const r = await p.request().query(`
    SELECT TABLE_NAME AS name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  return r.recordset.map((row) => row.name);
}

/**
 * Check if a database exists on the server.
 * @param {string} dbName
 * @returns {Promise<boolean>}
 */
async function databaseExists(dbName) {
  if (isDev()) return devData.databaseExists(dbName);
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
  if (isDev()) return devData.tableExists(dbName, tableName);
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

/**
 * InnoDB compact row format limit (bytes). Error: "Row size too large (> 8126)".
 * Use 8000 to stay under; only TEXT/BLOB are stored off-row and count as ~12 bytes.
 */
const MAX_ROW_SIZE = 8000;

/** Max VARCHAR length kept inline (chars). Larger → TEXT to avoid row overflow. utf8mb4 = 4 bytes/char. */
const MAX_VARCHAR_INLINE = 500;

/**
 * Estimated byte size of a column type in MariaDB InnoDB (utf8mb4 = 4 bytes/char).
 * TEXT/BLOB: stored off-row, only a small prefix in row (~12 bytes).
 */
function typeByteSize(typeStr) {
  if (!typeStr) return 0;
  const t = typeStr.toUpperCase();
  if (t === "TEXT" || t.startsWith("BLOB")) return 12;
  const vMatch = t.match(/^VARCHAR\((\d+)\)$/);
  if (vMatch) return Number(vMatch[1]) * 4;
  if (t === "INT" || t === "INTEGER") return 4;
  if (t === "BIGINT") return 8;
  if (t === "DATETIME" || t === "TIMESTAMP") return 8;
  if (t.startsWith("DECIMAL")) return 8;
  return 16;
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
      if (maxLen === -1 || (maxLen != null && maxLen > MAX_VARCHAR_INLINE)) return "TEXT";
      return maxLen != null && maxLen > 0 ? `VARCHAR(${maxLen})` : "VARCHAR(255)";
    case "nvarchar":
    case "nchar":
      if (maxLen === -1 || (maxLen != null && maxLen > MAX_VARCHAR_INLINE)) return "TEXT";
      return maxLen != null && maxLen > 0 ? `VARCHAR(${Math.min(maxLen, MAX_VARCHAR_INLINE)})` : "VARCHAR(255)";
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
  if (isDev()) return devData.getTableConfig(dbName, tableName);
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
  // Backend creates PRIMARY KEY (unique_keys); primaryKey in table_config is ignored (doc only).
  // Composite unique_keys supported, e.g. ["PR_NO", "SNO"]. AUTO_INCREMENT only on first key column if identity.
  const firstPkColumn = pkColumns.length > 0 ? pkColumns[0] : null;
  const table_config = cols.recordset.map((row) => {
    const inUniqueKeys = pkColumns.includes(row.COLUMN_NAME);
    const isIdentity = row.IS_IDENTITY === 1;
    return {
      name: row.COLUMN_NAME,
      type: mapSqlTypeToApi(row),
      primaryKey: inUniqueKeys,
      autoIncrement: row.COLUMN_NAME === firstPkColumn && isIdentity,
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

  // Backend creates PRIMARY KEY (unique_keys); composite keys e.g. ["PR_NO", "SNO"] supported.
  const unique_keys = pkColumns.length > 0 ? pkColumns : [cols.recordset[0]?.COLUMN_NAME].filter(Boolean);
  if (unique_keys.length === 0) {
    throw new Error("Table has no primary key and no columns; cannot determine unique_keys.");
  }

  return { table_config, unique_keys };
}

/** Safe column name for ORDER BY / WHERE: only allow names from allowed set. */
function safeColumnName(name, allowedSet) {
  if (typeof name !== "string" || !allowedSet || !allowedSet.has(name)) return null;
  return `[${name.replace(/\]/g, "]]")}]`;
}

/** True if value looks like a date string (YYYY-MM-DD or ISO). */
function isDateLikeValue(val) {
  if (val == null) return false;
  return /^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(String(val).trim());
}

/** Bind a filter value with correct type for SQL Server (date vs string). */
function bindFilterValue(request, paramName, value) {
  if (isDateLikeValue(value)) {
    const d = new Date(String(value).trim().replace(" ", "T"));
    return request.input(paramName, sql.Date, isNaN(d.getTime()) ? value : d);
  }
  return request.input(paramName, value);
}

/**
 * Fetch all rows from a table as array of plain objects (column name -> value).
 * @param {string} dbName
 * @param {string} tableName
 * @param {Array<{ column: string, operator: string, value: any }>} [filters] - optional; operator: eq, gt, gte, lt, lte, range
 * @returns {Promise<Object[]>}
 */
async function getTableData(dbName, tableName, filters = []) {
  if (isDev()) return devData.getTableData(dbName, tableName, filters);
  const p = await getPool(dbName);
  const escaped = `[${tableName.replace(/\]/g, "]]")}]`;
  if (!filters || filters.length === 0) {
    const r = await p.request().query(`SELECT * FROM ${escaped}`);
    return r.recordset.map(normalizeRow);
  }
  // For filtered query we don't add TOP here; caller can slice.
  let request = p.request();
  const allowedColumns = new Set((await getTableConfig(dbName, tableName)).table_config.map((c) => c.name));
  const conditions = [];
  let paramIndex = 0;
  for (const f of filters) {
    const col = safeColumnName(f.column, allowedColumns);
    if (!col) continue;
    const op = (f.operator || "eq").toLowerCase();
    if (op === "eq" && f.value != null && f.value !== "") {
      request = bindFilterValue(request, `p${paramIndex}`, f.value);
      conditions.push(`${col} = @p${paramIndex}`);
      paramIndex++;
    } else if (op === "gt" && f.value != null && f.value !== "") {
      request = bindFilterValue(request, `p${paramIndex}`, f.value);
      conditions.push(`${col} > @p${paramIndex}`);
      paramIndex++;
    } else if (op === "gte" && f.value != null && f.value !== "") {
      request = bindFilterValue(request, `p${paramIndex}`, f.value);
      conditions.push(`${col} >= @p${paramIndex}`);
      paramIndex++;
    } else if (op === "lt" && f.value != null && f.value !== "") {
      request = bindFilterValue(request, `p${paramIndex}`, f.value);
      conditions.push(`${col} < @p${paramIndex}`);
      paramIndex++;
    } else if (op === "lte" && f.value != null && f.value !== "") {
      request = bindFilterValue(request, `p${paramIndex}`, f.value);
      conditions.push(`${col} <= @p${paramIndex}`);
      paramIndex++;
    } else if (op === "range" && Array.isArray(f.value) && f.value.length >= 2 && f.value[0] != null && f.value[1] != null) {
      request = bindFilterValue(request, `p${paramIndex}`, f.value[0]);
      request = bindFilterValue(request, `p${paramIndex + 1}`, f.value[1]);
      conditions.push(`${col} >= @p${paramIndex} AND ${col} <= @p${paramIndex + 1}`);
      paramIndex += 2;
    }
  }
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const r = await request.query(`SELECT * FROM ${escaped}${whereClause}`);
  return r.recordset.map(normalizeRow);
}

/**
 * Fetch first N rows from a table (no filters). For preview/UI.
 * @param {string} dbName
 * @param {string} tableName
 * @param {number} [limit=50]
 * @returns {Promise<Object[]>}
 */
async function getTablePreview(dbName, tableName, limit = 50) {
  if (isDev()) {
    const rows = await devData.getTableData(dbName, tableName, []);
    return rows.slice(0, limit);
  }
  const p = await getPool(dbName);
  const escaped = `[${tableName.replace(/\]/g, "]]")}]`;
  const top = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
  const r = await p.request().query(`SELECT TOP ${top} * FROM ${escaped}`);
  return r.recordset.map(normalizeRow);
}

function normalizeRow(row) {
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
}

/**
 * Close the shared pool if open (e.g. before exit).
 */
async function closePool() {
  if (isDev()) return devData.closePool();
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = {
  getPool,
  listDatabases,
  listTables,
  databaseExists,
  tableExists,
  getTableConfig,
  getTableData,
  getTablePreview,
  closePool,
};
