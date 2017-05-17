
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


if (!process.argv[2]) {
	log.error("Please supply an id...");
	process.exit(1);
}
const _id = process.argv[2];

let collection: Collection;

database.connect((db: Db) => {
	collection = db.collection('releases');
	// collection.find({ regex:/2x95zca67k8py3b4wvu/, messageid: /^((?!(fx\d{1,4}\.am\d{1,4})).)*$/ }).sort({ _id: 1 }).toArray((err: any, results: any) => {
	collection.findOne({ _id: _id }, (err: any, record: any) => {
		log.info(record);
		if (!record) {
			log.error("No release foud with that id");
			process.exit(1);
		}
		const nzb = getReleaseNZB(record);
		console.log(nzb);
	});
});

function getReleaseNZB(record: any) {
	var nzb = '';
	nzb += `<?xml version="1.0" encoding="iso-8859-1" ?>\n`;
	nzb += `<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.0//EN" "http://www.nzbindex.com/nzb-1.0.dtd">\n`;
	nzb += `<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">\n`;
	record.files.forEach((file: any) => {
		nzb += getFileNZB(record.group, record.from, file);
	});
	nzb += `</nzb>\n`;
	return nzb;
}

function getFileNZB(group: any, from: any, file: any) {
	var nzb = '';
	nzb += `<file poster="${from}" date="${Math.round(file.date.getTime() / 1000)}" subject="${htmlEscape(file.subject)}">\n`;
	nzb += `<groups>\n`;
	nzb += `<group>${group}</group>\n`;
	nzb += `</groups>\n`;
	nzb += `<segments>\n`;
	file.parts.forEach((part: any) => {
		nzb += `<segment bytes="${part.bytes}" number="${part.index}">${part.messageid}</segment>\n`;
	});
	nzb += `</segments>\n`;
	nzb += `</file>\n`;
	return nzb;
};

function htmlEscape(str: string) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
};