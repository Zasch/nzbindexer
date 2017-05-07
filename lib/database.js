require('./logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const MongoClient = require('mongodb').MongoClient;
const config = require('../config');
const url = config.mongodb;

module.exports.connect = function (callback) {
	MongoClient.connect(url, {
		socketTimeoutMS: 3600000
	}, function (err, db) {
		if (err) {
			log.error("error", err);
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
	const set = {};
	set[modulename] = new Date();
	const update = {
		$set: set
	};
	// doc[modulename] = new Date();
	// console.log(update);
	collection.updateOne(query, update, {
		upsert: true
	}, (error, CommandResult) => {
		// log.warn('updateLastRun', modulename, error, CommandResult.result);
		if (callback) callback();
	});
}

module.exports.getLastRun = function (collection, modulename, callback) {
	const query = {
		_id: 'lastrun'
	};
	collection.findOne(query, (error, record) => {
		if (error) throw error;
		let retval = new Date('2017-01-01');
		if (record && record[modulename]) {
			retval = record[modulename];
		}
		// log.warn('getLastRun', modulename, retval);
		return callback(retval);
	});
}

class BulkProcessor {
	constructor(collection, batchsize) {
		this.collection = collection;
		this.collection_name = collection.s.namespace;
		this.counter = 0;
		this.batchsize = batchsize
		this.processor = collection.initializeUnorderedBulkOp();
		this.resultobject = {
			inserted: 0,
			upserted: 0,
			matched: 0,
			modified: 0,
			removed: 0
		}
	}

	printErrors(result) {
		result = result.toJSON();
		this.resultobject.inserted += result.nInserted || 0;
		this.resultobject.upserted += result.nUpserted || 0;
		this.resultobject.matched += result.nMatched || 0;
		this.resultobject.modified += result.nModified || 0;
		this.resultobject.removed += result.nRemoved || 0;
		let error = result.writeErrors.reduce((prev, current) => {
			if (!prev) prev = {};
			if (!prev[current.code]) prev[current.code] = {
				count: 0,
				message: current.errmsg.split(': {')[0]
			}
			prev[current.code].count++;
			return prev;
		}, undefined);
		if (error) log.error(error, 'errors');
	}

	flush(callback) {
		// log.debug('flush', this.collection_name, this.processor.s.currentIndex);
		if (this.processor.s.currentIndex) {
			this.processor.execute((error, result) => {
				if (result) this.printErrors(result);
				return setTimeout(() => {
					if (callback) callback();
				}, 2000);
			});
		} else if (callback) {
			return callback();
		}
	}

	check() {
		this.counter++;
		if (this.counter % this.batchsize === 0) {
			// log.debug('bulk', this.collection_name, this.processor.s.currentIndex);
			this.processor.execute((error, result) => {
				if (result) this.printErrors(result);
			});
			this.processor = this.collection.initializeUnorderedBulkOp();
		}
	}

	insert(doc) {
		this.processor.insert(doc);
		return this.check();
	}

	remove(doc) {
		this.processor.find({
			_id: doc._id
		}).removeOne();
		return this.check();
	}

	removeMany(doc) {
		this.processor.find(doc).removeMany();
		return this.check();
	}

	stats() {
		return this.resultobject;
	}
}

module.exports.BulkProcessor = BulkProcessor;