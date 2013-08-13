const
    express = require('express')
    , fs = require('fs')
    , stylus = require('stylus')
    , nib = require('nib')
    , http = require('http')
    , WebSocketServer = require('ws').Server;


var app = express();

app.configure(function() {
    var base = fs.realpathSync(__dirname + "/web")

    // automatically generate css from stylus files
    var stylm = stylus.middleware({
        src       : base + "/src"
        , dest    : base + "/public/generated"
        , force   : true
        , serve   : true
        , compile : function(str, path) {
            return stylus(str)
                .set("filename", path)
                .set("compress", false)
                .use(nib())
                .import('nib')
        }
    });
    app.use(stylm);

    // service static files from multiple places
    app.use(express.static(base + "/public/generated"))
    app.use(express.static(base + "/public/static"))

    app.set("view engine", "jade");
    app.set("views", base + "/views");
});

app.get('/', function(req, res) {
    res.render("index")
});

app.use(function(err, req, res, next) {
    console.log(err);
    next();
});

var server = http.createServer(app);

// websocket functionality
var wss = new WebSocketServer({server:server});
wss.on('connection', function(ws) {
    var onStats = function(stats) {
        ws.send(JSON.stringify(stats));
    }

    server.on('stats', onStats);
    ws.on('close', function() {
        console.log("removing cb");
        server.removeListener("events", onStats);
    });

});

function startup(cb) {
    var port = process.env.PORT || 3000
    server.listen(port, function(err) {
        cb(err, server);
    });

    return server;
}

if (require.main === module) {
    startup(function(err, server) {
        if (err) {
            console.log(err);
            return;
        }
        console.log("App listening on " + server.address().port);

        setInterval(function() {
            server.emit('stats', {n: Date.now()});
        }, 1000);
    });
} else {
    exports.startup = startup;
}
