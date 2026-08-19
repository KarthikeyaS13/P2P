const originalListen = require('net').Server.prototype.listen;
require('net').Server.prototype.listen = function(...args) {
    console.log('[DEBUG] Server listening on', args);
    return originalListen.apply(this, args);
};

const originalExit = process.exit;
process.exit = function(code) {
    console.log('[DEBUG] process.exit called with code:', code);
    console.trace();
    return originalExit.call(this, code);
};

process.on('beforeExit', () => {
    console.log('[DEBUG] beforeExit event emitted, event loop empty');
});

require('./server.js');
