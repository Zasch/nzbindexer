import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { Db, Collection } from 'mongodb';
import * as cluster from 'cluster';
import * as database from './lib/database';

let mongoclient: Db;
let source_collection: Collection;
let target_collection: Collection;
const source = 'files';
const target = 'releases';

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
		return cluster.worker.send("send me a message");
	});
	process.on("disconnect", () => {
		mongoclient.close();
	});
	process.on("message", (key: string) => {
		getDocumentsByArray(source_collection, {
			key: key
		}, (documents: Array<any>) => {
			if (documents.length > 0) {
				return processDocuments(key, documents, () => {
					return cluster.worker.send("send me a message");
				});
			}
			log.warn(`no documents found for key : ${key}`);
			return cluster.worker.send("send me a message");
		});
	});
}

function getDocumentsByArray(collection: Collection, query: any, callback: Function) {
	collection.find(query).toArray(function (err, documents) {
		return callback(documents);
	})
}

function processDocuments(key: string, documents: Array<any>, callback: Function) {
	const total = parseInt(key.split('|')[1], 10);
	let complete = false;
	if (total === documents.length) {
		complete = true;
	} else if (documents.length === total + 1) {
		const min_index = documents.reduce((prev, current) => {
			return Math.min(prev, current.file.index);
		}, 999999999999);
		if (min_index === 0) {
			// console.log('also complete', key);
			complete = true;
		}
	}
	if (!complete) {
		// console.log('NOT', key)
		return callback();
	}
	if (complete) {
		// console.log('yes', key);
		// return callback();
		return moveComplete(key, documents, callback);
	}
}

// function compareNumbers(a, b) {
// 	return a - b;
// }

function extractExtension(filename: string, subject: string) {
	var elements = /(\.)([0-9a-z]{1,5})$/.exec(filename);
	if (elements && elements.length === 3) {
		return elements[2];
	} else {
		log.error('extension unknown', subject)
		return 'unknown';
	}
}

function mapFile(current: any) {
	return {
		subject: current.subject,
		filename: current.filename,
		date: current.date,
		totalbytes: current.totalbytes,
		parts: current.parts,
		complete: current.complete
	}
}

function mapDocuments(documents: Array<any>) {
	let sorted = documents.sort((a, b) => {
		// return compareNumbers(a.part.index, b.part.index);
		return a.file.index - b.file.index;
	});
	let retval = sorted[0];
	delete retval.messageid;
	delete retval.errors;
	retval.created = new Date();
	retval.files = [];
	retval.extensions = {};
	const newObject = sorted.reduce((previous, current) => {
		if (previous._id !== current._id) {
			previous.totalbytes += current.totalbytes;
		}
		const extension = extractExtension(current.filename, current.subject);
		if (!previous.extensions[extension]) {
			previous.extensions[extension] = 0
		}
		previous.extensions[extension]++;
		if (current.complete === false) {
			previous.complete = false;
		}
		previous.files.push(mapFile(current));
		return previous;
	}, retval);
	delete newObject.file;
	newObject._id = newObject.regex + '|' + newObject.email + '|' + newObject.date.getTime();
	// console.log('newObject', newObject);
	return newObject;
}

function moveComplete(key: string, documents: Array<any>, callback: Function) {
	let source_operations = [];
	let target_operations = [];
	const mapped = mapDocuments(documents);
	log.info(`Creating: ${key}`);
	source_operations.push(deleteManyByKey(key))
	target_operations.push(insertOne(mapped));
	// return callback();
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
				// log.info(`result: ${target}, ${result.nInserted} inserted`);
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
				// log.info(`result: ${source}, ${result.nRemoved} removed`);
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

function insertOne(doc: string) {
	return {
		insertOne: {
			document: doc
		}
	};
}