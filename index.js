const UPDATE_TIMEOUT = 15000; // 15 seconds
var program = require('commander'),
    TestController = require('./lib/TestController'),
    Client = require('./lib/Client'),
    EndPoint = require('./lib/EndPoint')
    debug = require('debug'),
    uuid = require('node-uuid'),
    moment = require('moment'),
    webserver = require('./webserver') ;

program
    .version('0.0.1a')
    .option('-s, --pushgoserver <server>', 'Push go server url, e.g., pushserver.test.com', 'push.services.mozilla.com')
    .option('-c, --clients <clients>', 'Number of client connections', Number, 1)
    .option('-C, --channels <channels>', 'Number of channels per client', Number, 1)
    .option('-m, --minpingtime <minpingtime>', 'Minimum milliseconds between pings', Number, 500)
    .option('-M, --maxpingtime <minpingtime>', 'Maximum milliseconds between pings', Number, 1000)
    .option('-p, --pingsperchannel <pingsperchannel>', 'How many pings to send per channel 0 means infinite', Number, 0)
    .option('-S, --ssl', "Use https")
    .parse(process.argv);

var testy = debug('testy');
var deep = debug('deep')

var startTime = moment();

/** 
 * This dirty little blob just gets updated
 * as the test runs and sent to the UI via websockets...
 */
var stats = {
    // this should match web/public/static/js/model/Stats.js to make 
    // easier to send data to the backbone Model
    test_seconds: 0

    // Connection Stats
    , conn_current   : 0
    , conn_attempted : 0
    , conn_ok        : 0
    , conn_fail      : 0

    // Connection Times
    , c_count  : 0 
    , c_t5s    : 0 
    , c_t30s   : 0 
    , c_t60s   : 0 
    , c_t300s  : 0 
    , c_t600s  : 0 
    , c_t1800s : 0 
    , c_tXs    : 0 

    // Update Stats
    , put_sent           : 0
    , put_failed         : 0
    , update_outstanding : 0
    , update_received    : 0
    , update_timeout     : 0
    , update_invalid     : 0
    , update_net_error   : 0
    , update_err_empty   : 0 // special, server sent an empty notify packet

    // update timing latency (PushServer -> WS -> Client)
    , u_count    : 0
    , u_t50ms    : 0
    , u_t100ms   : 0
    , u_t500ms   : 0
    , u_t1500ms  : 0
    , u_t5000ms  : 0
    , u_t10000ms : 0
    , u_tXms     : 0
};

var updateTimes = [50, 100, 500, 1500, 5000, 10000];
function resultHandler(result) {
    deep("*** RESULT: (%dms) %s | %s ***", 
        result.time, result.status, result.endpoint.channelID
    )

    switch (result.status) {
        case 'PUT_OK':
            stats.put_sent += 1;
            stats.update_outstanding += 1;

            testy("PUT #%d OK %s | %s", 
                    result.data.id, 
                    result.channelID, 
                    result.data.body
            );
            break;

        case 'PUT_FAIL': // the server returned a non 200
            stats.put_sent += 1;
            stats.put_failed += 1;

            testy("PUT %d FAIL %s. HTTP %s %s, waiting 3s to send again", 
                    result.data.id, 
                    result.channelID,
                    result.data.code,
                    result.data.body
                );
            setTimeout(result.endpoint.sendNextVersion.bind(result.endpoint, UPDATE_TIMEOUT), 3000);
            break;

        case 'GOT_VERSION_OK':
            stats.update_outstanding -= 1;
            stats.update_received += 1;

            var checkTime;
            var counted = false;
            stats.u_count += 1;

            for (var i=0; i < updateTimes.length; i++) {
                checkTime = updateTimes[i];
                if (result.data <= checkTime) {
                    stats["u_t"+checkTime + "ms"] += 1;
                    counted = true;
                    break;
                }
            }

            if (counted === false) {
                stats.u_tXms += 1;
            }

            testy("\\o/. ws lag: %dms, waiting 3s to send again", result.data);
            setTimeout(result.endpoint.sendNextVersion.bind(result.endpoint, UPDATE_TIMEOUT) , 3000);
            break;

        case 'ERR_VER_INVALID':
            stats.update_outstanding -= 1;
            stats.update_failed += 1;
            testy("ERROR: Unexpected Version. Got %d, expected: %d", 
                    result.data.got, 
                    result.data.expected
                );

            break;

        case 'TIMEOUT':
            stats.update_outstanding -= 1;
            stats.update_timeout += 1;
            stats.u_tXms += 1;

            testy('TIMEOUT, expired: %dms, waiting 3s to send again', result.data);
            setTimeout(result.endpoint.sendNextVersion.bind(result.endpoint, UPDATE_TIMEOUT), 3000);
            break;

        case 'ERR_NETWORK': // network issues?
            stats.update_net_error += 1;
            break;
    }
}


function handleClientOpen() {
    stats.conn_current += 1;
    stats.conn_ok += 1;
}

function handleClientClose() {
    stats.conn_current -= 1;
    stats.conn_fail += 1;
}

function handleClientEmptyNotify() {
    stats.update_err_empty += 1;
}

for (var i =0; i < program.clients; i++) {

    (function(i) {
        testy("Creating client: %d", i);

        var c = new Client(program.pushgoserver);
        for(var j = 0; j < program.channels; j++) {
            c.registerChannel(uuid.v1());
        }

        var endPointCount = 0;
        c.on('pushendpoint', function(endpointUrl, channelID) {
            testy("Created channel: %s", channelID);
            var e = new EndPoint(c, endpointUrl, channelID, ++endPointCount);
            var serverAckTime = 0;
            e.on('result', resultHandler);
            e.sendNextVersion()
        });

        c.once('open', handleClientOpen);
        c.once('close', handleClientClose);
        c.on('err_notification_empty', handleClientEmptyNotify);

        stats.conn_attempted += 1;
        c.start()
    })(i);
}

webserver.startup(function(err, server) {
    debug('webserver')("Webserver listening on " + server.address().port);

    setInterval(function() {
        stats.test_seconds = Math.floor(moment().diff(startTime)/1000);
        server.emit('stats', stats);
    }, 1000);
});
