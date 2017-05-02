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

const fields = [
	'subject',
	'date',
	'email',
	'regex'
];

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
	const x = 5000;
	source = mongoclient.collection('releases');
	remover = new database.BulkProcessor(source, x);
	inserter = new database.BulkProcessor(mongoclient.collection('releases_complete'), x);

	const cursor = source.find();
	cursor.forEach(function (release) {
		const splitted = release._id.split('|');
		const total = parseInt(splitted[1]);
		if (release.value.filecount === total) {
			const mapped = mapReleaseObject(release);
			mapped.complete = true;
			log.info('creating release:', mapped.regex);
			inserter.insert(mapped);
			remover.remove(release);
		}
	}, function (err) {
		inserter.flush();
		remover.flush();
		log.info('Result: ', inserter.stats(), 'releases_complete created');
		mongoclient.close();
	});
}
