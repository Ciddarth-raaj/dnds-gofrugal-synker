import sql from "mssql";

const config = {
    user: "sa",
    password: "YOUR_PASSWORD",
    server: "DN13",          // machine name
    database: "master",      // start from master
    options: {
        instanceName: "GFT",   // named instance
        trustServerCertificate: true,
        encrypt: false
    }
};

async function listDatabasesAndTables() {
    try {
        const pool = await sql.connect(config);

        // 1. Fetch all databases
        const dbResult = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
      ORDER BY name
    `);

        for (const db of dbResult.recordset) {
            const dbName = db.name;
            console.log(`\n📦 Database: ${dbName}`);

            // Switch DB context
            const tableResult = await pool.request().query(`
        USE [${dbName}];
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);

            if (tableResult.recordset.length === 0) {
                console.log("  (no tables)");
                continue;
            }

            for (const table of tableResult.recordset) {
                console.log(`  └─ ${table.TABLE_SCHEMA}.${table.TABLE_NAME}`);
            }
        }

        await pool.close();
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

listDatabasesAndTables();