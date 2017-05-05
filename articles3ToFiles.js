require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const database = require('./lib/database');
let mongoclient;

function mapper() {
	var mapObject = {
		parts: [this],
		part: this.part,
		totalbytes: this.bytes
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
		totalbytes: 0
	};
	values.forEach(function (value) {
		if (value.parts) value.parts.forEach(function (part) {
			if (reducedObject.parts.indexOf(part) === -1) {
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
	return reducedObject;
};

database.connect(function (db) {
	mongoclient = db;
	database.getLastRun(mongoclient.collection('stats'), 'articles3ToFiles', (lastrundate) => {
		database.updateLastRun(mongoclient.collection('stats'), 'articles3ToFiles', () => {});
		log.info('Starting: mapReduce from', lastrundate);
		mongoclient.collection('articles').mapReduce(
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
					reduce: "files"
				},
				jsMode: true,
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
		return console.log(err)
	};
	if (resultcollection) {
		resultcollection.count(function (err, count) {
			log.info('Result: created', count, 'files');
			mongoclient.close();
		});
	}
}
