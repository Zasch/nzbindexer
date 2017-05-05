require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const async = require('async');
const database = require('./lib/database');
let mongoclient;
let articles;

database.connect((db) => {
	if (db) {
		log.info('starting cleanup');
		mongoclient = db;
		articles = new database.BulkProcessor(mongoclient.collection('articles'), 5000);
		return process();
	}
	return;
});

function process() {
	getFiles((parts) => {
		log.info('cleanup done!');
		setTimeout(() => {
			mongoclient.close();
		}, 3000);
	});
}

function getFiles(callback) {
	// source = mongoclient.collection('files_complete');
	source = mongoclient.collection('files');
	const cursor = source.find();
	cursor.forEach(function (file) {
		file.value.parts.forEach((part) => {
			articles.remove({_id: part._id});
		})
	}, function (error, result) {
		articles.flush();
		log.info('result: deleted', articles.stats());
		return callback();
	});
}
