require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const cluster = require('cluster');
const database = require('./lib/database');
const SubjectExtracter = require('./lib/subjectextracter');
const RedisQueue = require('./lib/queue');

let mongoclient;
let inserter;
let articlequeue;
let articlescollection;

// const numCPUs = require('os').cpus().length;
const numCPUs = 9;

if (cluster.isMaster) {
	log.info(`Master ${process.pid} is running`);
	articlequeue = new RedisQueue('articles', true, false);
	var previous = 'new';
	const interval = setInterval(() => {
		articlequeue.depth((count) => {
			log.info('queuedepth articles', count);
		})
	}, 10000);
	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
	let done = 0;
	cluster.on('message', (worker, cmd) => {
		if (cmd = 'done') {
			done++;
			if (done === numCPUs) {
				log.info("All workers are done");
				clearInterval(interval);
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
} else if (cluster.isWorker) {
	// log.debug(`Worker ${process.pid} started`);
	database.connect((db) => {
		if (db) {
			mongoclient = db;
			startWorker();
		}
		return;
	});
}

function startWorker() {
	articlequeue = new RedisQueue('articles', true, false);
	articlescollection = new database.BulkProcessor(mongoclient.collection('articles'), 5000);
	filteredcollection = new database.BulkProcessor(mongoclient.collection('articles_filtered'), 5000);
	timeout = undefined;
	articlequeue.on('message', (articles, result) => {
		if (timeout) clearTimeout(timeout);
		articles.forEach(function (article) {
			processMessage(article, () => {});
		});
		return result.ok();
	});
	process.on('disconnect', () => {
		filteredcollection.flush();
		articlequeue.stop();
		articlescollection.flush(()=>{
			mongoclient.close();
		});
	});
	articlequeue.on('drain', () => {
		timeout = setTimeout(() => {
			process.send({
				cmd: 'done'
			});
		}, 200);
	});
	articlequeue.start();
}

function processMessage(message, callback) {
	const article = Object.assign(message, new SubjectExtracter(message.subject));
	article.created = new Date();
	if (!article.filter) {
		article.key = article.filename + '|' + article.part.total + '|' + article.email; // for MR
		articlescollection.insert(article);
	} else {
		article.messageid = article._id;
		article._id = article.subject;
		delete article.subject;
		filteredcollection.insert(article);
	}
	// return callback();
	return;
}