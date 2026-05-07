const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../server/database.sqlite'));
try {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='dc_requests'").get();
    console.log(schema ? schema.sql : 'Table dc_requests does not exist');
} catch(err) {
    console.error(err);
}
