require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const cluster = require('cluster');
const msgpack = require("msgpack-lite");

const config = require('./config');
const redis = require('./lib/redis');
const database = require('./lib/database');
const Nitpin = require('./lib/nitpin');

let mongoclient;
let collection;
let redisclient;
let nitpin;

if (cluster.isMaster) {
	const numCPUs = 10; // require('os').cpus().length;
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

function getBackfillTasks(group, stats) {
	if (!stats) {
		throw "Stats Missing";
	}
	let total = (stats.low - group.low);
	if (total < 0) {
		log.warn('backfill complete');
		return 0;
	}
	if (total > config.total_articles) {
		total = config.total_articles;
	}
	log.info('Total articles', total);
	const fulltasks = Math.floor(total / config.articles_per_connection);
	const remaining = total % config.articles_per_connection;
	for (let i = 0; i < fulltasks; i++) {
		redisclient.lpush('tasks', JSON.stringify({
			low: stats.low - ((i + 1) * config.articles_per_connection),
			high: stats.low - (i * config.articles_per_connection) - 1,
		}));
	}
	if (remaining > 0) {
		redisclient.lpush('tasks', JSON.stringify({
			low: stats.low - (fulltasks * config.articles_per_connection) - remaining,
			high: stats.low - (fulltasks * config.articles_per_connection) - 1
		}));
	}
	mongoclient.collection('stats').updateOne({
		_id: config.group
	}, {
		high: stats.high,
		low: stats.low - total
	}, {
		upsert: true
	});
	return fulltasks + (remaining > 0 ? 1 : 0);
}

function master() {
	log.info(`Master ${process.pid} is running`);
	redisclient = redis.connect();
	nitpin = new Nitpin(config.server);
	getGroup((group) => {
		getStats((stats) => {
			const tasks = getBackfillTasks(group, stats);
			log.info(tasks + ' tasks created');
		})
	})
	var previous = 0;
	setInterval(() => {
		redisclient.llen('articles', (error, count) => {
			if (count !== previous) {
				previous = count;
				log.info('queuedepth articles', count);
			}
		});
	}, 10000);
}

//------------------------------------------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------------------------------------------

function worker() {
	log.info(`Worker ${process.pid} started`);
	redisclient = redis.connect();
	nitpin = new Nitpin(config.server);
	return brpoplpush('tasks', 'tasks.working');
}

function brpoplpush(from, to) {
	redisclient.brpoplpush(from, to, 5, function (error, encoded) {
		if (encoded) {
			let decoded = JSON.parse(encoded);
			// console.log('worker', process.pid, decoded);
			processTask(decoded, (error) => {
				if (error) {
					redisclient.rpush(from, encoded);
				}
				redisclient.lrem(to, -1, encoded);
				return brpoplpush(from, to);
			});
		} else {
			// log.info(`Worker ${process.pid} has no more messages, exiting`);
			return brpoplpush(from, to);
			// redisclient.quit();
			// return setTimeout(() => {
			// 	return process.exit(0);
			// }, 5000);
		}
	});
};

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
				redisclient.lpush('articles', msgpack.encode(message));
			});
			log.info(task, 'messages', messages.length);
			return callback(false);
		} else {
			return callback(true);
		}
	});
}