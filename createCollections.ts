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
	'files_complete',
	'releases_complete',
	'stats'
];

interface Index {
	[key: string]: Array<any>;
}


const indexes: Index = {
	articles: [{
		options: {
			name: 'reject_duplicate_articles',
			unique: true,
			background: false,
			dropDups: true
		},
		keys: {
			"filename": 1,
			"part.index": 1,
			"email": 1,
			"application": 1
		}
	}, {
		options: {
			name: 'created',
			unique: false,
			background: false
		},
		keys: {
			"created": 1
		}
	}, {
		options: {
			name: 'date',
			unique: false,
			background: false
		},
		keys: {
			"date": 1
		}
	}, {
		options: {
			name: 'key',
			unique: false,
			background: false
		},
		keys: {
			"key": 1
		}
	}],
	articles_filtered: [{
		options: {
			name: 'created',
			unique: false,
			background: false
		},
		keys: {
			"created": 1
		}
	}, {
		options: {
			name: 'date',
			unique: false,
			background: false
		},
		keys: {
			"date": 1
		}
	}],
	files_complete: [{
		options: {
			name: 'key',
			unique: false,
			background: false
		},
		keys: {
			"key": 1
		}
	}, {
		options: {
			name: 'created',
			unique: false,
			background: false
		},
		keys: {
			"created": 1
		}
	}, {
		options: {
			name: 'date',
			unique: false,
			background: false
		},
		keys: {
			"date": 1
		}
	}],
	releases_complete: [{
		options: {
			name: 'key',
			unique: false,
			background: false
		},
		keys: {
			"key": 1
		}
	}, {
		options: {
			name: 'date',
			unique: false,
			background: false
		},
		keys: {
			"date": 1
		}
	}]
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


// files: [{
// 		options: {
// 			name: 'key',
// 			unique: false,
// 			background: false
// 		},
// 		keys: {
// 			"key": 1
// 		}
// 	}, {
// 		options: {
// 			name: 'modified',
// 			unique: false,
// 			background: false
// 		},
// 		keys: {
// 			"value.modified": 1
// 		}
// 	}],


// releases: [{
// 	options: {
// 		name: 'key',
// 		unique: false,
// 		background: false
// 	},
// 	keys: {
// 		"key": 1
// 	}
// }, {
// 	options: {
// 		name: 'modified',
// 		unique: false,
// 		background: false
// 	},
// 	keys: {
// 		"value.modified": 1
// 	}
// }],