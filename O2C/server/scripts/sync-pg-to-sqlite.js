const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Synchronizes all tables & data from PostgreSQL (p2pdb) into the local SQLite database.
 * Run this on the server (or locally):
 *   node scripts/sync-pg-to-sqlite.js
 */
async function syncFromPgToSqlite() {
    const sqlitePath = path.join(__dirname, '..', 'database.sqlite');
    const sqliteDb = new Database(sqlitePath);

    const pgClient = new Client({
        user: process.env.PG_USER || 'p2puser',
        host: process.env.PG_HOST || '168.144.121.252',
        database: process.env.PG_DATABASE || 'p2pdb',
        password: process.env.PG_PASSWORD || 'kalyan013',
        port: parseInt(process.env.PG_PORT || '5432'),
    });

    console.log(`Connecting to PostgreSQL (${pgClient.host}:${pgClient.port}/${pgClient.database})...`);
    await pgClient.connect();

    // Disable SQLite foreign keys during bulk sync
    sqliteDb.pragma('foreign_keys = OFF');

    // Get all public tables in PostgreSQL
    const res = await pgClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    `);

    const tables = res.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables in PostgreSQL.`);

    for (const tableName of tables) {
        try {
            // Check if table exists in SQLite
            const tableExists = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
            if (!tableExists) {
                console.log(`- Skipping ${tableName} (not defined in SQLite schema)`);
                continue;
            }

            const pgData = await pgClient.query(`SELECT * FROM "${tableName}"`);
            if (pgData.rows.length === 0) {
                continue;
            }

            const columns = Object.keys(pgData.rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const quotedColumns = columns.map(c => `"${c}"`).join(', ');

            // Clear existing table data in SQLite
            sqliteDb.prepare(`DELETE FROM "${tableName}"`).run();

            const insertStmt = sqliteDb.prepare(`INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`);
            const insertMany = sqliteDb.transaction((rows) => {
                for (const row of rows) {
                    const values = columns.map(c => {
                        let v = row[c];
                        if (v instanceof Date) {
                            return v.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
                        }
                        if (typeof v === 'boolean') {
                            return v ? 1 : 0;
                        }
                        return v;
                    });
                    insertStmt.run(...values);
                }
            });

            insertMany(pgData.rows);
            console.log(`✓ ${tableName}: Synced ${pgData.rows.length} rows`);
        } catch (err) {
            console.error(`✗ Error syncing ${tableName}:`, err.message);
        }
    }

    sqliteDb.pragma('foreign_keys = ON');
    console.log("\n=======================================================");
    console.log("✓ SUCCESS: All PostgreSQL data synced to SQLite database!");
    console.log("=======================================================\n");

    await pgClient.end();
}

syncFromPgToSqlite().catch(console.error);
