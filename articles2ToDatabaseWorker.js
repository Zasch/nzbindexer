require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const filename = __filename.split(/[\\/]/).pop();
const cluster = require('cluster');
const encoder = JSON.stringify;
const decoder = JSON.parse;
const database = require('./lib/database');
const SubjectExtracter = require('./lib/subjectextracter');

let mongoclient;
let articlescollection;
let filteredcollection;

if (cluster.isWorker) {
	process.title = `node ${filename} server(worker[${cluster.worker.id}])`;
	database.connect((db) => {
		if (db) {
			mongoclient = db;
			startWorker();
		}
		return;
	});
}

function startWorker() {
	const worker_id = cluster.worker.id;
	articlescollection = new database.BulkProcessor(mongoclient.collection('articles'), global.config.bulksize);
	filteredcollection = new database.BulkProcessor(mongoclient.collection('articles_filtered'), global.config.bulksize);
	let m = 0;
	let timeout;
	process.on('message', (messages) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			log.warn(`worker[${worker_id}]: flushing, probably because I\'m done`);
			articlescollection.flush(()=>{
				log.info('stats[articlescollection]', articlescollection.stats().inserted);
			});
			filteredcollection.flush(()=>{
				log.info('stats[filteredcollection]', articlescollection.stats().inserted);
			});
		}, 5000);
		m += messages.length;
		log.info(`worker[${worker_id}]: ${m}`);
		return processMessages(messages);
	});
}

function processMessages(messages) {
	return messages.forEach((message) => {
		return processMessage(message);
	});
}

function processMessage(message, callback) {
	const article = Object.assign(message, new SubjectExtracter(message.subject));
	article._id = article.filename + '|' + article.messageid;
	article.date = new Date(article.date); // because JSON parse/stringify
	article.created = new Date();
	if (!article.filter) {
		article.key = article.filename + '|' + article.part.total + '|' + article.email; // for MR
		articlescollection.insert(article);
	} else {
		filteredcollection.insert(article);
	}
	return;
}
