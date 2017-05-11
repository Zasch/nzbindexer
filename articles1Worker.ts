import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { config } from './config';
import { RedisQueue } from './lib/queue';
import * as cluster from 'cluster';
import * as Nitpin from './nitpin';
const encoder = JSON.stringify;
let taskqueue: RedisQueue;
let nitpin: any;
let ws: any;

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
	nitpin = new Nitpin(config.server);
	taskqueue = new RedisQueue('tasks', true, false);
	let timeout: any = undefined;
	process.on('disconnect', () => {
		taskqueue.stop();
		return setTimeout(() => {
			process.exit(0);
		}, 500);
	});
	taskqueue.on('message', (task: any, result: RedisQueue) => {
		if (timeout) clearTimeout(timeout);
		processTask(task, (error: any) => {
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

function processTask(task: any, callback: Function) {
	nitpin.over(config.group, task.low, task.high, function gotMessages(error: any, messages: Array<any>) {
		if (error) {
			log.error({
				task,
				error
			}, 'over:error');
			return callback(true);
		}
		if (messages) {
			ws.send(encoder(messages), function ack(error: any) {
				// If error is not defined, the send has been completed, otherwise the error
				if (error) {
					log.error(error);
					return callback(true);
				}
				return callback(false);
			});
		} else {
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
