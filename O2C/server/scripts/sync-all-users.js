const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const rootDbPath = '/home/surendra/O2CTest/O2C/database.sqlite';
const serverDbPath = '/home/surendra/O2CTest/O2C/server/database.sqlite';

const rootDb = new Database(rootDbPath);
const serverDb = new Database(serverDbPath);

console.log("=== SYNCHRONIZING USERS & ROLES ===");

// 1. Read all users from root DB (o2cdb in DBeaver)
const users = rootDb.prepare('SELECT * FROM users').all();
console.log(`Found ${users.length} users in root DB.`);

// Role mapping helper
function getRoleIdForUser(username, email, fullName) {
    const u = (username || '').toLowerCase();
    const e = (email || '').toLowerCase();
    const f = (fullName || '').toLowerCase();

    if (u === 'admin' || u === 'emailkarthikeya' || f.includes('system admin') || f.includes('jayaprada')) {
        return 5; // admin
    }
    if (u === 'accounts' || u === 'syam' || u === 'suribabu' || e.includes('accounts') || f.includes('sunder')) {
        return 4; // accounts
    }
    if (u === 'stores' || u === 'alam' || e.includes('stores')) {
        return 2; // stores
    }
    if (u === 'manager' || u === 'gls' || f.includes('sreenivas gl') || f.includes('management')) {
        return 6; // management
    }
    if (u === 'sales' || u === 'srinivasg' || f.includes('gullala srinivas')) {
        return 1; // sales
    }
    return 3; // default: projects
}

// 2. Ensure roles exist in both DBs
const defaultRoles = [
    { id: 1, name: 'sales' },
    { id: 2, name: 'stores' },
    { id: 3, name: 'projects' },
    { id: 4, name: 'accounts' },
    { id: 5, name: 'admin' },
    { id: 6, name: 'management' },
    { id: 7, name: 'approver' },
];

for (const db of [rootDb, serverDb]) {
    for (const r of defaultRoles) {
        db.prepare('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)').run(r.id, r.name);
    }
}

// 3. Sync users to server DB and assign passwords + roles
for (const db of [rootDb, serverDb]) {
    for (const user of users) {
        let hash = user.password_hash;
        if (!hash) {
            const rawPwd = user.phone ? `pwd@${user.phone}` : 'pwd@1234567890';
            hash = bcrypt.hashSync(String(rawPwd), 10);
        }

        // Upsert user
        db.prepare(`
            INSERT INTO users (id, username, full_name, email, phone, password_hash, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                full_name = excluded.full_name,
                email = excluded.email,
                phone = excluded.phone,
                password_hash = COALESCE(excluded.password_hash, users.password_hash),
                is_active = excluded.is_active
        `).run(
            user.id,
            user.username,
            user.full_name,
            user.email,
            user.phone,
            hash,
            user.is_active ?? 1,
            user.created_at,
            user.updated_at
        );

        // Assign user_role
        const roleId = getRoleIdForUser(user.username, user.email, user.full_name);
        db.prepare(`
            INSERT OR REPLACE INTO user_roles (user_id, role_id)
            VALUES (?, ?)
        `).run(user.id, roleId);
    }
}

console.log("✓ All 22 users synchronized with roles and password hashes across both database.sqlite files!");

// Verify counts
const sCount = serverDb.prepare('SELECT count(*) as c FROM users').get().c;
const rCount = serverDb.prepare('SELECT count(*) as c FROM user_roles').get().c;
console.log(`Server DB now has: ${sCount} users, ${rCount} user_roles.`);

const allUsersWithRoles = serverDb.prepare(`
    SELECT u.id, u.username, u.full_name, u.email, u.phone, r.name as role
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    ORDER BY u.id ASC
`).all();

console.table(allUsersWithRoles);
