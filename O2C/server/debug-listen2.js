const originalListen = require('net').Server.prototype.listen;
require('net').Server.prototype.listen = function(...args) {
    console.log('[DEBUG] Server listening on', args);
    const res = originalListen.apply(this, args);
    const originalUnref = res.unref;
    res.unref = function() {
        console.log('[DEBUG] Server.unref called');
        console.trace();
        if (originalUnref) return originalUnref.apply(this, arguments);
    };
    const originalClose = res.close;
    res.close = function() {
        console.log('[DEBUG] Server.close called');
        console.trace();
        if (originalClose) return originalClose.apply(this, arguments);
    };
    return res;
};

require('./server.js');
