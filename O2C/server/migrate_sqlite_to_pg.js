const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

async function migrate() {
    const sqliteDb = new Database(path.join(__dirname, 'database.sqlite'));
    
    const pgClient = new Client({
        user: 'p2puser',
        host: '168.144.121.252',
        database: 'p2pdb',
        password: 'kalyan013',
        port: 5432,
    });
    
    console.log("Connecting to PostgreSQL...");
    await pgClient.connect();
    
    // Temporarily disable foreign key constraints for bulk insert
    await pgClient.query("SET session_replication_role = 'replica';");
    
    // 1. Get exact current schema from live SQLite database
    console.log("Reading live schema from SQLite...");
    const tables = sqliteDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    
    for (const table of tables) {
        if (!table.sql) continue;
        
        let tableSql = table.sql;
        // Convert SQLite types to Postgres types
        tableSql = tableSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
        tableSql = tableSql.replace(/DATETIME/gi, 'TIMESTAMP');
        tableSql = tableSql.replace(/BOOLEAN DEFAULT 1/gi, 'SMALLINT DEFAULT 1');
        tableSql = tableSql.replace(/BOOLEAN DEFAULT 0/gi, 'SMALLINT DEFAULT 0');
        tableSql = tableSql.replace(/BOOLEAN/gi, 'SMALLINT');
        
        // Strip out FOREIGN KEY constraints to avoid creation order issues
        tableSql = tableSql.replace(/,?\s*FOREIGN KEY\s*\([^)]+\)\s*REFERENCES\s+[a-zA-Z0-9_]+\s*\([^)]+\)/gi, '');
        
        // Ensure table name is properly formatted
        tableSql = tableSql.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?([a-zA-Z0-9_]+)/i, 'CREATE TABLE IF NOT EXISTS "$2"');
        
        try {
            await pgClient.query(`DROP TABLE IF EXISTS "${table.name}" CASCADE;`);
            await pgClient.query(tableSql);
        } catch(err) {
            console.error(`Error creating table ${table.name}:`, err.message);
        }
    }
    
    // 2. Migrate Data
    for (const table of tables) {
        const tableName = table.name;
        const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
        console.log(`Migrating table ${tableName}... (${rows.length} rows)`);
        
        if (rows.length === 0) continue;
        
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map((_, i) => `$${i+1}`).join(', ');
        // Properly quote table and column names to prevent syntax errors with reserved words
        const quotedColumns = columns.map(col => `"${col}"`).join(', ');
        const query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`;
        
        for (const row of rows) {
            const values = columns.map(col => row[col]);
            try {
                await pgClient.query(query, values);
            } catch(e) {
                console.error(`Error inserting into ${tableName}:`, e.message);
            }
        }
    }
    
    // 3. Reset sequences
    for (const table of tables) {
        const tableName = table.name;
        try {
            await pgClient.query(`SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id)+1 FROM "${tableName}"), 1), false)`);
        } catch(e) {}
    }
    
    // Re-enable foreign key constraints
    await pgClient.query("SET session_replication_role = 'origin';");
    
    console.log("Migration to PostgreSQL completed successfully!");
    await pgClient.end();
}

migrate().catch(console.error);
