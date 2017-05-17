import { logger } from './logger';
const log = logger.child({
	file: __filename.split(/[\\/]/).pop()
});
import { MongoClient, Collection, MongoCallback, UpdateWriteOpResult, UnorderedBulkOperation, BulkWriteResult } from 'mongodb';
import { config } from '../config';

export function connect(callback: Function) {
	MongoClient.connect(config.mongodb, <any>{
		socketTimeoutMS: 3600000
	}, (err, db) => {
		if (err) {
			log.error("error", err);
			return callback(null);
		}
		return callback(db);
	});
}

export function insertDocument(collection: Collection, doc: any, callback: Function) {
	collection.insertOne(doc, callback);
}

export function upsertDocument(collection: Collection, doc: any, callback: MongoCallback<UpdateWriteOpResult>) {
	collection.updateOne({
		_id: doc._id
	}, doc, {
			upsert: true
		}, callback);
}

export function updateLastRun(collection: Collection, modulename: string, callback: Function) {
	const query = {
		_id: 'lastrun'
	};
	const set: any = {};
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

export function getLastRun(collection: Collection, modulename: string, callback: Function) {
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

export class BulkProcessor {
	counter = 0;
	processor: UnorderedBulkOperation;
	collection_name: string;
	resultobject = {
		inserted: 0,
		upserted: 0,
		updated: 0,
		modified: 0,
		removed: 0
	};
	results: any;

	constructor(private collection: any, private batchsize: number) {
		this.collection_name = collection.s.namespace;
		this.processor = collection.initializeUnorderedBulkOp();
		this.results = Object.assign(this.resultobject);
	}

	printErrors(result: BulkWriteResult) {
		this.results.inserted += result.nInserted || 0;
		this.results.modified += result.nModified || 0;
		this.results.removed += result.nRemoved || 0;
		this.results.updated += result.nUpdated || 0;
		this.results.upserted += result.nUpserted || 0;
		result.getWriteErrors().forEach((err: any) => {
			// if (err.errmsg.indexOf('_id_ dup key') !== -1) log.error(err.errmsg);
			log.error(err.errmsg);
		});

		// let error = result.getWriteErrors().reduce((prev: any, current: any) => {
		// 	// console.log(current.)
		// 	if (!prev) prev = {};
		// 	if (!prev[current.code]) prev[current.code] = {
		// 		count: 0,
		// 		message: current.errmsg.split(': {')[0]
		// 	}
		// 	prev[current.code].count++;
		// 	return prev;
		// }, undefined);
		// if (error) log.error(error, 'errors');
		this.results = Object.assign(this.resultobject);
	}

	flush(callback?: Function) {
		// log.debug('flush', this.collection_name, this.processor.s.currentIndex);
		if (this.processor.length > 0) {
			this.processor.execute((error, result) => {
				if (result) this.printErrors(result);
				return setTimeout(() => {
					if (callback) callback();
				}, 2000);
			});
			this.processor = this.collection.initializeUnorderedBulkOp();
		} else if (callback) {
			this.processor = this.collection.initializeUnorderedBulkOp();
			return callback();
		} else {
			this.processor = this.collection.initializeUnorderedBulkOp();
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

	insert(doc: any) {
		this.processor.insert(doc);
		return this.check();
	}

	remove(doc: any) {
		this.processor.find({
			_id: doc._id
		}).removeOne();
		return this.check();
	}

	// removeMany(doc: any) {
	// 	this.processor.find(doc).removeMany();
	// 	return this.check();
	// }

	stats() {
		return this.results;
	}
}
