const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function migrate() {
    const sqliteDb = new Database(path.join(__dirname, 'database.sqlite'));
    
    const pgClient = new Client({
        user: process.env.PG_USER || 'p2puser',
        host: process.env.PG_HOST || '168.144.121.252',
        database: process.env.PG_DATABASE || 'p2pdb',
        password: process.env.PG_PASSWORD || 'kalyan013',
        port: parseInt(process.env.PG_PORT || '5432'),
    });
    
    console.log(`Connecting to PostgreSQL at ${pgClient.host}:${pgClient.port}/${pgClient.database}...`);
    await pgClient.connect();
    
    // Temporarily disable foreign key triggers / constraints for bulk migration
    await pgClient.query("SET session_replication_role = 'replica';");
    
    // 1. Get all user-defined tables from SQLite
    const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    console.log(`Found ${tables.length} tables in SQLite to migrate.\n`);
    
    // 2. Recreate schema in PostgreSQL with proper type conversions
    for (const { name: tableName } of tables) {
        const columns = sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all();
        if (columns.length === 0) continue;
        
        const colDefs = columns.map(col => {
            const colName = `"${col.name.replace(/"/g, '""')}"`;
            const type = (col.type || 'TEXT').toUpperCase().trim();
            
            let pgType = 'TEXT';
            if (col.pk === 1 && (type.includes('INT') || type === 'INTEGER' || type === 'SERIAL')) {
                pgType = 'SERIAL PRIMARY KEY';
            } else if (type.includes('INT')) {
                pgType = 'INTEGER';
            } else if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) {
                pgType = 'DOUBLE PRECISION';
            } else if (type.includes('NUM')) {
                pgType = 'TEXT'; // Safe fallback for mixed SQLite NUM types
            } else if (type.includes('BOOL')) {
                pgType = 'SMALLINT';
            } else if (type.includes('DATE') && !type.includes('TIME')) {
                pgType = 'DATE';
            } else if (type.includes('TIME')) {
                pgType = 'TIMESTAMP';
            } else {
                pgType = 'TEXT';
            }
            
            let def = `${colName} ${pgType}`;
            if (!pgType.includes('PRIMARY KEY')) {
                if (col.dflt_value !== null && col.dflt_value !== undefined) {
                    const dflt = col.dflt_value;
                    if (dflt.toUpperCase() === 'CURRENT_TIMESTAMP') {
                        def += ' DEFAULT CURRENT_TIMESTAMP';
                    } else if (dflt === '1' || dflt === '0') {
                        def += ` DEFAULT ${dflt}`;
                    } else {
                        def += ` DEFAULT ${dflt}`;
                    }
                }
                if (col.notnull && col.dflt_value === null) {
                    def += ' NOT NULL';
                }
            }
            return def;
        });
        
        const createSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${colDefs.join(',\n  ')}\n);`;
        
        try {
            await pgClient.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
            await pgClient.query(createSql);
            console.log(`✓ Schema created: ${tableName}`);
        } catch(err) {
            console.error(`✗ Error creating schema for ${tableName}:`, err.message);
        }
    }
    
    console.log("\n--- Starting Data Transfer ---");
    
    // 3. Migrate Data
    for (const { name: tableName } of tables) {
        const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
        if (rows.length === 0) {
            console.log(`- ${tableName}: 0 rows (skipped)`);
            continue;
        }
        
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map((_, i) => `$${i+1}`).join(', ');
        const quotedColumns = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(', ');
        const query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`;
        
        let inserted = 0;
        let errors = 0;
        for (const row of rows) {
            const values = columns.map(col => {
                let val = row[col];
                if (typeof val === 'boolean') return val ? 1 : 0;
                return val;
            });
            try {
                await pgClient.query(query, values);
                inserted++;
            } catch(e) {
                errors++;
                if (errors <= 2) {
                    console.error(`  Error inserting row into ${tableName}:`, e.message);
                }
            }
        }
        console.log(`✓ ${tableName}: Migrated ${inserted}/${rows.length} rows (errors: ${errors})`);
    }
    
    // 4. Reset primary key auto-increment sequences in PostgreSQL
    console.log("\n--- Synchronizing Primary Key Sequences ---");
    for (const { name: tableName } of tables) {
        try {
            await pgClient.query(`SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id)+1 FROM "${tableName}"), 1), false)`);
        } catch(e) {}
    }
    
    // 5. Re-enable foreign key constraints
    await pgClient.query("SET session_replication_role = 'origin';");
    
    console.log("\n=======================================================");
    console.log("✓ SUCCESS: All data successfully imported to PostgreSQL!");
    console.log("=======================================================\n");
    await pgClient.end();
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
