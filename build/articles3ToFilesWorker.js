"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./lib/logger");
const filename = __filename.split(/[\\/]/).pop();
const log = logger_1.logger.child({
    file: filename
});
// import { Timer } from './lib/timer';
const cluster = require("cluster");
const database = require("./lib/database");
let mongoclient;
let source_collection;
let target_collection;
const source = 'articles';
const target = 'files_complete';
if (cluster.isWorker) {
    const worker_id = cluster.worker.id;
    process.title = `node ${filename} worker[${worker_id}]`;
    startWorker();
}
function startWorker() {
    database.connect((db) => {
        mongoclient = db;
        source_collection = mongoclient.collection(source);
        target_collection = mongoclient.collection(target);
        cluster.worker.send("send me a message");
    });
    process.on("disconnect", () => {
        mongoclient.close();
    });
    process.on("message", (key) => {
        getDocumentsByArray(source_collection, {
            key: key
        }, (documents) => {
            return processDocuments(key, documents, () => {
                return cluster.worker.send("send me a message");
            });
        });
    });
}
function getDocumentsByArray(collection, query, callback) {
    collection.find(query).toArray(function (err, documents) {
        return callback(documents);
    });
}
function processDocuments(key, documents, callback) {
    const total = parseInt(key.split('|')[1], 10);
    let complete = false;
    if (total === documents.length) {
        complete = true;
    }
    else if (documents.length === total + 1) {
        const min_index = documents.reduce((prev, current) => {
            return Math.min(prev, current.part.index);
        }, 999999999999);
        console.log(min_index);
        if (min_index === 0) {
            console.log('also complete', key);
            // complete = true;
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
function mapDocuments(documents) {
    let sorted = documents.sort((a, b) => {
        // return compareNumbers(a.part.index, b.part.index);
        return a.part.index - b.part.index;
    });
    let retval = sorted[0];
    delete retval.errors;
    delete retval.part;
    retval.key = retval.regex + '|' + retval.file.total + '|' + retval.email;
    retval.created = new Date();
    retval.totalbytes = 0;
    retval.parts = [];
    const newObject = sorted.reduce((previous, current) => {
        previous.totalbytes += current.bytes;
        previous.parts.push(current.messageid);
        return previous;
    }, retval);
    delete newObject.bytes;
    // console.log('newObject', newObject);
    return newObject;
}
function moveComplete(key, documents, callback) {
    let source_operations = [];
    let target_operations = [];
    const mapped = mapDocuments(documents);
    mapped.complete = true;
    source_operations.push(deleteManyByKey(key));
    target_operations.push(insertOne(mapped));
    return executeOperations(source_operations, target_operations, callback);
}
function executeOperations(source_operations, target_operations, callback) {
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
function deleteManyByKey(key) {
    return {
        deleteMany: {
            filter: {
                key: key
            }
        }
    };
}
function insertOne(doc) {
    return {
        insertOne: {
            document: doc
        }
    };
}
//# sourceMappingURL=articles3ToFilesWorker.js.map