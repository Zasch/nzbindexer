require('./lib/config');
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
		log.info('starting cleanup');
		mongoclient = db;
		remover = new database.BulkProcessor(mongoclient.collection('files_complete'), global.config.bulksize);
		return process();
	}
	return;
});

function process() {
	getReleases((parts) => {
		log.info('cleanup done!');
		setTimeout(() => {
			mongoclient.close();
		}, 3000);
	});
}

function getReleases(callback) {
	// source = mongoclient.collection('releases_complete');
	source = mongoclient.collection('releases');
	const cursor = source.find();
	cursor.forEach(function (release) {
		// release.files.forEach((file) => {
		// 	remover.remove({_id:file.filename});
		// })
		release.value.files.forEach((file) => {
			remover.remove({_id:file._id});
		})
	}, function (error, result) {
		remover.flush();
		log.info('result: deleted', remover.stats());
		return callback();
	});
}
