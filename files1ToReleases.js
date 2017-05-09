require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const filename = __filename.split(/[\\/]/).pop();
const cluster = require('cluster');
const database = require('./lib/database');
const timer = require('./lib/timer');
let mongoclient;
let source_collection;
const source = 'files_complete';

cluster.setupMaster({
  exec: 'files1ToReleasesWorker.js',
  silent: false
});

if (cluster.isMaster) {
	process.title = `node ${filename} master`;
	return startMaster();
}

function startMaster() {
	log.info('starting');
	const numCPUs = global.config.articlestofiles.threads;
	let keys;
	let keyslength;
	let keyspointer = 0;
	database.connect((db) => {
		mongoclient = db;
		source_collection = mongoclient.collection(source);
		getDistinct(source_collection, 'key', (distinctkeys) => {
			timer.start('parallel');
			log.info(`found ${distinctkeys.length} distinct keys`);
			keys = distinctkeys;
			keyslength = keys.length;
			for (let i = 0; i < numCPUs; i++) {
				cluster.fork();
			}
			mongoclient.close();
		});
	});
	let exited = 0;
	cluster.on('exit', () => {
		exited++;
		if (exited === numCPUs) {
			return log.info("all workers have exited");
		}
	});
	let workers_done = 0;
	cluster.on('message', (worker, message) => {
		if (message === "send me a message") {
			if (keyspointer < keyslength) {
				const message = keys[keyspointer++];
				return worker.send(message);
			} else {
				workers_done++;
				if (workers_done === numCPUs) {
					log.info(`parallel processing done: ${timer.end('parallel')}`);
					return cluster.disconnect();
				}
			}
		}
	});
}

function getDistinct(collection, field, callback) {
	collection.distinct(field, (error, result) => {
		return callback(result);
	});
}