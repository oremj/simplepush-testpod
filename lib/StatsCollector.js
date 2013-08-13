var _ = require('underscore'),
    moment = require('moment');

function Stats() {
    this.sent = 0;
    this.received = 0;
    this.outstandingPings = {};
    this.responseTimes = [];

    // how long the websocket was connected for before it was killed
    this.connTimes = {
        'count'  : 0,
        't5s'    : 0,
        't30s'   : 0,
        't60s'   : 0,
        't300s'  : 0,
        't600s'  : 0,
        't1800s' : 0,
        'tXs'    : 0      // > 30m
    };

    this.pingTimes = {
        'count'    : 0,
        't50ms'    : 0,
        't100ms'   : 0,
        't500ms'   : 0,
        't1500ms'  : 0,
        't5000ms'  : 0,
        't10000ms' : 0,
        'tXms'     : 0   // > 10 seconds, it's Christmas!
    };

}

Stats.prototype.makeKey = function(channelID, version) {
    return channelID + version.toString();
};

Stats.prototype.addOutstanding = function(channelID, version) {
    this.sent++;
    this.outstandingPings[this.makeKey(channelID, version)] = moment();
};

Stats.prototype.pingKeys = [50, 100, 500, 1500, 5000, 10000];
Stats.prototype.clearPing = function(channelID, version) {
    this.received++;
    var key = this.makeKey(channelID, version);
    var start = this.outstandingPings[key];
    delete this.outstandingPings[key];
    var t = moment().diff(start);
    this.responseTimes.push(t);

    this.pingTimes.count += 1;
    var checkTime;
    var counted = false;
    for (var i=0; i < this.pingKeys.length; i++) {
        checkTime = this.pingKeys[i];
        if (t <= checkTime) {
            this.pingTimes["t"+checkTime + "ms"] += 1;
            counted = true;
            break;
        }
    }

    if (counted === false) {
        this.pingTimes['X'] += 1;
    }
};

function StatsCollector() {
    this.stats = new Stats();
}

StatsCollector.prototype.connTimes = function() { 
    return this.stats.connTimes;
};

StatsCollector.prototype.pingTimes = function() { 
    return this.stats.pingTimes;
};

StatsCollector.prototype.received = function() {
    return this.stats.received;
};

StatsCollector.prototype.sent = function() {
    return this.stats.sent;
};

StatsCollector.prototype.pingSent = function(channelID, version) {
    this.stats.addOutstanding(channelID, version);
};

StatsCollector.prototype.pingReceived = function(channelID, version) {
    this.stats.clearPing(channelID, version);
};

StatsCollector.prototype.medianRespTime = function() {
    var responseTimes = this.stats.responseTimes;
    if(_.isEmpty(responseTimes)) return;

    responseTimes.sort(function(a, b) {return a - b;});
    var medIdx = Math.floor(_.size(responseTimes) / 2);

    return responseTimes[medIdx];
};

StatsCollector.prototype.avgRespTime = function() {
    var responseTimes = this.stats.responseTimes;
    if(_.isEmpty(responseTimes)) return;
    return _.reduce(responseTimes, function(m, n) { return n + m; }, 0) / _.size(responseTimes);
};


module.exports = StatsCollector;