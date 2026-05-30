const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));
const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='master_addresses';").get();
/* console.log(table ? 'Table exists' : 'Table missing'); */
db.close();
