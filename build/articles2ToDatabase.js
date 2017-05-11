"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./lib/logger");
const filename = __filename.split(/[\\/]/).pop();
const log = logger_1.logger.child({
    file: filename
});
const config_1 = require("./config");
const ws = require("ws");
const cluster = require("cluster");
const decoder = JSON.parse;
var _once_cache = {};
function once(collection, str, fn) {
    if (!_once_cache[collection])
        _once_cache[collection] = {};
    if (!_once_cache[collection][str]) {
        _once_cache[collection][str] = str;
        return fn.apply({}, []);
    }
}
cluster.setupMaster({
    exec: 'articles2ToDatabaseWorker.ts',
    silent: false
});
if (cluster.isMaster) {
    process.title = `node ${filename} server(master)`;
    startMaster();
}
function startMaster() {
    const numWorkerTreads = config_1.config.articlestodatabase.threads;
    const wss = new ws.Server({
        port: 9999
    });
    for (let i = 0; i < numWorkerTreads; i++) {
        cluster.fork();
    }
    let m = 0;
    setInterval(() => {
        once('master', 'messages' + m, () => {
            log.debug('messages', m);
        });
    }, 2000);
    let target = 0;
    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(messages) {
            m++;
            if (target++ === numWorkerTreads) {
                target = 1;
            }
            return cluster.workers[target].send(decoder(messages));
        });
    });
}
//# sourceMappingURL=articles2ToDatabase.js.map