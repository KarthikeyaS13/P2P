const { Client } = require('pg');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Universal CSV/Excel Importer into PostgreSQL Database (p2pdb)
 * Usage:
 *   node import_csv_to_pg.js <tableName> <path-to-csv-or-excel-file>
 * Example:
 *   node import_csv_to_pg.js users ./users.csv
 *   node import_csv_to_pg.js customers ./customers.csv
 */

async function importCsv() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log("Usage: node import_csv_to_pg.js <tableName> <filePath>");
        console.log("Example: node import_csv_to_pg.js users ./users.csv");
        process.exit(1);
    }

    const tableName = args[0].toLowerCase().trim();
    const filePath = path.resolve(args[1]);

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at ${filePath}`);
        process.exit(1);
    }

    // 1. Read CSV or XLSX file
    console.log(`Reading file: ${filePath}...`);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    if (rawRows.length === 0) {
        console.log("File is empty. No rows to import.");
        return;
    }
    console.log(`Found ${rawRows.length} rows in sheet "${sheetName}".`);

    // 2. Connect to PostgreSQL
    const pgClient = new Client({
        user: process.env.PG_USER || 'p2puser',
        host: process.env.PG_HOST || '168.144.121.252',
        database: process.env.PG_DATABASE || 'p2pdb',
        password: process.env.PG_PASSWORD || 'kalyan013',
        port: parseInt(process.env.PG_PORT || '5432'),
    });

    console.log(`Connecting to PostgreSQL at ${pgClient.host}:${pgClient.port}/${pgClient.database}...`);
    await pgClient.connect();

    // 3. Get target table columns
    const colRes = await pgClient.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    if (colRes.rows.length === 0) {
        console.error(`Error: Table "${tableName}" does not exist in database.`);
        await pgClient.end();
        process.exit(1);
    }

    const dbColumns = colRes.rows.map(c => c.column_name.toLowerCase());
    console.log(`Target table "${tableName}" has columns:`, dbColumns.join(', '));

    // Temporarily relax replica constraints
    await pgClient.query("SET session_replication_role = 'replica';");

    let imported = 0;
    let errors = 0;

    for (const rawRow of rawRows) {
        // Normalize CSV keys (trim and lowercase)
        const rowData = {};
        for (const [key, val] of Object.entries(rawRow)) {
            const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            // If the key matches a db column
            if (dbColumns.includes(cleanKey)) {
                rowData[cleanKey] = val;
            } else if (cleanKey === 'mobile' || cleanKey === 'contact_number' || cleanKey === 'contact_no') {
                if (dbColumns.includes('phone')) rowData['phone'] = val;
            } else if (cleanKey === 'name' && dbColumns.includes('full_name')) {
                rowData['full_name'] = val;
            } else if (cleanKey === 'full_name' && dbColumns.includes('name') && !dbColumns.includes('full_name')) {
                rowData['name'] = val;
            }
        }

        // Special handling for users table
        if (tableName === 'users') {
            if (!rowData.password_hash) {
                const rawPwd = rowData.phone ? `pwd@${rowData.phone}` : 'pwd@1234567890';
                rowData.password_hash = bcrypt.hashSync(String(rawPwd), 10);
            }
            if (rowData.is_active === undefined || rowData.is_active === null) {
                rowData.is_active = 1;
            }
        }

        const colsToInsert = Object.keys(rowData).filter(c => dbColumns.includes(c));
        if (colsToInsert.length === 0) continue;

        const placeholders = colsToInsert.map((_, i) => `$${i+1}`).join(', ');
        const quotedCols = colsToInsert.map(c => `"${c}"`).join(', ');
        const values = colsToInsert.map(c => {
            let v = rowData[c];
            if (v === '' || v === undefined) return null;
            return v;
        });

        const query = `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`;

        try {
            await pgClient.query(query, values);
            imported++;
        } catch(e) {
            errors++;
            if (errors <= 3) {
                console.error(`Error importing row:`, e.message, `\nRow data:`, rowData);
            }
        }
    }

    // Reset sequence
    try {
        await pgClient.query(`SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id)+1 FROM "${tableName}"), 1), false)`);
    } catch(e) {}

    await pgClient.query("SET session_replication_role = 'origin';");

    console.log(`\nImport Summary for "${tableName}":`);
    console.log(`✓ Successfully imported: ${imported} rows`);
    if (errors > 0) {
        console.log(`✗ Errors: ${errors} rows`);
    }

    await pgClient.end();
}

importCsv().catch(console.error);
