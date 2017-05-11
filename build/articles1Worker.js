"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./lib/logger");
const filename = __filename.split(/[\\/]/).pop();
const log = logger_1.logger.child({
    file: filename
});
const config_1 = require("./config");
const queue_1 = require("./lib/queue");
const cluster = require("cluster");
const Nitpin = require("./nitpin");
const encoder = JSON.stringify;
let taskqueue;
let nitpin;
let ws;
if (cluster.isWorker) {
    worker();
}
function worker() {
    const worker_id = cluster.worker.id;
    process.title = `node ${filename} server(worker[${worker_id}])`;
    const WebSocket = require('ws');
    ws = new WebSocket('ws://localhost:9999/path');
    // ws.on('open', function open() {
    // 	console.log('open');
    // });
    nitpin = new Nitpin(config_1.config.server);
    taskqueue = new queue_1.RedisQueue('tasks', true, false);
    let timeout = undefined;
    process.on('disconnect', () => {
        taskqueue.stop();
        return setTimeout(() => {
            process.exit(0);
        }, 500);
    });
    taskqueue.on('message', (task, result) => {
        if (timeout)
            clearTimeout(timeout);
        processTask(task, (error) => {
            if (error) {
                return result.retry(true);
            }
            return result.ok();
        });
    });
    taskqueue.on('drain', () => {
        timeout = setTimeout(() => {
            cluster.worker.send({
                cmd: 'done'
            });
        }, 200);
    });
    taskqueue.start();
}
function processTask(task, callback) {
    nitpin.over(config_1.config.group, task.low, task.high, function gotMessages(error, messages) {
        if (error) {
            log.error({
                task,
                error
            }, 'over:error');
            return callback(true);
        }
        if (messages) {
            ws.send(encoder(messages), function ack(error) {
                // If error is not defined, the send has been completed, otherwise the error
                if (error) {
                    log.error(error);
                    return callback(true);
                }
                return callback(false);
            });
        }
        else {
            return callback(true);
        }
    });
}
// function map(obj) {
// 	return {
// 		key: obj.email,
// 		value: obj
// 	};
// }
// function reduce(array) {
// 	result = {};
// 	array.forEach((item) => {
// 		if (!result[item.key]) {
// 			result[item.key] = {
// 				total: 0,
// 				items: []
// 			};
// 		}
// 		result[item.key].total++;
// 		result[item.key].items.push(item.value);
// 	})
// 	return result;
// }
//# sourceMappingURL=articles1Worker.js.map