require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const cluster = require('cluster');
const msgpack = require("msgpack-lite");
const database = require('./lib/database');
const SubjectExtracter = require('./lib/subjectextracter');
const RedisQueue = require('./lib/queue');

let mongoclient;
let inserter;
let articlequeue;
let articlescollection;
// let filteredcollection;

// const numCPUs = require('os').cpus().length;
const numCPUs = 9;

if (cluster.isMaster) {
	log.info(`Master ${process.pid} is running`);
	articlequeue = new RedisQueue('articles', true, true);
	var previous = 'new';
	const interval = setInterval(() => {
		articlequeue.depth((count) => {
			log.info('queuedepth articles', count);
		})
	}, 10000);
	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
} else if (cluster.isWorker) {
	log.debug(`Worker ${process.pid} started`);
	database.connect((db) => {
		if (db) {
			mongoclient = db;
			startWorker();
		}
		return;
	});
}

function startWorker() {
	articlequeue = new RedisQueue('articles', true, true);
	articlescollection = new database.BulkProcessor(mongoclient.collection('articles'), 5000);
	// filteredcollection = new database.BulkProcessor(mongoclient.collection('articles_filtered'), 5000);
	articlequeue.on('message', (article, result) => {
		processMessage(article, () => {
			return result.ok();
		});
	});
	articlequeue.on('drain', () => {
		articlescollection.flush();
		// filteredcollection.flush();
		articlequeue.stop();
		return mongoclient.close();
	})
	articlequeue.start();
}

function processMessage(message, callback) {
	const article = Object.assign(message, new SubjectExtracter(message.subject));
	article.created = new Date();
	if (!article.filter) {
		article.key = article.filename + '|' + article.part.total + '|' + article.email; // for MR
		articlescollection.insert(article);
	} else {
		// TODO: Where to send the filtered ones?
		// filteredcollection.insert(article);
	}
	return callback();
}