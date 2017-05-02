require('./logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017/nzbindex';

module.exports.connect = function (callback) {
	MongoClient.connect(url, {
		socketTimeoutMS: 3600000
	}, function (err, db) {
		if (err) {
			console.log("error", err);
			return callback(null);
		}
		// console.log("Connected correctly to server");
		return callback(db);
	});
}

module.exports.insertDocument = function (collection, doc, callback) {
	collection.insertOne(doc, callback);
}

module.exports.upsertDocument = function (collection, doc, callback) {
	collection.updateOne({
		_id: doc._id
	}, doc, {
		upsert: true
	}, callback);
}

module.exports.updateLastRun = function (collection, modulename, callback) {
	const query = {
		_id: 'lastrun'
	};
	const doc = {};
	doc[modulename] = new Date();
	collection.updateOne(query, doc, {
		upsert: true
	}, callback)
}

module.exports.getLastRun = function (collection, modulename, callback) {
	const query = {
		_id: 'lastrun'
	};
	// if (!collection) {
	// 	return callback(new Date('2017-01-01'));
	// }
	collection.findOne(query, (error, record) => {
		if (error) throw error;
		if (record && record[modulename]) {
			return callback(record[modulename]);
		} else {
			return callback(new Date('2017-01-01'));
		}
	});
}

class BulkProcessor {
	constructor(collection, batchsize) {
		this.collection = collection;
		this.collection_name = collection.s.namespace;
		this.counter = 0;
		this.batchsize = batchsize
		this.processor = collection.initializeUnorderedBulkOp();
	}

	flush() {
		if (this.processor.s.currentIndex) {
			log.debug('flush', this.collection_name, this.processor.s.currentIndex);
			this.processor.execute((error, result) => {
				if (error) log.error(error);
				// const r = {
				// 	nInserted: result.nInserted,
				// 	nUpserted: result.nUpserted,
				// 	nMatched: result.nMatched,
				// 	nModified: result.nModified,
				// 	nRemoved: result.nRemoved
				// }
				// log.info({result:r}, this.collection_name);
			});
		}
	}

	check() {
		if (this.counter % this.batchsize === 0) {
			log.debug('bulk', this.collection_name, this.processor.s.currentIndex);
			this.processor.execute((error, result) => {
				if (error) log.error(error);
				// const r = {
				// 	nInserted: result.nInserted,
				// 	nUpserted: result.nUpserted,
				// 	nMatched: result.nMatched,
				// 	nModified: result.nModified,
				// 	nRemoved: result.nRemoved
				// }
				// log.info({result:r}, this.collection_name);
			});
			this.processor = this.collection.initializeUnorderedBulkOp();
		}
	}

	insert(doc) {
		this.processor.insert(doc);
		this.counter++;
		this.check();
	}

	remove(doc) {
		this.processor.find({
			_id: doc._id
		}).removeOne();
		this.counter++;
		this.check();
	}

	stats() {
		return this.counter;
	}
}

module.exports.BulkProcessor = BulkProcessor;