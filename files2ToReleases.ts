import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db, Collection } from 'mongodb';
import { config } from './config';
import { Timer } from './lib/timer';
import * as cluster from 'cluster';
import * as database from './lib/database';
let mongoclient: Db;
let source_collection;
const source = 'files';

cluster.setupMaster({
	exec: 'files2ToReleasesWorker.ts',
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
	let keyslength: number
	let keyspointer = 0;
	database.connect((db: Db) => {
		mongoclient = db;
		source_collection = mongoclient.collection(source);
		getDistinct(source_collection, 'key', (distinctkeys: Array<string>) => {
			Timer.start('parallel');
			log.info(`found ${distinctkeys.length} distinct keys`);
			keys = distinctkeys;
			getSimilarKeys(keys);
			// let fuzzyKeys = getSimilarKeys(keys);
			// console.log(fuzzyKeys);
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
					log.info(`parallel processing done: ${Timer.end('parallel')}`);
					return cluster.disconnect();
				}
			}
		}
	});
}

function getDistinct(collection: Collection, field: string, callback: Function) {
	collection.distinct(field, (error: any, result: Array<string>) => {
		return callback(result);
	});
}

function getSimilarKeys(keys: Array<string>) {
	Timer.start('getSimilarKeys');
	const regexes = [
		/[ ._-]sc\d{1,3}/,
		/[0-9]$/,
		/[a-z]$/
	];
	let first: any = {};
	let reduced = keys.reduce((previous: any, key: string) => {
		regexes.forEach((regex: RegExp) => {
			const splitted = key.split('|'); // 0: matcher, 1: total, 2: email
			if (regex.test(splitted[0])) {
				splitted[0] = splitted[0].replace(regex, '');
				const newkey = splitted.join('|');
				if (!first[newkey]) {
					first[newkey] = {
						total: parseInt(splitted[1],10),
						files: [key]
					};
				} else {
					if (!previous[newkey]) {
						previous[newkey] = first[newkey];
					}
					previous[newkey].files.push(key);
				}
			}
		});
		return previous;
	}, {});
	let completed = Object.keys(reduced).reduce((previous: any,newkey: any)=>{
		// console.log(newkey, reduced[newkey].total, reduced[newkey].files.length);
		if (reduced[newkey].total === reduced[newkey].files.length) {
			previous[newkey] = reduced[newkey].files;
		}
		return previous;
	},{});
	// console.log(completed, Timer.end('getSimilarKeys'));
	return completed;
}
