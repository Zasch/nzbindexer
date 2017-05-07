require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const filename = __filename.split(/[\\/]/).pop();
const cluster = require('cluster');
const WebSocket = require('ws');
const encoder = JSON.stringify;
const decoder = JSON.parse;
const database = require('./lib/database');
const SubjectExtracter = require('./lib/subjectextracter');

let mongoclient;
let articlescollection;
// let articlescollection1;
let filteredcollection;

var _once_cache = {};

function once(collection, str, fn) {
	if (!_once_cache[collection]) _once_cache[collection] = {};
	if (!_once_cache[collection][str]) {
		_once_cache[collection][str] = str;
		fn.apply();
	}
}

if (cluster.isMaster) {
	process.title = `node ${filename} server(master)`;
	const wss = new WebSocket.Server({
		port: 9999
	});
	for (let i = 0; i < global.config.articlestodatabase.threads; i++) {
		cluster.fork();
	}
	let m = 0;
	setInterval(() => {
		once('master', 'messages' + m, () => {
			log.debug('messages', m);
		});
	}, 2000);
	target = 0;
	wss.on('connection', function connection(ws) {
		ws.on('message', function incoming(messages) {
			m++;
			if (target++ === global.config.articlestodatabase.threads) {
				target = 1;
			}
			return cluster.workers[target].send(decoder(messages));
		});
	});
} else if (cluster.isWorker) {
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
	process.title = `node ${filename} server(worker[${worker_id}])`;
	articlescollection = new database.BulkProcessor(mongoclient.collection('articles'), global.config.bulksize);
	// articlescollection1 = new database.BulkProcessor(mongoclient.collection('articles_copy'), global.config.bulksize);
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
	article.date = new Date(article.date);
	article.created = new Date();
	// log.info(article);
	if (!article.filter) {
		article.key = article.filename + '|' + article.part.total + '|' + article.email; // for MR
		articlescollection.insert(article);
		// articlescollection1.insert(article);
	} else {
		article.messageid = article._id;
		article._id = article.subject + '|' + article.email + '|' + article.date.getTime();
		delete article.subject;
		filteredcollection.insert(article);
	}
	// return callback();
	return;
}

// const lokijs = require('lokijs');
// const lokidb = new lokijs('sandbox');
// const lokiitems = lokidb.addCollection('items');

// var example_source_message = {
// 	subject: '[400708]-[full]-[#a.b.teevee@efnet]-[ jimmy.kimmel.2017.05.05.david.spade.720p.hdtv.x264-crooks ]-[33/49] - "jimmy.kimmel.2017.05.05.david.spade.720p.hdtv.x264-crooks.r22" yenc (58/66)',
// 	email: 'provide@4u.net',
// 	from: 'provide@4u.net (yeahsure)',
// 	date: '2017-05-06T21:19:55.000Z',
// 	application: 'reader.easyusenet.nl',
// 	_id: '1494105595.46285.58@reader.easyusenet.nl',
// 	bytes: 793484,
// 	lines: 6099,
// 	xref: ['alt.binaries.teevee:1302542873']
// };

// var example_target_message = { subject: '"the_pretender_s04e05.vol044+39.par2" the pretender season 4 dvdrip (44/61)',
//   email: 'yenc@power-post.org',
//   from: 'yenc@power-post.org (bos dvd)',
//   date: 2017-05-07T09:20:05.000Z,
//   application: 'powerpost2000aa.local',
//   _id: 'part44of61.ottcsnbxmblwujgoorra@powerpost2000aa.local',
//   bytes: 258218,
//   lines: 1984,
//   xref: 
//    [ 'alt.binaries.classic.tv.shows:80988011',
//      'alt.binaries.teevee:1302694085',
//      'alt.binaries.tvshows:9787608' ],
//   newsubject: 'the pretender season 4 dvdrip',
//   errors: 
//    { extractFileIndex: '"the_pretender_s04e05.vol044+39.par2" the pretender season 4 dvdrip (44/61)',
//      extractFilesize: '"the_pretender_s04e05.vol044+39.par2" the pretender season 4 dvdrip (44/61)',
//      remainingSubject: '"the pretender season 4 dvdrip" --> "the_pretender_s04e05.vol044+39.par2" the pretender season 4 dvdrip (44/61)' },
//   filename: 'the_pretender_s04e05.vol044+39.par2',
//   part: { index: 44, total: 61 },
//   extension: 'par2',
//   regex: 'the_pretender_s04e05',
//   filter: true,
//   created: 2017-05-07T09:20:06.548Z
// };