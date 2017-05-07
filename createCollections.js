require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const database = require('./lib/database');
let mongoclient;

database.connect((db) => {
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
	'files_complete',
	'releases',
	'releases_complete',
	'stats'
];

const indexes = {
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
			name: 'key',
			unique: false,
			background: false
		},
		keys: {
			"key": 1
		}
	}],
	files: [{
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
			name: 'modified',
			unique: false,
			background: false
		},
		keys: {
			"value.modified": 1
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
	releases: [{
		options: {
			name: 'key',
			unique: false,
			background: false
		},
		keys: {
			"key": 1
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
	}]
};

function start() {
	let callback_count = 0;
	collections.forEach((collection) => {
		createCollection(collection, (c) => {
			createIndexes(c, () => {
				callback_count++;
				if (callback_count === collections.length) {
					console.log('exiting...');
					mongoclient.close();
				}
			});
		})
	});
}

function createCollection(name, callback) {
	mongoclient.listCollections({
		name: name
	}).toArray(function (err, names) {
		if (1 === names.length) {
			console.log(`collection[${name}] already exists`);
			callback(mongoclient.collection(name));
		} else {
			mongoclient.createCollection(name, (err, collection) => {
				if (err) console.log('error', err);
				console.log(`collection[${name}], created`);
				callback(collection);
			});
		}
	});
}

function createIndexes(collection, callback) {
	const colname = collection.s.name;
	// console.log('creating Indexes for', colname);
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

function createIndex(collection, index, callback) {
	// console.log('\tcreating', index.options.name);
	collection.indexExists(index.options.name, function (err, exists) {
		if (err) console.log('error', err);
		if (!exists) {
			collection.createIndex(index.keys, index.options, function (error, name) {
				if (error) return console.log(error);
				console.log(`created index[${name}] on collection[${collection.s.name}]`);
				return callback();
			});
		} else {
			callback();
		}
	});
}