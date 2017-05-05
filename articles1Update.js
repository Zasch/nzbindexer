require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const cluster = require('cluster');

const RedisQueue = require('./lib/queue');
const Nitpin = require('./lib/nitpin');

const config = require('./config');
const database = require('./lib/database');

let mongoclient;
let collection;
let taskqueue;
let articlequeue;
let nitpin;
const numCPUs = 10; // require('os').cpus().length;

if (cluster.isMaster) {
	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
	master();
} else if (cluster.isWorker) {
	worker();
}

function getGroup(callback) {
	nitpin.group(config.group, (error, group) => {
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
				_id: config.group
			}, (error, stats) => {
				log.info({
					stats
				}, 'stats');
				return callback(stats);
			})
		} else throw "Error";
	})
}

function pushUpdateTasks(group, stats, callback) {
	if (!stats) {
		stats = {
			high: group.high - config.total_articles,
			low: group.high - config.total_articles
		};
	}
	let total = (group.high - stats.high);
	if (total > config.total_articles) {
		total = config.total_articles;
	}
	log.info('Total articles', total);
	const fulltasks = Math.floor(total / config.articles_per_connection);
	const remaining = total % config.articles_per_connection;
	for (let i = 0; i < fulltasks; i++) {
		taskqueue.push({
			low: stats.high + (i * config.articles_per_connection) + 1,
			high: stats.high + ((i + 1) * config.articles_per_connection)
		});
	}
	if (remaining > 0) {
		taskqueue.push({
			low: stats.high + (fulltasks * config.articles_per_connection) + 1,
			high: stats.high + (fulltasks * config.articles_per_connection) + remaining
		});
	}
	mongoclient.collection('stats').updateOne({
		_id: config.group
	}, {
		high: stats.high + total,
		low: stats.low
	}, {
		upsert: true
	}, () => {
		return callback(fulltasks + (remaining > 0 ? 1 : 0));
	});
}

function master() {
	nitpin = new Nitpin(config.server);
	taskqueue = new RedisQueue('tasks', true, false);
	articlequeue = new RedisQueue('articles', true, false);
	getGroup((group) => {
		getStats((stats) => {
			pushUpdateTasks(group, stats, (tasks) => {
				log.info(tasks + ' tasks created');
				mongoclient.close();
			});
		})
	});
	const interval = setInterval(() => {
		articlequeue.depth((count) => {
			log.info('queuedepth articles', count);
		});
	}, 5000);
	let done = 0;
	cluster.on('message', (worker, cmd) => {
		if (cmd = 'done') {
			done++;
			if (done === numCPUs) {
				log.info("All workers are done");
				clearInterval(interval);
				taskqueue.stop();
				articlequeue.stop();
				cluster.disconnect();
			}
		}
	});
	let exited = 0;
	cluster.on('exit', function (worker, code, signal) {
		exited++;
		if (exited === numCPUs) {
			log.info("All workers have exited");
			process.exit(0);
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
	// log.info(`Worker ${process.pid} started`);
	nitpin = new Nitpin(config.server);
	articlequeue = new RedisQueue('articles', true, false);
	taskqueue = new RedisQueue('tasks', true, false);
	timeout = undefined;
	taskqueue.on('message', (task, result) => {
		if (timeout) clearTimeout(timeout);
		processTask(task, (error) => {
			if (error) {
				return result.retry(true);
			}
			return result.ok();
		});
	});
	process.on('disconnect', () => {
		articlequeue.stop();
		taskqueue.stop();
		return setTimeout(() => {
			process.exit(0);
		}, 500);
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
	nitpin.over(config.group, task.low, task.high, function gotMessages(error, messages) {
		if (error) {
			log.error({
				task,
				error
			}, 'over:error');
			return callback(true);
		}
		if (messages) {
			articlequeue.push(messages);
			// log.debug(task, 'messages', messages.length);
			return callback(false);
		} else {
			return callback(true);
		}
	});
}