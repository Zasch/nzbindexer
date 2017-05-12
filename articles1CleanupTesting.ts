// import { logger } from './lib/logger';
// const filename: string | undefined = __filename.split(/[\\/]/).pop();
// const log = logger.child({
// 	file: filename
// });
// import { config } from './config';
// import { Range } from './types';
import { Db } from 'mongodb';
// import { RedisQueue } from './lib/queue';
// import { Timer } from './lib/timer';
// import * as cluster from 'cluster';
// import * as Nitpin from './nitpin';
import * as database from './lib/database';

database.connect((db: Db) => {
	const collection = db.collection('articles_filtered');
	collection.find({ messageid: /^((?!(fx\d{1,4}\.am\d{1,4})).)*$/ }).sort({ _id: 1 }).toArray((err: any, results: any) => {
		// deze zijn in principe goed!
		console.log('fetch complete', results.length);
		processGoede(results)
	});
	collection.find({ spam: { $exists: true }, messageid: /(fx\d{1,4}\.am\d{1,4})$/ }).count(false, (err: any, result: any) => {
		// deze zouden verwijderd moeten worden
		console.log(1, result);
	});
	collection.find({ spam: { $exists: false }, messageid: /(fx\d{1,4}\.am\d{1,4})/ }).sort({ _id: 1 }).toArray((err: any, result: any) => {
		// deze zouden ook verwijderd moeten worden
		console.log(2, result.length);
	});
});

function processGoede(results: Array<any>) {
	const filtered = results;
	// const filtered = results.filter((record: any) => {
	// 	return record.regex === 'videoot-gggscrlttsctthimss';
	// });
	const reduced = filtered.reduce((prev: any, current: any) => {
		// console.log(prev, current);
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
	// console.log(reduced);
	Object.keys(reduced).forEach((release: string) => {
		processOneGoede(release, reduced[release]);
	})
}

function processOneGoede(id: string, release: any) {
	// console.log(id);
	var files = Object.keys(release.files).sort();
	// if (files[0].endsWith('.par2')) total++;
	var jpg = files.filter((file: string) => {
		return file.endsWith('.jpg');
	});
	var nzb = files.filter((file: string) => {
		return file.endsWith('.nzb');
	});
	var rars = files.filter((file: string) => {
		return file.endsWith('.rar');
	});
	var par2 = files.filter((file: string) => {
		return file.endsWith('.par2');
	});
	if (files.length === rars.length + par2.length + jpg.length + nzb.length) {
		// if (files.length > 1) console.log('ok', 'total', files.length, 'rar', rars.length, 'par2', par2.length, id);
	} else {
		// if (files.length > 1) console.log('notok', 'total', files.length, 'rar', rars.length, 'par2', par2.length, id);
		if (files.length > 1) console.log('notok', id, release);
	}
}