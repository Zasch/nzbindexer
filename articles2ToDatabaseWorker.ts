import { logger } from './lib/logger';
const filename = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db } from 'mongodb';
import { config } from './config';
import { SubjectExtracter } from './lib/subjectextracter';
import * as cluster from 'cluster';
import * as database from './lib/database';

let mongoclient: Db;
let articlescollection: database.BulkProcessor;
let filteredcollection: database.BulkProcessor;

// var _once_cache = {};
// function once(collection, str, fn) {
// 	if (!_once_cache[collection]) _once_cache[collection] = {};
// 	if (!_once_cache[collection][str]) {
// 		_once_cache[collection][str] = str;
// 		fn.apply();
// 	} else {
// 		console.log("Already had:", str);
// 	}
// }

if (cluster.isWorker) {
	process.title = `node ${filename} server(worker[${cluster.worker.id}])`;
	database.connect((db: Db) => {
		if (db) {
			mongoclient = db;
			startWorker();
		}
		return;
	});
}

function startWorker() {
	const worker_id = cluster.worker.id;
	articlescollection = new database.BulkProcessor(mongoclient.collection('articles'), config.bulksize);
	filteredcollection = new database.BulkProcessor(mongoclient.collection('articles_filtered'), config.bulksize);
	let m = 0;
	let timeout: NodeJS.Timer;
	process.on('message', (messages: Array<any>) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			log.warn(`worker[${worker_id}]: flushing, probably because I\'m done`);
			articlescollection.flush(() => {
				log.info('stats[articlescollection]', articlescollection.stats().inserted);
				// log.info({stats: articlescollection.stats()}, 'stats[articlescollection]');
			});
			filteredcollection.flush(() => {
				log.info('stats[filteredcollection]', filteredcollection.stats().inserted);
				// log.info({stats: filteredcollection.stats()}, 'stats[filteredcollection]');
			});
		}, 5000);
		m += messages.length;
		log.info(`worker[${worker_id}]: ${m}`);
		return processMessages(messages);
	});
}

function processMessages(messages: Array<any>) {
	return messages.forEach((message) => {
		return processMessage(message);
	});
}

function processMessage(message: any) {
	const article = Object.assign(message, new SubjectExtracter(message.subject));
	article.date = new Date(article.date); // because JSON parse/stringify
	article.created = new Date();
	if (!article.filter) {
		article._id = article.filename + '|' + article.part.index + 'of' + article.part.total + '|' + article.id;
		article.key = article.filename + '|' + article.part.total + '|' + article.email; // for MR
		articlescollection.insert(article);
	} else {
		article._id = article.subject + '|' + article.id;
		filteredcollection.insert(article);
	}
	return;
}