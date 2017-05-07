require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const filename = __filename.split(/[\\/]/).pop();
const cluster = require('cluster');
const RedisQueue = require('./lib/queue');
const Nitpin = require('./lib/nitpin');
const database = require('./lib/database');

const encoder = JSON.stringify;
const decoder = JSON.parse;

let mongoclient;
let collection;
let taskqueue;
let nitpin;

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9999/path');
ws.on('open', function open() {
	// console.log('open');
});

if (cluster.isMaster) {
	process.title = `node ${filename} server(master)`;
	for (let i = 0; i < global.config.articlesdownload.threads; i++) {
		cluster.fork();
	}
	master();
} else if (cluster.isWorker) {
	worker();
}

function getGroup(callback) {
	nitpin.group(global.config.group, (error, group) => {
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
				_id: global.config.group
			}, (error, stats) => {
				log.info({
					stats
				}, 'stats');
				return callback(stats);
			})
		} else throw "Error";
	})
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
	if (total > global.config.total_articles) {
		total = global.config.total_articles;
	}
	log.info('Total articles', total);
	const fulltasks = Math.floor(total / global.config.articles_per_connection);
	const remaining = total % global.config.articles_per_connection;
	for (let i = 0; i < fulltasks; i++) {
		taskqueue.push({
			low: stats.low - ((i + 1) * global.config.articles_per_connection),
			high: stats.low - (i * global.config.articles_per_connection) - 1,
		});
	}
	if (remaining > 0) {
		taskqueue.push({
			low: stats.low - (fulltasks * global.config.articles_per_connection) - remaining,
			high: stats.low - (fulltasks * global.config.articles_per_connection) - 1
		});
	}
	mongoclient.collection('stats').updateOne({
		_id: global.config.group
	}, {
		high: stats.high,
		low: stats.low - total
	}, {
		upsert: true
	}, () => {
		return callback(fulltasks + (remaining > 0 ? 1 : 0));
	});
}

function master() {
	nitpin = new Nitpin(global.config.server);
	taskqueue = new RedisQueue('tasks', true, false);
	getGroup((group) => {
		getStats((stats) => {
			pushBackfillTasks(group, stats, (tasks) => {
				log.info(tasks + ' tasks created');
				mongoclient.close();
			});
		})
	});
	let exited = 0;
	cluster.on('exit', function (worker, code, signal) {
		exited++;
		if (exited === global.config.articlesdownload.threads) {
			log.info("All workers have exited");
			process.exit(0);
		}
	});
	let done = 0;
	cluster.on('message', (worker, cmd) => {
		if (cmd = 'done') {
			done++;
			if (done === global.config.articlesdownload.threads) {
				log.info("All workers are done");
				taskqueue.stop();
				cluster.disconnect();
			}
		}
	});
}

//------------------------------------------------------------------------------------------------------------------------------------------------
// WORKER
//------------------------------------------------------------------------------------------------------------------------------------------------

function map(obj) {
	return {
		key: obj.email,
		value: obj
	};
}

function reduce(array) {
	result = {};
	array.forEach((item) => {
		if (!result[item.key]) {
			result[item.key] = {
				total: 0,
				items: []
			};
		}
		result[item.key].total++;
		result[item.key].items.push(item.value);
	})
	return result;
}

function worker() {
	const worker_id = cluster.worker.id;
	process.title = `node ${filename} server(worker[${worker_id}])`;
	nitpin = new Nitpin(global.config.server);
	taskqueue = new RedisQueue('tasks', true, false);
	timeout = undefined;
	process.on('disconnect', () => {
		taskqueue.stop();
		return setTimeout(() => {
			process.exit(0);
		}, 500);
	});
	taskqueue.on('message', (task, result) => {
		if (timeout) clearTimeout(timeout);
		processTask(task, (error) => {
			if (error) {
				return result.retry(true);
			}
			return result.ok();
		});
	});
	taskqueue.on('drain', () => {
		timeout = setTimeout(() => {
			process.send({
				cmd: 'done'
			});
		}, 200);
	});
	taskqueue.start();
}

function processTask(task, callback) {
	nitpin.over(global.config.group, task.low, task.high, function gotMessages(error, messages) {
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
		} else {
			return callback(true);
		}
	});
}