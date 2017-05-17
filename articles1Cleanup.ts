import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
// import { config } from './config';
import { Db, Collection } from 'mongodb';
import { ArticleStatus } from './data/consts';
// import { RedisQueue } from './lib/queue';
// import { Timer } from './lib/timer';
// import * as cluster from 'cluster';
// import * as Nitpin from './nitpin';
import * as database from './lib/database';

let collection: Collection;
let groupfirst: Date;
let grouplast: Date;

database.connect((db: Db) => {
	collection = db.collection('articles');
	getFirstLast(collection, (result: any) => {
		const hours = 1000 * 60 * 60; //number of milliseconds in an hour
		groupfirst = new Date(result.first.getTime() + (6 * hours));
		grouplast = new Date(result.last.getTime() - (6 * hours));
		collection.find({
			$and: [{
				status: ArticleStatus.FILE_MISSING
			}, {
				date: { $gte: groupfirst }
			}, {
				date: { $lte: grouplast }
			}]
		}).sort({ _id: 1 }).toArray((err: any, results: any) => {
			log.info(`fetch complete: ${results.length}`);
			processGoede(results)
		});
	});
});

function processGoede(results: Array<any>) {
	const filtered = results;
	// const filtered = results.filter((record: any) => {
	// 	return record.regex === '';
	// });
	const reduced = filtered.reduce((prev: any, current: any) => {
		if (!prev[current.regex]) {
			prev[current.regex] = {
				current: current,
				files: {}
			}
		}
		if (!prev[current.regex].files[current.filename]) {
			prev[current.regex].files[current.filename] = 0;
		}
		prev[current.regex].files[current.filename]++;
		return prev
	}, {});
	// log.info(reduced);
	Object.keys(reduced).forEach((release: string) => {
		processOneGoede(release, reduced[release]);
	})
}

function processOneGoede(id: string, release: any) {
	var files = Object.keys(release.files).sort();
	let min = 999999;
	let max = 0
	var rars = files.filter((file: string) => {
		const r = /\.part(\d{1,5})\./.exec(file);
		if (r) {
			const value = parseInt(r[1], 10);
			if (value < min) min = value;
			if (value > max) max = value;
		}
		return file.endsWith('.rar');
	});
	if (min !== 999999 && max !== 0 && min < 2 && max > 1 && max - min === rars.length - min) {
		if (files.length > 1) {
			log.info('ok', release.current.subject);
			let operations: Array<any> = [];
			files.forEach((file: any, index: number) => {
				operations.push(updateMany({
					filename: file
				}, {
						status: ArticleStatus.OK,
						file: {
							index: index + 1,
							total: files.length
						}
					}));
			});
			execute(operations);
		}
	} else {
		// if (files.length > 1) console.log('notok', 'total', files.length, 'rar', rars.length, 'par2', par2.length, id);
		// if (files.length > 1) console.log('notok', id, min, max);
	}
}

function execute(operations: Array<any>) {
	collection.bulkWrite(operations, {
		ordered: false
	}, function (error, result) {
		if (error) {
			log.error(error);
		}
		if (result) {
			log.info(`result: ${result.result}`);
		}
	});
}

// bulk helpers
function updateMany(query: any, set: any) {
	return {
		updateMany: {
			filter: query,
			update: { $set: set },
			upsert: true
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

// db.files.aggregate([
//   { $group: {
//     _id: { efnetid: "$efnetid" },   // replace `name` here twice
//     uniqueIds: { $addToSet: "$_id" },
//     count: { $sum: 1 } 
//   } }, 
//   { $match: { 
//     count: { $gte: 2 } 
//   } },
//   { $sort : { count : -1} },
//   { $limit : 30 }
// ]).pretty();