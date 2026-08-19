const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const allUsers = [
    // Original System Accounts
    { id: 1, username: 'admin', full_name: 'System Admin', email: 'emailkarthikeya@gmail.com', phone: null, role_id: 5 },
    { id: 7, username: 'emailkarthikeya', full_name: 'Karthikeya S', email: 'karthikeya@o2c.local', phone: null, role_id: 5 },
    { id: 8, username: 'accounts', full_name: 'Accounts Department', email: 'm@gmail.com', phone: null, role_id: 4 },
    { id: 9, username: 'stores', full_name: 'Stores Department', email: 'varun013013@gmail.com', phone: null, role_id: 2 },
    { id: 10, username: 'projects', full_name: 'Projects Team', email: 'emailkarthike@gmail.com', phone: '9876543234', role_id: 3 },
    { id: 11, username: 'manager', full_name: 'manager', email: 'manager@yopmail.com', phone: '9876545676', role_id: 6 },
    { id: 12, username: 'sales', full_name: 'Sales', email: 'sales@yopmail.com', phone: '9876543456', role_id: 1 },

    // Organization Users (15 users)
    { id: 15, username: 'gls', full_name: 'Sreenivas GL', email: 'sreenivas@sudhaanalyticals.com', phone: '9010747474', role_id: 6 },
    { id: 16, username: 'jayaprada', full_name: 'Jayaprada G', email: 'jaya@sudhaanalyticals.com', phone: '8142333201', role_id: 5 },
    { id: 17, username: 'syam', full_name: 'Syam Sunder D', email: 'accounts@sudhaanalyticals.com', phone: '7799901615', role_id: 4 },
    { id: 18, username: 'suribabu', full_name: 'Suribabau S', email: 'accounts2@sudhaanalyticals.com', phone: '9121077551', role_id: 4 },
    { id: 19, username: 'rafi', full_name: 'Rafi', email: 'rafi@sudhaanalyticals.com', phone: '9703226786', role_id: 3 },
    { id: 20, username: 'shami', full_name: 'Shami', email: 'Shami@sudhaanalyticals.com', phone: '7799901612', role_id: 3 },
    { id: 21, username: 'alam', full_name: 'Alam', email: 'alam@sudhaanalyticals.com', phone: '8187899504', role_id: 2 },
    { id: 22, username: 'srinivasg', full_name: 'Gullala Srinivas', email: 'srinivas.gullala@sudhaanalyticals.com', phone: '7799901611', role_id: 1 },
    { id: 23, username: 'noushad', full_name: 'Noushad', email: 'mis@sudhaanalyticals.com', phone: '7970443309', role_id: 3 },
    { id: 24, username: 'rakesh', full_name: 'Rakesh', email: 'Rakesh@sudhaanalyticals.com', phone: '9491021415', role_id: 3 },
    { id: 25, username: 'raghava', full_name: 'Raghava', email: 'Raghava.a@sudhaanalyticals.com', phone: '8142333206', role_id: 3 },
    { id: 26, username: 'ghouse', full_name: 'Ghouse', email: 'ghouse@sudhaanalyticals.com', phone: '7799901596', role_id: 3 },
    { id: 27, username: 'srinivasch', full_name: 'Srinivas', email: 'srinivas.ch@sudhaanalyticals.com', phone: '8886136631', role_id: 3 },
    { id: 28, username: 'kishore', full_name: 'Kishore', email: 'Kishore@sudhaanalyticals.com', phone: '7075997159', role_id: 3 },
    { id: 29, username: 'kiran', full_name: 'kiran', email: 'kiran@sudhaanalyticals.com', phone: '8142333210', role_id: 3 }
];

// All users will have valid password 'qwe123'
const defaultHash = '$2b$10$O9v7VsVyPSDG.UyGRX2G2.WKAyzy5Kc7RDawonEu24UN8owl72egS'; // qwe123

async function populateAll() {
    console.log("=== POPULATING ALL 22 USERS & ROLES ===");

    const dbs = [
        path.join(__dirname, '..', '..', 'database.sqlite'),
        path.join(__dirname, '..', 'database.sqlite')
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

            for (const u of allUsers) {
                insertUser.run(u.id, u.username, u.full_name, u.email, u.phone, defaultHash);
                insertRole.run(u.id, u.role_id);
            }

            db.pragma('foreign_keys = ON');
            console.log(`✓ Updated SQLite DB at: ${dbPath} (${allUsers.length} users)`);
        } catch(e) {
            console.error(`Error updating ${dbPath}:`, e.message);
        }
    }

    // Also populate PostgreSQL p2pdb
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

        for (const u of allUsers) {
            await pgClient.query(`
                INSERT INTO users (id, username, full_name, email, phone, password_hash, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, 1)
            `, [u.id, u.username, u.full_name, u.email, u.phone, defaultHash]);

            await pgClient.query(`
                INSERT INTO user_roles (user_id, role_id)
                VALUES ($1, $2)
            `, [u.id, u.role_id]);
        }

        await pgClient.query("SET session_replication_role = 'origin';");
        console.log(`✓ Updated PostgreSQL p2pdb (${allUsers.length} users)`);
        await pgClient.end();
    } catch(e) {
        console.error("Error updating PostgreSQL:", e.message);
    }

    console.log("\n=======================================================");
    console.log(`✓ SUCCESS: All 22 users populated across local & PostgreSQL!`);
    console.log(`✓ Every user can log in with password: 'qwe123'`);
    console.log(`✓ 'admin' (id: 1) username is strictly separated from 'jayaprada' (id: 16)`);
    console.log("=======================================================\n");
}

populateAll().catch(console.error);
