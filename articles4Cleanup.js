require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const async = require('async');
const database = require('./lib/database');
let mongoclient;
let remover;

database.connect((db) => {
	if (db) {
		mongoclient = db;
		remover = new database.BulkProcessor(mongoclient.collection('articles'), 5000);
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
		// file.parts.forEach((part) => {
		// 	remover.remove({_id: part});
		// })
		file.value.parts.forEach((part) => {
			remover.remove({_id: part._id});
		})
	}, function (error, result) {
		remover.flush();
		log.info('result: deleted', remover.stats());
		return callback();
	});
}
