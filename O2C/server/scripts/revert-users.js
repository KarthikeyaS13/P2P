const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const originalUsers = [
    { id: 1, username: 'admin', full_name: 'System Admin', email: 'emailkarthikeya@gmail.com', phone: null, role_id: 5 },
    { id: 7, username: 'emailkarthikeya', full_name: 'Karthikeya S', email: 'karthikeya@o2c.local', phone: null, role_id: 5 },
    { id: 8, username: 'accounts', full_name: 'Accounts Department', email: 'm@gmail.com', phone: null, role_id: 4 },
    { id: 9, username: 'stores', full_name: 'Stores Department', email: 'varun013013@gmail.com', phone: null, role_id: 2 },
    { id: 10, username: 'projects', full_name: 'Projects Team', email: 'emailkarthike@gmail.com', phone: '9876543234', role_id: 3 },
    { id: 11, username: 'manager', full_name: 'manager', email: 'manager@yopmail.com', phone: '9876545676', role_id: 6 },
    { id: 12, username: 'sales', full_name: 'Sales', email: 'sales@yopmail.com', phone: '9876543456', role_id: 1 }
];

const originalHash = '$2b$10$O9v7VsVyPSDG.UyGRX2G2.WKAyzy5Kc7RDawonEu24UN8owl72egS'; // qwe123

async function revertAll() {
    console.log("=== REVERTING USERS TO ORIGINAL STATE ===");

    const dbs = [
        path.join(__dirname, '..', 'database.sqlite'),
        path.join(__dirname, '..', 'server', 'database.sqlite')
    ];

    for (const dbPath of dbs) {
        try {
            const db = new Database(dbPath);
            db.pragma('foreign_keys = OFF');
            db.prepare('DELETE FROM users').run();
            db.prepare('DELETE FROM user_roles').run();

            const insertUser = db.prepare(`
                INSERT INTO users (id, username, full_name, email, phone, password_hash, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `);
            const insertRole = db.prepare(`
                INSERT INTO user_roles (user_id, role_id)
                VALUES (?, ?)
            `);

            for (const u of originalUsers) {
                insertUser.run(u.id, u.username, u.full_name, u.email, u.phone, originalHash);
                insertRole.run(u.id, u.role_id);
            }

            db.pragma('foreign_keys = ON');
            console.log(`✓ Reverted SQLite DB at: ${dbPath}`);
        } catch(e) {
            console.error(`Error reverting ${dbPath}:`, e.message);
        }
    }

    // Revert PostgreSQL
    try {
        const pgClient = new Client({
            user: process.env.PG_USER || 'p2puser',
            host: process.env.PG_HOST || '168.144.121.252',
            database: process.env.PG_DATABASE || 'p2pdb',
            password: process.env.PG_PASSWORD || 'kalyan013',
            port: parseInt(process.env.PG_PORT || '5432'),
        });
        await pgClient.connect();
        await pgClient.query("SET session_replication_role = 'replica';");
        await pgClient.query('DELETE FROM users;');
        await pgClient.query('DELETE FROM user_roles;');

        for (const u of originalUsers) {
            await pgClient.query(`
                INSERT INTO users (id, username, full_name, email, phone, password_hash, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, 1)
            `, [u.id, u.username, u.full_name, u.email, u.phone, originalHash]);

            await pgClient.query(`
                INSERT INTO user_roles (user_id, role_id)
                VALUES ($1, $2)
            `, [u.id, u.role_id]);
        }

        await pgClient.query("SET session_replication_role = 'origin';");
        console.log("✓ Reverted PostgreSQL p2pdb users & user_roles");
        await pgClient.end();
    } catch(e) {
        console.error("Error reverting PostgreSQL:", e.message);
    }

    console.log("\n=======================================================");
    console.log("✓ REVERT COMPLETE: All 7 original users restored with password 'qwe123'");
    console.log("=======================================================\n");
}

revertAll().catch(console.error);
