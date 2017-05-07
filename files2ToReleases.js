require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const database = require('./lib/database');
let mongoclient;
const started = new Date();

function mapper() {
	var mapObject = {
		files: [this],
		file: this.file,
		totalbytes: this.totalbytes
	};
	return emit(this.key, mapObject);
};

function reducer(key, values) {
	var reducedObject = {
		files: [],
		file: {
			index: 999999999999999999999,
			total: 0
		},
		totalbytes: 0
	};
	values.forEach(function (value) {
		value.files.forEach(function (file) {
			if (reducedObject.files.indexOf(file) == -1) {
				reducedObject.files.push(file);
				reducedObject.totalbytes += file.totalbytes;
				if (file.file.index < reducedObject.file.index) {
					reducedObject.file.index = file.file.index;
				}
				if (file.file.total > reducedObject.file.total) {
					reducedObject.file.total = file.file.total;
				}
			}
		});
	});
	return reducedObject;
};

function finalizer(key, reducedObject) {
	reducedObject.filecount = reducedObject.files.length;
	reducedObject.modified = new Date();
	return reducedObject;
};

database.connect(function (db) {
	mongoclient = db;
	database.getLastRun(mongoclient.collection('stats'), 'files2ToReleases', (lastrundate) => {
		database.updateLastRun(mongoclient.collection('stats'), 'files2ToReleases', () => {});
		log.info('Starting: mapReduce from', lastrundate);
		mongoclient.collection('files_complete').mapReduce(
			mapper,
			reducer, {
				query: {
					created: {
						$gte: lastrundate
					}
				},
				sort: {
					key: 1
				},
				out: {
					reduce: "releases"
				},
				jsMode: false,
				verbose: false,
				finalize: finalizer
			},
			done
		);
	});
});

function done(err, resultcollection) {
	log.info('Finished: mapReduce');
	if (err) {
		return log.error('ERROR!!!', err);
	}
	if (resultcollection) {
		return cleanup(resultcollection);
	}
}

function cleanup(resultcollection) {
	resultcollection.count(function (err, count) {
		if (err) {
			return log.error(error);
		}
		let deletes = [];
		log.info('Result: created/updateted', count, 'files');
		log.info('Starting: cleanup');
		let test = 0;
		if (count > 0) {
			const cursor = resultcollection.find({
				'value.modified': {
					$gte: started
				}
			});
			cursor.forEach(function (release) {
				release.value.files.forEach((file) => {
					test++;
					deletes.push({
						deleteOne: {
							filter: {
								_id: file._id
							}
						}
					})
				});
			}, function (error, result) {
				log.info(`Cleanup: found ${deletes.length} to be deleted`);
				if (deletes.length > 0) {
					mongoclient.collection('files_complete').bulkWrite(deletes, {
						ordered: false
					}, function (error, result) {
						if (err) return log.error(error);
						log.info('Result: deleted', result.nRemoved);
						return mongoclient.close();
					});
				} else {
					log.info('Result: deleted', 0);
					return mongoclient.close();
				}
			});
		} else {
			return log.info('Finished: cleanup');
		}
	});
};