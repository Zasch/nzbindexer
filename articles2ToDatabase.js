require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const cluster = require('cluster');
const msgpack = require("msgpack-lite");
const redis = require('./lib/redis');
const database = require('./lib/database');
const SubjectExtracter = require('./lib/subjectextracter');
let mongoclient;
let redisclient;
let inserter;
// const numCPUs = require('os').cpus().length;
const numCPUs = 10;

if (cluster.isMaster) {
	log.info(`Master ${process.pid} is running`);
	redisclient = redis.connect();
	var previous = 'new';
	var interval = setInterval(() => {
		redisclient.llen('articles', (error, count) => {
			if (count !== previous) {
				previous = count;
				log.debug('queuedepth articles', count);
			}
		});
	}, 10000);
	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
} else if (cluster.isWorker) {
	redisclient = redis.connect();
	database.connect((db) => {
		if (db) {
			mongoclient = db;
			articles = new database.BulkProcessor(mongoclient.collection('articles'), 5000);
			filtered = new database.BulkProcessor(mongoclient.collection('articles_filtered'), 5000);
			return brpoplpush('articles', 'articles.working');
		}
		return;
	});
	log.info(`Worker ${process.pid} started`);
}

function brpoplpush(from, to) {
	redisclient.brpoplpush(from, to, 5, function (error, encoded) {
		if (encoded) {
			let decoded = msgpack.decode(encoded);
			decoded = Object.assign(decoded, new SubjectExtracter(decoded.subject));
			decoded.created = new Date();
			if (!decoded.filter) {
				decoded.key = decoded.filename + '|' + decoded.part.total + '|' + decoded.email + '|' + decoded.application; // for MR
				articles.insert(decoded);
				redisclient.lrem(to, -1, encoded);
				return brpoplpush(from, to);
				// database.insertDocument(collection, decoded, (error, result) => {
				// 	if (error && error.code !== 11000) log.error(error); // hide duplicate key violations
				// 	redisclient.lrem(to, -1, encoded);
				// 	return brpoplpush(from, to);
				// });
			} else {
				// TODO: Where to send the filtered ones?
				// filtered.insert(decoded);
				redisclient.lrem(to, -1, encoded);
				return brpoplpush(from, to);
			}
		} else {
			log.info(`Worker ${process.pid} has no more messages, exiting`);
			articles.flush();
			filtered.flush();
			// mongoclient.close();
			// redisclient.quit();
			// return setTimeout(() => {
			// 	return process.exit(0);
			// }, 5000);
		}
	});
};