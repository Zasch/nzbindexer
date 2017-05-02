require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const database = require('./lib/database');
let mongoclient;

function mapper() {
	var mapObject = {
		files: [this],
		totalbytes: this.totalbytes
	};
	return emit(this.key, mapObject);
};

function reducer(key, values) {
	var reducedObject = {
		files: [],
		totalbytes: 0
	};
	values.forEach(function (value) {
		value.files.forEach(function (file) {
			if (reducedObject.files.indexOf(file) == -1) {
				reducedObject.files.push(file);
				reducedObject.totalbytes += file.totalbytes;
			}
		});
	});
	return reducedObject;
};

function finalizer(key, reducedObject) {
	reducedObject.filecount = reducedObject.files.length;
	return reducedObject;
};

database.connect(function (db) {
	mongoclient = db;
	log.info('Starting: mapReduce');
	mongoclient.collection('files_complete').mapReduce(
		mapper,
		reducer, {
			sort: {key: 1},
			out: {
				reduce: "releases"
			},
			jsMode: false,
			verbose: true,
			finalize: finalizer
		},
		done
	);
});

function done(err, resultcollection) {
	log.info('Finished: mapReduce');
	if (err) {
		return console.log(err)
	};
	if (resultcollection) {
		resultcollection.count(function (err, count) {
			log.info('Result: created', count, 'releases');
			mongoclient.close();
		});
	}
}