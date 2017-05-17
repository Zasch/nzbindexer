import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
// import { config } from './config';
import { Db, Collection } from 'mongodb';
// import { RedisQueue } from './lib/queue';
// import { Timer } from './lib/timer';
// import * as cluster from 'cluster';
// import * as Nitpin from './nitpin';
import * as database from './lib/database';

let files: Collection;
let groupfirst: Date;
let grouplast: Date;

database.connect((db: Db) => {
	files = db.collection('files');
	getFirstLast(files, (result: any) => {
		const hours = 1000 * 60 * 60; //number of milliseconds in an hour
		groupfirst = new Date(result.first.getTime() + (6 * hours));
		grouplast = new Date(result.last.getTime() - (6 * hours));
		files.aggregate([{
			$group: {
				_id: { efnetid: "$efnetid" },   // replace `name` here twice
				uniqueIds: { $addToSet: "$_id" },
				titles: { $addToSet: "$efnet_title" },
				keys: { $addToSet: "$key" },
				mindate: { $min: "$date" },
				maxdate: { $max: "$date" },
				count: { $sum: 1 }
			}
		},
		{
			$match: {
				count: { $gte: 2 }
			}
		}, //{ $limit: 30 }
		{ $sort: { count: -1 } }], (error, aggregations) => {
			if (error) return log.error(error);
			processEfnetReleases(aggregations);
		});
	});
});

function processEfnetReleases(aggregations: Array<any>) {
	let changes: Array<any> = [];
	aggregations.forEach((aggregation: any) => {
		const aantalids = aggregation.uniqueIds.length;
		const complete = aggregation.uniqueIds.every((id: string) => {
			if (id.split('|').length === 3 && id.split('|')[1].split('of').length == 2) {
				return parseInt(id.split('|')[1].split('of')[1], 10) === aantalids;
			} else { return false; }
		});
		if (complete && aggregation.titles.length === 1) {
			console.log(aggregation._id.efnetid, aggregation.titles[0], aggregation.uniqueIds.length, complete);
			aggregation.keys.forEach((key: any) => {
				const splitted = key.split('|');
				if (splitted.length === 3 && splitted[0] !== aggregation.titles[0]) {
					splitted.shift();
					splitted.unshift(aggregation.titles[0]);
					changes.push(updateMany({ key: key }, { key: splitted.join('|') }))
				}
			});
		}
		// if (complete && aggregation.titles.length !== 1) {
		// 	console.log('maxdate - mindate', aggregation.maxdate.getTime() - aggregation.mindate.getTime());
		// 	console.log('grouplast - maxdate', grouplast.getTime() - aggregation.maxdate.getTime());
		// 	console.log('mindate - groupfirst', aggregation.mindate.getTime() - groupfirst.getTime());
		// 	aggregation.keys.forEach((key: any) => {
		// 		const splitted = key.split('|');
		// 		if (splitted.length === 3 && splitted[0] !== aggregation.titles[0]) {
		// 			splitted.shift();
		// 			splitted.unshift(aggregation.titles[0]);
		// 			changes.push(updateMany({ key: key }, { key: splitted.join('|') }))
		// 		}
		// 	});
		// }
	});
	if (changes.length > 0) {
		files.bulkWrite(changes, {
			ordered: false
		}, function (error, result) {
			if (error) {
				log.error(error);
			}
			if (result) {
				log.info(`result: ${result.modifiedCount} modified`);
			}
		});
	} else {
		log.info(`result: didn't have to do anything`);
	}
}

function updateMany(query: any, set: any) {
	return {
		updateMany: {
			filter: query,
			update: { $set: set }
			// upsert: true
		}
	};
}
// function execute(operations: Array<any>) {
// 	collection.bulkWrite(operations, {
// 		ordered: false
// 	}, function (error, result) {
// 		if (error) {
// 			log.error(error);
// 		}
// 		if (result) {
// 			log.info(`result: ${result}`);
// 		}
// 	});
// }

// bulk helpers
// function updateMany(query: any, set: any) {
// 	return {
// 		updateMany: {
// 			filter: query,
// 			update: { $set: set },
// 			upsert: true
// 		}
// 	};
// }

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