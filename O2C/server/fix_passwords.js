const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

const password = 'qwe123';
const hash = bcrypt.hashSync(password, 10);

/* console.log(`Updating all users to have password: ${password}`); */
/* console.log(`Hash: ${hash}`); */

const result = db.prepare('UPDATE users SET password_hash = ?').run(hash);
/* console.log(`Updated ${result.changes} users.`); */

db.close();
/* console.log('Done.'); */
