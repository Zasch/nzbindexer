"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./lib/logger");
const filename = __filename.split(/[\\/]/).pop();
const log = logger_1.logger.child({
    file: filename
});
const config_1 = require("./config");
const timer_1 = require("./lib/timer");
const cluster = require("cluster");
const database = require("./lib/database");
let mongoclient;
let source_collection;
const source = 'files_complete';
cluster.setupMaster({
    exec: 'files1ToReleasesWorker.js',
    silent: false
});
if (cluster.isMaster) {
    process.title = `node ${filename} master`;
    startMaster();
}
function startMaster() {
    log.info('starting');
    const numCPUs = config_1.config.articlestofiles.threads;
    let keys;
    let keyslength;
    let keyspointer = 0;
    database.connect((db) => {
        mongoclient = db;
        source_collection = mongoclient.collection(source);
        getDistinct(source_collection, 'key', (distinctkeys) => {
            timer_1.Timer.start('parallel');
            log.info(`found ${distinctkeys.length} distinct keys`);
            keys = distinctkeys;
            keyslength = keys.length;
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }
            mongoclient.close();
        });
    });
    let exited = 0;
    cluster.on('exit', () => {
        exited++;
        if (exited === numCPUs) {
            return log.info("all workers have exited");
        }
    });
    let workers_done = 0;
    cluster.on('message', (worker, message) => {
        if (message === "send me a message") {
            if (keyspointer < keyslength) {
                const message = keys[keyspointer++];
                return worker.send(message);
            }
            else {
                workers_done++;
                if (workers_done === numCPUs) {
                    log.info(`parallel processing done: ${timer_1.Timer.end('parallel')}`);
                    return cluster.disconnect();
                }
            }
        }
    });
}
function getDistinct(collection, field, callback) {
    collection.distinct(field, (error, result) => {
        return callback(result);
    });
}
//# sourceMappingURL=files1ToReleases.js.map