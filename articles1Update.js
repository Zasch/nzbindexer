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

function getTasks(group, stats) {
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
	});
	return fulltasks + (remaining > 0 ? 1 : 0);
}

function master() {
	log.info(`Master ${process.pid} is running`);
	nitpin = new Nitpin(config.server);
	taskqueue = new RedisQueue('tasks', true, true);
	articlequeue = new RedisQueue('articles', true, true);
	getGroup((group) => {
		getStats((stats) => {
			const tasks = getTasks(group, stats);
			log.info(tasks + ' tasks created');
		})
	});
	var previous = 0;
	const interval = setInterval(() => {
		articlequeue.depth((count) => {
			log.info('queuedepth articles', count);
		});
	}, 5000);
	let disconnected = 0;
	cluster.on('disconnect', (worker) => {
		disconnected++;
		if (disconnected === numCPUs) {
			clearInterval(interval);
			mongoclient.close();
			articlequeue.stop();
			taskqueue.stop();
			log.info("All workers have finished");
			setTimeout(() => {
				log.info(`Master ${process.pid} stopped`);
				cluster.disconnect();
				process.exit(0);
			}, 5000);
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
	log.info(`Worker ${process.pid} started`);
	nitpin = new Nitpin(config.server);
	articlequeue = new RedisQueue('articles', true, true);
	taskqueue = new RedisQueue('tasks', true, true);
	taskqueue.on('message', (task, result) => {
		processTask(task, (error) => {
			if (error) {
				return result.retry(true);
			}
			return result.ok();
		});
	});
	taskqueue.on('drain', () => {
		log.debug(`Worker ${process.pid} stopped`);
		// taskqueue.stop();
		// articlequeue.stop();
		// setTimeout(() => {
		// 	log.debug(`Worker ${process.pid} stopped`);
		// 	process.exit(0);
		// }, 2000);
	});
	taskqueue.start();
}

function processTask(task, callback) {
	// console.log('process', task);
	nitpin.over(config.group, task.low, task.high, function gotMessages(error, messages) {
		if (error) {
			log.error({
				task,
				error
			}, 'over:error');
			return callback(true);
		}
		if (messages) {
			messages.forEach((message) => {
				articlequeue.push(message);
			});
			log.debug(task, 'messages', messages.length);
			return callback(false);
		} else {
			return callback(true);
		}
	});
}