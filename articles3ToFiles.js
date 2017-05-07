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
		parts: [this],
		part: this.part,
		totalbytes: this.bytes,
		// modified: new Date()
	};
	return emit(this.key, mapObject);
};

function reducer(key, values) {
	var reducedObject = {
		parts: [],
		part: {
			index: 999999999999999999999,
			total: 0
		},
		totalbytes: 0,
		// modified: new Date()
	};
	values.forEach(function (value) {
		value.parts.forEach(function (part) {
			if (reducedObject.parts.indexOf(part) === -1) {
				// reducedObject.modified = new Date();
				reducedObject.parts.push(part);
				reducedObject.totalbytes += part.bytes;
				if (part.part.index < reducedObject.part.index) {
					reducedObject.part.index = part.part.index;
				}
				if (part.part.total > reducedObject.part.total) {
					reducedObject.part.total = part.part.total;
				}
			}
		});
	});
	return reducedObject;
};

function finalizer(key, reducedObject) {
	reducedObject.partcount = reducedObject.parts.length;
	reducedObject.modified = new Date();
	return reducedObject;
};

function done(err, resultcollection) {
	log.info('Finished: mapReduce');
	if (err) {
		return log.error('ERROR!!!', err);
	};
	if (resultcollection) {
		return cleanup(resultcollection);
	}
}

database.connect(function (db) {

	mongoclient = db;
	database.getLastRun(mongoclient.collection('stats'), 'articles3ToFiles', (lastrundate) => {
		log.info(`Previous run: [${lastrundate}]`);
		log.info('Starting: mapReduce', lastrundate);
		mongoclient.collection('articles').mapReduce(
			mapper,
			reducer, {
				query: {
					created: {
						$gte: lastrundate
					}
				},
				limit: 500000,
				sort: {
					key: 1
				},
				out: {
					reduce: "files"
				},
				jsMode: false,
				verbose: false,
				finalize: finalizer
			},
			done
		);
	});
});

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
			cursor.forEach(function (file) {
				const key = file.value.parts[0].key;
				// deletes.push({
				// 	deleteMany: {
				// 		filter: {
				// 			key: key
				// 		}
				// 	}
				// });
				file.value.parts.forEach((part) => {
					test++;
					deletes.push({
						deleteOne: {
							filter: {
								_id: part._id
							}
						}
					})
				});
			}, function (error, result) {
				log.info(`Cleanup: found ${deletes.length} to be deleted`);
				if (deletes.length > 0) {
					mongoclient.collection('articles').bulkWrite(deletes, {
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