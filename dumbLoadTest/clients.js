var program = require('commander')
    , WebSocket = require('ws')
    , debug = require('debug')('wsclient');

program
    .version('0.0.1')
    .option('-c, --clients <clients>', 'Number of clients', Number, 1)
    .option('-s, --server <server>', 'websocket server', 'localhost:4000')
    .parse(process.argv);

const THROTTLE = 50;
var toConnect = 0;
var connected= 0, lastConnected=0;
setTimeout(function connect() {
    var ws = new WebSocket('ws://' + program.server + '/');
    var myid = 0;
    ws.on('open', function(e) {
        connected+=1
        myid = connected;
    });

    ws.on('close', function() {
        debug('close id: %d', myid);
    });

    ws.on('error', function(e) {
        debug('ERROR (%d) %s', myid, e);
    });

    if (++toConnect < program.clients) {
        setTimeout(connect, THROTTLE);
    }
}, THROTTLE);

setInterval(function() {
    if (lastConnected == connected) {
        return;
    }

    debug('connected: %d', connected);
    lastConnected = connected;
}, 100);



