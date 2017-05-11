"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./lib/logger");
const filename = __filename.split(/[\\/]/).pop();
const log = logger_1.logger.child({
    file: filename
});
const config_1 = require("./config");
const queue_1 = require("./lib/queue");
const timer_1 = require("./lib/timer");
const cluster = require("cluster");
const Nitpin = require("./nitpin");
const database = require("./lib/database");
let mongoclient;
let taskqueue;
let nitpin;
cluster.setupMaster({
    exec: 'articles1Worker.ts',
    silent: false
});
if (cluster.isMaster) {
    process.title = `node ${filename} server(master)`;
    for (let i = 0; i < config_1.config.articlesdownload.threads; i++) {
        cluster.fork();
    }
    master();
}
function getGroup(callback) {
    nitpin.group(config_1.config.group, (error, group) => {
        log.info({
            group
        }, 'group');
        return callback(group);
    });
}
function getStats(callback) {
    database.connect((db) => {
        if (db) {
            mongoclient = db;
            mongoclient.collection('stats').findOne({
                _id: config_1.config.group
            }, (error, stats) => {
                log.info({
                    stats
                }, 'stats');
                return callback(stats);
            });
        }
        else
            throw "Error";
    });
}
function pushBackfillTasks(group, stats, callback) {
    if (!stats) {
        throw "Stats Missing";
    }
    let total = (stats.low - group.low);
    if (total < 0) {
        log.warn('backfill complete');
        return 0;
    }
    if (total > config_1.config.total_articles) {
        total = config_1.config.total_articles;
    }
    log.info('Total articles', total);
    const fulltasks = Math.floor(total / config_1.config.articles_per_connection);
    const remaining = total % config_1.config.articles_per_connection;
    for (let i = 0; i < fulltasks; i++) {
        const task = {
            low: stats.low - ((i + 1) * config_1.config.articles_per_connection),
            high: stats.low - (i * config_1.config.articles_per_connection) - 1,
        };
        // console.log(task);
        taskqueue.push(task);
    }
    if (remaining > 0) {
        const task = {
            low: stats.low - (fulltasks * config_1.config.articles_per_connection) - remaining,
            high: stats.low - (fulltasks * config_1.config.articles_per_connection) - 1
        };
        // console.log(task);
        taskqueue.push(task);
    }
    const dbvalue = {
        low: stats.low - total,
        high: stats.high
    };
    // console.log('db', dbvalue);
    mongoclient.collection('stats').updateOne({
        _id: config_1.config.group
    }, dbvalue, {
        upsert: true
    }, () => {
        return callback(fulltasks + (remaining > 0 ? 1 : 0));
    });
}
function master() {
    nitpin = new Nitpin(config_1.config.server);
    taskqueue = new queue_1.RedisQueue('tasks', true, false);
    timer_1.Timer.start('process');
    getGroup((group) => {
        getStats((stats) => {
            pushBackfillTasks(group, stats, (tasks) => {
                log.info(tasks + ' tasks created');
                mongoclient.close();
            });
        });
    });
    let exited = 0;
    cluster.on('exit', function (worker, code, signal) {
        exited++;
        if (exited === config_1.config.articlesdownload.threads) {
            log.info(`All workers have exited: ${timer_1.Timer.end('process')}`);
            process.exit(0);
        }
    });
    let done = 0;
    cluster.on('message', (worker, cmd) => {
        if (cmd = 'done') {
            done++;
            if (done === config_1.config.articlesdownload.threads) {
                log.info("All workers are done");
                taskqueue.stop();
                cluster.disconnect();
            }
        }
    });
}
//# sourceMappingURL=articles1Backfill.js.map