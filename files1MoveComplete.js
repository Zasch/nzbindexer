require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const database = require('./lib/database');
let mongoclient;

database.connect((db) => {
	if (db) {
		log.info('starting move');
		mongoclient = db;
		return process();
	}
	return;
});

const fields = ['application', 'filename', 'subject', 'date', 'email', 'extension', 'regex', 'file'];

function mapFileObject(file) {
	const tmp = file.value.parts[0]; // should exist!!!
	let result = {
		_id: tmp.filename + '|' + tmp.date.getTime(),
		totalbytes: file.value.totalbytes,
		parts: file.value.parts
			.sort((a, b) => a.part.index - b.part.index)
			.map((part) => part._id),
		partcount: file.value.partcount
	};
	fields.forEach((field) => {
		result[field] = tmp[field];
	});
	return result;
}

function process() {
	source = mongoclient.collection('files');
	remover = new database.BulkProcessor(source, global.config.bulksize);
	inserter = new database.BulkProcessor(mongoclient.collection('files_complete'), global.config.bulksize);
	let stats = {
		complete: 0,
		incomplete: 0
	};
	const cursor = source.find();
	cursor.forEach(function (file) {
		const total = parseInt(file._id.split('|')[1]);
		let complete = false;
		if (file.value.partcount === total) {
			complete = true;
		} else if (file.value.part.index === 0 && file.value.partcount === total + 1) {
			complete = true;
		}
		if (complete) {
			stats.complete++;
			let mapped = mapFileObject(file);
			mapped.key = mapped.regex + '|' + mapped.file.total + '|' + mapped.email;
			mapped.complete = true;
			mapped.created = new Date();
			inserter.insert(mapped);
			remover.remove(file);
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