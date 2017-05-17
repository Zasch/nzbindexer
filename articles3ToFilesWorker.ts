import { logger } from './lib/logger';
const filename = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db, Collection } from 'mongodb';
// import { Timer } from './lib/timer';
import * as cluster from 'cluster';
import * as database from './lib/database';
let mongoclient: Db;
let source_collection: Collection;
let target_collection: Collection;
const source = 'articles';
const target = 'files';

let groupfirst: Date;
let grouplast: Date;

if (cluster.isWorker) {
	const worker_id = cluster.worker.id;
	process.title = `node ${filename} worker[${worker_id}]`;
	startWorker();
}

function startWorker() {
	database.connect((db: Db) => {
		mongoclient = db;
		source_collection = mongoclient.collection(source);
		target_collection = mongoclient.collection(target);
		getFirstLast(source_collection, (result: any) => {
			const hours = 1000 * 60 * 60; //number of milliseconds in an hour
			groupfirst = new Date(result.first.getTime() + (6 * hours));
			grouplast = new Date(result.last.getTime() - (6 * hours));
			// console.log(result.first, '-->', groupfirst, result.last, '-->', grouplast);
			cluster.worker.send("send me a message");
		});
	});
	process.on("disconnect", () => {
		mongoclient.close();
	});
	process.on("message", (key: string) => {
		getDocumentsByArray(source_collection, {
			key: key
		}, (documents: Array<any>) => {
			return processDocuments(key, documents, () => {
				return cluster.worker.send("send me a message");
			});
		});
	});
}

function processDocuments(key: string, documents: Array<any>, callback: Function) {
	const total = parseInt(key.split('|')[1], 10);
	let complete = false;
	if (total === documents.length) {
		complete = true;
	} else if (documents.length === total + 1) {
		const min_index = documents.reduce((prev, current) => {
			return Math.min(prev, current.part.index);
		}, 999999999999);
		// console.log(min_index, key);
		if (min_index === 0) {
			console.log('also complete, doing nothing', key);
			// complete = true;
		}
	}
	if (!complete) {
		let first: any, last: any;
		documents.forEach((doc: any) => {
			if (!first) first = doc.date;
			if (!last) last = doc.date;
			if (doc.date < first) first = doc.date;
			if (doc.date > last) last = doc.date;
		});
		if (first >= groupfirst && last <= grouplast) {
			// console.log(`${key} should be marked complete `, total - documents.length, 'part missing');
			complete = true;
		} else {
			// console.log(`${key} have to wait some more`);
		}
	}
	if (!complete) {
		return callback();
	}
	if (complete) {
		return moveComplete(key, documents, callback);
	}
}

// function compareNumbers(a, b) {
// 	return a - b;
// }

function mapDocuments(documents: Array<any>) {
	let sorted = documents.sort((a, b) => {
		// return compareNumbers(a.part.index, b.part.index);
		return a.part.index - b.part.index;
	});
	let indexes = sorted.reduce((previous: any, current: any) => {
		previous.push(current.part.index);
		return previous;
	}, []);
	let retval = sorted[0];
	let first = retval.part.index;
	let total = retval.part.total;
	let startat: number = 1, endat: number = total;
	if (first === 0) {
		startat = 0;
		endat = total - 1;
	}
	let missing = [];
	for (let i = startat; i <= endat; i++) {
		if (indexes.indexOf(i) === -1) {
			missing.push(i);
		}
	}
	if (missing.length === 0) {
		retval.complete = true;
	} else {
		retval.complete = false;
		retval.missing = missing;
	}
	retval._id = retval.filename + '|' + retval.file.index + 'of' + retval.file.total + '|' + retval.id;
	retval.key = retval.regex + '|' + retval.file.total + '|' + retval.email;
	// if (retval.efnet_title) {
	// 	retval.key = retval.efnet_title + '|' + retval.file.total + '|' + retval.email;
	// }
	retval.created = new Date();
	retval.totalbytes = 0;
	retval.parts = [];
	const newObject = sorted.reduce((previous, current) => {
		previous.totalbytes += current.bytes;
		previous.parts.push({
			index: current.part.index,
			messageid: current.messageid,
			bytes: current.bytes
		});
		return previous;
	}, retval);
	delete newObject.errors;
	delete newObject.part;
	delete newObject.bytes;
	// console.log('newObject', newObject);
	return newObject;
}

function moveComplete(key: string, documents: Array<any>, callback: Function) {
	let source_operations = [];
	let target_operations = [];
	const mapped = mapDocuments(documents);
	// mapDocuments(documents);
	// return callback();
	log.info(`Creating: ${key}`);
	source_operations.push(deleteManyByKey(key))
	target_operations.push(insertOne(mapped));
	return executeOperations(source_operations, target_operations, callback);
}

function executeOperations(source_operations: Array<any>, target_operations: Array<any>, callback: Function) {
	let total_ops = (target_operations.length > 0) ? 1 : 0;
	total_ops += (source_operations.length > 0) ? 1 : 0;
	if (total_ops === 0) {
		return callback();
	}
	let ops_completed = 0;
	if (target_operations.length > 0) {
		// console.log('target_operations', target_operations.length);
		target_collection.bulkWrite(target_operations, {
			ordered: false
		}, function (error, result) {
			ops_completed++;
			if (error) {
				log.error(error);
			}
			if (result) {
				// log.info(`result: ${target}, ${result.insertedCount} inserted`);
			}
			if (ops_completed === total_ops) {
				return callback();
			}
		});
	}
	if (source_operations.length > 0) {
		// console.log('source_operations', source_operations.length);
		source_collection.bulkWrite(source_operations, {
			ordered: false
		}, function (error, result) {
			ops_completed++;
			if (error) {
				log.error(error);
			}
			if (result) {
				// log.info(`result: ${source}, ${result.deletedCount} removed`);
			}
			if (ops_completed === total_ops) {
				return callback();
			}
		});
	}
}

// bulk helpers
// function deleteOne(id) {
// 	return {
// 		deleteOne: {
// 			filter: {
// 				_id: id
// 			}
// 		}
// 	};
// }

function deleteManyByKey(key: string) {
	return {
		deleteMany: {
			filter: {
				key: key
			}
		}
	};
}

function insertOne(doc: any) {
	return {
		insertOne: {
			document: doc
		}
	};
}

function getFirstLast(collection: Collection, callback: Function) {
	let callbacks = 0;
	let retval: any = {
		first: undefined,
		last: undefined
	}
	getFirst(collection, (date: Date) => {
		retval.first = date;
		callbacks++;
		if (callbacks == 2) return callback(retval);
		return;

	})
	getLast(collection, (date: Date) => {
		retval.last = date;
		callbacks++;
		if (callbacks == 2) return callback(retval);
		return;
	})
}

function getFirst(collection: Collection, callback: Function) {
	collection.find().sort({
		date: 1
	}).limit(1).toArray((error, record) => callback(record[0].date));
}

function getLast(collection: Collection, callback: Function) {
	collection.find().sort({
		date: -1
	}).limit(1).toArray((error, record) => callback(record[0].date));
}


function getDocumentsByArray(collection: Collection, query: any, callback: Function) {
	collection.find(query).toArray(function (err, documents) {
		return callback(documents);
	})
}