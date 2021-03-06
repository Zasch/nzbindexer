import { logger } from './lib/logger';
const filename = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db, Collection } from 'mongodb';
import { config } from './config';
import { ArticleStatus } from './data/consts';
import { Timer } from './lib/timer';
import * as cluster from 'cluster';
import * as database from './lib/database';

let mongoclient: Db;
let source_collection;
const source = 'articles';

cluster.setupMaster({
	exec: 'articles3ToFilesWorker.ts',
	silent: false
});

if (cluster.isMaster) {
	process.title = `node ${filename} master`;
	startMaster();
}

function startMaster() {
	log.info('starting');
	const numCPUs = config.articlestofiles.threads;
	let keys: Array<any>;
	let keyslength: number;
	let keyspointer = 0;
	database.connect((db: Db) => {
		mongoclient = db;
		source_collection = mongoclient.collection(source);
		getDistinct(source_collection, 'key', { status: ArticleStatus.OK }, (distinctkeys: Array<string>) => {
			Timer.start('parallel');
			log.info(`found ${distinctkeys.length} distinct keys`);
			keys = distinctkeys;
			keyslength = keys.length;
			for (let i = 0; i < numCPUs; i++) {
				cluster.fork();
			}
		});
	});
	let exited = 0;
	cluster.on('exit', () => {
		exited++;
		if (exited === numCPUs) {
			mongoclient.close();
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
					log.info(`parallel processing done: ${Timer.end('parallel')}`);
					return cluster.disconnect();
				}
			}
		}
	});
}

function getDistinct(collection: Collection, field: string, filter: any, callback: Function) {
	collection.distinct(field, filter, (error: any, result: Array<string>) => {
		return callback(result);
	});
}
