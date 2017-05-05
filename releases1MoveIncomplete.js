require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const lokijs = require('lokijs');
const lokidb = new lokijs('sandbox');
const lokiitems = lokidb.addCollection('items');
const util = require('util');
const database = require('./lib/database');

const fields = ['subject', 'filename', 'date', 'email', 'complete'];
let mongoclient;

database.connect((db) => {
	mongoclient = db;
	return getReleases((documents) => {
		return moveIncompleteReleases(documents);
	})
});

function getReleases(callback) {
	const source = mongoclient.collection('releases');
	source.find().toArray(function (err, documents) {
		return callback(documents);
	})
}

function moveIncompleteReleases(documents) {
	releases = new database.BulkProcessor(mongoclient.collection('releases'), 5000);
	releases_complete = new database.BulkProcessor(mongoclient.collection('releases_complete'), 5000);

	lokiitems.insert(documents);
	log.info('loaded', lokiitems.count(), 'releases from database');
	const regexes = [
		/[ ._-]sc\d{1,3}/,
		/[0-9]$/,
		/[a-z]$/
	];
	const completed = regexes.reduce((prev, current) => {
		const items = processRegex(lokiitems, current);
		items.forEach((item) => {
			item.value.ids.forEach((id) => {
				// log.debug(id, 'can be deleted');
				releases.remove({
					_id: id
				});
			});
		});
		// delete logic here
		return prev.concat(items);
	}, []);
	const toinsert = completed.map((item) => {
		const m = mapObject(item.value.items, item.key);
		return m;
	});
	const unique = toinsert.reduce((prev, current) => {
		if (prev.indexOf(current) === -1) {
			prev.push(current);
		} else {
			log.debug('duplicate', current);
		}
		return prev;
	}, []);
	unique.forEach((release) => {
		log.debug('creating release:', release.regex);
		releases_complete.insert(release);
	});
	log.info('inserted', unique.length);
	releases_complete.flush();
	releases.flush(() => {
		setTimeout(()=>{
			mongoclient.close();
		},500);
	});
}

function map(regex, obj) {
	const splitted = obj._id.split('|');
	const old_regex = splitted.shift();
	// console.log('splitted', splitted);
	return {
		key: old_regex.replace(regex, '') + '|' + splitted[1],
		// key: old_regex.replace(regex, ''),
		id: obj._id,
		value: obj.value
	};
}

function reduce(array) {
	result = {};
	array.forEach((item) => {
		if (!result[item.key]) {
			result[item.key] = {
				total: 0,
				ids: [],
				items: []
			};
		}
		result[item.key].ids.push(item.id);
		result[item.key].total++;
		result[item.key].items.push(item.value);
	})
	// console.log(Object.keys(result).length);
	return result;
}

function processRegex(lokiitems, regex) {
	let retval = [];
	const lokiresult = lokiitems.mapReduce(map.bind(null, regex), reduce);
	Object.keys(lokiresult).forEach((key) => {
		const value = lokiresult[key];
		if (value.total > 1) {
			const total = value.items[0].file.total;
			let index = 99999999;
			const reduced = value.items.reduce((acc, current) => {
				if (current.file.index < index) {
					index = current.file.index;
				}
				return acc + current.filecount;
			}, 0);
			if (total === reduced) {
				retval.push({
					key,
					value
				});
				// console.log(key, 'is complete', value.ids);
			} else if (index === 0 && reduced === total + 1) {
				console.log('also complete', key, index, total, reduced);
			}
		} else {
			// console.log('not -->', key)
		}
	});
	return retval;
}

function mapObject(reducedObject, key) {
	const tmp = reducedObject[0].files[0];
	let retval = {
		_id: key + '|' + tmp.date.getTime(),
		totalbytes: 0,
		filecount: 0,
		extensions: {},
		files: [],
		regex: key,
		combined: true
	};
	fields.forEach((field) => {
		retval[field] = tmp[field];
	});
	reducedObject.forEach((release) => {
		retval.totalbytes += release.totalbytes;
		retval.filecount += release.filecount;
		retval.extensions = release.files.reduce((acc, file) => {
			if (!acc[file.extension]) {
				acc[file.extension] = 1;
			} else {
				acc[file.extension]++;
			}
			return acc;
		}, retval.extensions);
		retval.files = retval.files.concat(release.files);
	});
	return retval;
}