import { logger } from './lib/logger';
const filename = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db, Collection } from 'mongodb';
import * as database from './lib/database';
let mongoclient: Db;

database.connect((db: Db) => {
	if (db) {
		mongoclient = db;
		start();
	}
	return;
});

const collections = [
	'articles',
	'articles_filtered',
	'files',
	'releases',
	'stats'
];

interface Indexes {
	[key: string]: Array<any>;
}

function index(name: string, keys: any, unique: boolean, dropDups?: boolean, background?: boolean) {
	return {
		options: {
			name: name,
			unique: unique,
			dropDups: dropDups || false,
			background: background || false
		},
		keys: keys
	}
}

const indexes: Indexes = {
	articles: [
		index('reject_duplicate_articles', {
			"filename": 1,
			"part.index": 1,
			"email": 1
		}, true, false),
		index('messageid', { messageid: 1 }, true,false),
		index('key', { key: 1 }, false),
		index('status', { status: 1 }, false),
		index('date', { date: 1 }, false)
	],
	articles_filtered: [
		index('messageid', { messageid: 1 }, true, false),
		index('key', { key: 1 }, false),
		index('status', { status: 1 }, false),
		index('date', { date: 1 }, false)
	],
	files: [
		index('key', { key: 1 }, false),
		index('date', { date: 1 }, false)
	],
	releases: [
		index('key', { key: 1 }, false),
		index('date', { date: 1 }, false)
	]
};

function start() {
	let callback_count = 0;
	collections.forEach((collection) => {
		createCollection(collection, (c: Collection) => {
			createIndexes(c, () => {
				callback_count++;
				if (callback_count === collections.length) {
					log.info('exiting...');
					mongoclient.close();
				}
			});
		})
	});
}

function createCollection(name: string, callback: Function) {
	mongoclient.listCollections({
		name: name
	}).toArray(function (err, names) {
		if (1 === names.length) {
			log.info(`collection[${name}] already exists`);
			callback(mongoclient.collection(name));
		} else {
			mongoclient.createCollection(name, (err, collection) => {
				if (err) log.info('error', err);
				log.info(`collection[${name}], created`);
				callback(collection);
			});
		}
	});
}

function createIndexes(collection: any, callback: Function) {
	const colname = collection.s.name;
	// log.info('creating Indexes for', colname);
	if (indexes[colname] && indexes[colname].length > 0) {
		let callback_count = 0;
		indexes[colname].forEach((index) => {
			createIndex(collection, index, () => {
				callback_count++;
				if (callback_count === indexes[colname].length) {
					return callback();
				}
			});
		});
	} else {
		return callback();
	}
}

function createIndex(collection: any, index: any, callback: Function) {
	// log.info('\tcreating', index.options.name);
	collection.indexExists(index.options.name, function (err: any, exists: boolean) {
		if (err) log.info('error', err);
		if (!exists) {
			collection.createIndex(index.keys, index.options, function (error: any, name: string) {
				if (error) return log.info(error);
				log.info(`created index[${name}] on collection[${collection.s.name}]`);
				return callback();
			});
		} else {
			callback();
		}
	});
}
