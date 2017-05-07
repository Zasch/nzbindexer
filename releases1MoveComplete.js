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
		return process();
	}
	return;
});

const fields = ['subject', 'filename', 'date', 'email', 'regex'];

function mapReleaseObject(release) {
	const tmp = release.value.files[0]; // should exist!!!
	let extensions = {};
	let result = {
		_id: tmp.regex + '|' + tmp.date.getTime(),
		totalbytes: release.value.totalbytes,
		// files: release.value.files,
		files: release.value.files
			.sort((a, b) => a.file.index - b.file.index)
			.map((file) => {
				if (!extensions[file.extension]) {
					extensions[file.extension] = 1;
				} else {
					extensions[file.extension]++;
				}
				return {
					filename: file._id,
					index: file.file.index,
					parts: file.parts
				}
			}),
		extensions: extensions,
		filecount: release.value.filecount
	};
	fields.forEach((field) => {
		result[field] = tmp[field];
	});
	return result;
}

function process() {
	source = mongoclient.collection('releases');
	remover = new database.BulkProcessor(source, global.config.bulksize);
	inserter = new database.BulkProcessor(mongoclient.collection('releases_complete'), global.config.bulksize);
	let stats = {
		complete: 0,
		incomplete: 0
	};
	const cursor = source.find();
	cursor.forEach(function (release) {
		const total = parseInt(release._id.split('|')[1]);
		let complete = false;
		if (release.value.filecount === total) {
			complete = true;
		} else if (release.value.file.index === 0 && release.value.filecount === total + 1) {
			complete = true;
		}
		if (complete) {
			stats.complete++;
			let mapped = mapReleaseObject(release);
			mapped.complete = true;
			log.info('creating release:', mapped.regex);
			inserter.insert(mapped);
			remover.remove(release);
		} else {
			stats.incomplete++;
		}
	}, function (err) {
		inserter.flush();
		remover.flush();
		log.info('Result: ', stats);
		mongoclient.close();
	});
}