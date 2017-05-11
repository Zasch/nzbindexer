"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./logger");
const log = logger_1.logger.child({
    file: __filename.split(/[\\/]/).pop()
});
const mongodb_1 = require("mongodb");
const config_1 = require("../config");
function connect(callback) {
    mongodb_1.MongoClient.connect(config_1.config.mongodb, {
        socketTimeoutMS: 3600000
    }, (err, db) => {
        if (err) {
            log.error("error", err);
            return callback(null);
        }
        return callback(db);
    });
}
exports.connect = connect;
function insertDocument(collection, doc, callback) {
    collection.insertOne(doc, callback);
}
exports.insertDocument = insertDocument;
function upsertDocument(collection, doc, callback) {
    collection.updateOne({
        _id: doc._id
    }, doc, {
        upsert: true
    }, callback);
}
exports.upsertDocument = upsertDocument;
function updateLastRun(collection, modulename, callback) {
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
        if (callback)
            callback();
    });
}
exports.updateLastRun = updateLastRun;
function getLastRun(collection, modulename, callback) {
    const query = {
        _id: 'lastrun'
    };
    collection.findOne(query, (error, record) => {
        if (error)
            throw error;
        let retval = new Date('2017-01-01');
        if (record && record[modulename]) {
            retval = record[modulename];
        }
        // log.warn('getLastRun', modulename, retval);
        return callback(retval);
    });
}
exports.getLastRun = getLastRun;
class BulkProcessor {
    constructor(collection, batchsize) {
        this.collection = collection;
        this.batchsize = batchsize;
        this.counter = 0;
        this.resultobject = {
            inserted: 0,
            upserted: 0,
            updated: 0,
            modified: 0,
            removed: 0
        };
        this.collection_name = collection.s.namespace;
        this.processor = collection.initializeUnorderedBulkOp();
    }
    printErrors(result) {
        this.resultobject.inserted += result.nInserted || 0;
        this.resultobject.modified += result.nModified || 0;
        this.resultobject.removed += result.nRemoved || 0;
        this.resultobject.updated += result.nUpdated || 0;
        this.resultobject.upserted += result.nUpserted || 0;
        let error = result.getWriteErrors().reduce((prev, current) => {
            if (!prev)
                prev = {};
            if (!prev[current.code])
                prev[current.code] = {
                    count: 0,
                    message: current.errmsg.split(': {')[0]
                };
            prev[current.code].count++;
            return prev;
        }, undefined);
        if (error)
            log.error(error, 'errors');
    }
    flush(callback) {
        // log.debug('flush', this.collection_name, this.processor.s.currentIndex);
        if (this.processor.length > 0) {
            this.processor.execute((error, result) => {
                if (result)
                    this.printErrors(result);
                return setTimeout(() => {
                    if (callback)
                        callback();
                }, 2000);
            });
            this.processor = this.collection.initializeUnorderedBulkOp();
        }
        else if (callback) {
            this.processor = this.collection.initializeUnorderedBulkOp();
            return callback();
        }
        else {
            this.processor = this.collection.initializeUnorderedBulkOp();
        }
    }
    check() {
        this.counter++;
        if (this.counter % this.batchsize === 0) {
            // log.debug('bulk', this.collection_name, this.processor.s.currentIndex);
            this.processor.execute((error, result) => {
                if (result)
                    this.printErrors(result);
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
    // removeMany(doc: any) {
    // 	this.processor.find(doc).removeMany();
    // 	return this.check();
    // }
    stats() {
        return this.resultobject;
    }
}
exports.BulkProcessor = BulkProcessor;
//# sourceMappingURL=database.js.map