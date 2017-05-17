import { logger } from './logger';
const log = logger.child({
	file: __filename.split(/[\\/]/).pop()
});

import { ArticleStatus, movie_types, regexes, replace_strings } from '../data/consts'

export class SubjectExtracter {
	subject: string;
	record: any;
	constructor(subject: string) {
		this.subject = subject;
		this.record = {
			newsubject: subject,
			errors: {}
		};
		this.process();
		return this.record;
	}

	process() {
		this.extractefnetID();
		this.cleanStrings();
		this.extractFilename();
		this.extractExtension();
		this.extractFileIndex();
		this.extractPartIndex();
		this.extractRegex();
		// this.extractFilesize();
		// this.cleanDuplicateFilenames();
		this.setRecordStatus();
		this.processErrors();
	}

	cleanWhiteSpace() {
		this.record.newsubject = this.record.newsubject.replace(/  /g, " ").trim();
	}

	extractefnetID() {
		const efnetid: any = /^\[(\d{5,7})\]/.exec(this.record.newsubject);
		if (efnetid && efnetid[1]) {
			this.record.efnetid = efnetid[1];
			const result = /^(\[\d{5,7}\])([ -]?)(\[[a-z]+\])([ -]?)(\[[#a-z\.@]*\])([ -]?)\[ ([a-z0-9\#!,. _\-\(\)]*) \]/.exec(this.record.newsubject);
			if (result && result.length === 8) {
				this.record.efnet_title = result[7].trim();
			}
		};
	}

	stripDoubleQuotes(old: string){
		let retval = old;
		let rr = /^\"(.*)\"$/.exec(old);
		if (rr && rr.length === 2) {
			// console.log('after', rr[1]);
			retval = rr[1];
		}
		return retval;
	}

	extractFilename() {
		var regex = /\"(.*)\"/g;
		var fn = regex.exec(this.record.newsubject);
		if (fn && fn.length === 2) {
			this.record['filename'] = this.stripDoubleQuotes(fn[1]);
			this.record.newsubject = this.record.newsubject.replace(fn[0], '');
			return this.cleanWhiteSpace();
		}
		regex = /([0-9a-z\._-]{10,}\.)(vol\d{1,5}\+\d{1,5}|part\d{1,5}|r\d{1,5}|[0-9a-z]{3,5})(\.[0-9a-z]{1,5})? /g;
		fn = regex.exec(this.record.newsubject);
		if (fn && fn.length === 4) {
			this.record['filename'] = this.stripDoubleQuotes(fn[1] + fn[2] + (fn[3] || ''));
			this.record.newsubject = this.record.newsubject.replace(fn[0], '');
			return this.cleanWhiteSpace();
		}
		regex = /([a-z0-9_-]{1,})(\.jpg)/g;
		fn = regex.exec(this.record.newsubject);
		if (fn && fn.length === 3) {
			this.record['filename'] = this.stripDoubleQuotes(fn[1] + fn[2]);
			// console.log(fn);
			this.record.newsubject = this.record.newsubject.replace(fn[0], '');
			return this.cleanWhiteSpace();
		}
		return this.record.errors['extractFilename'] = this.subject;
	}

	extractExtension() {
		const filename = this.record.filename;
		// console.log(filename);
		if (filename) {
			const needle = filename.lastIndexOf('.');
			// console.log(needle);
			if (needle !== -1) {
				const extension = filename.substring(needle + 1);
				return this.record['extension'] = extension;
			} else {
				return this.record.errors['extractExtension'] = this.subject;
			}
		}
	}

	extractFileIndex() {
		let regex = /\[(file )?(\d{1,4})(\/| of )(\d{1,4})\]/g;
		let fn = regex.exec(this.record.newsubject);
		if (!fn) {
			regex = /\((\d{1,4})(\/| of )(\d{1,4})\)./g;
			fn = regex.exec(this.record.newsubject);
		}
		// if (!fn) {
		// 	regex = /\((\d{1,4})(\/)(\d{1,4})\)$/g;
		// 	fn = regex.exec(this.record.newsubject);
		// }
		// console.log('extractFileIndex', this.record.newsubject, fn);
		if (!fn) {
			return this.record.errors['extractFileIndex'] = this.subject;
		}
		if (fn.length === 5) {
			this.record['file'] = {
				index: parseInt(fn[2], 10),
				total: parseInt(fn[4], 10)
			}
			this.record.newsubject = this.record.newsubject.replace(fn[0], '');
			return this.cleanWhiteSpace();
		}
		if (fn.length === 4) {
			this.record['file'] = {
				index: parseInt(fn[1], 10),
				total: parseInt(fn[3], 10)
			}
			this.record.newsubject = this.record.newsubject.replace(fn[0], '');
			return this.cleanWhiteSpace();
		}
		return this.record.errors['extractFileIndex'] = this.subject;
	}

	extractPartIndex() {
		var regex = /\((\d{1,4})\/(\d{1,4})\)/g;
		var fn = regex.exec(this.record.newsubject);
		if (!fn) {
			return this.record.errors['extractPartIndex'] = this.subject;
		}
		if (fn.length !== 3) {
			return this.record.errors['extractPartIndex'] = this.subject;
		}
		this.record['part'] = {
			index: parseInt(fn[1], 10),
			total: parseInt(fn[2], 10)
		}
		this.record.newsubject = this.record.newsubject.replace(fn[0], '');
		return this.cleanWhiteSpace();
	}

	extractRegex() {
		const filename = this.record.filename;
		const extension = this.record.extension;
		if (filename && extension) {
			const filename_without_extension = filename.replace('.' + extension, '');
			if (filename_without_extension) {
				let result = regexes.reduce((outerprev, outercur) => {
					const retval = outercur.exec(outerprev) ? outerprev.replace(outercur, '') : outerprev;
					return retval.trim();
				}, filename_without_extension);
				const splitted = result.split('.');
				if (splitted.length >= 2) {
					if (movie_types.indexOf(splitted.pop()) !== -1) {
						result = splitted.join('.');
					}
				}
				if (result === '') {
					return this.record.errors['extractRegex'] = this.record.filename;
				}
				return this.record['regex'] = result;
			}
			return this.record.errors['extractRegex'] = this.record.filename;
		}
		if (filename && !extension) {
			return this.record['regex'] = filename
		}
		return this.record.errors['extractRegex'] = this.record.filename;
	}

	cleanStrings() {
		this.record.newsubject = replace_strings.reduce((prev, curr) => {
			return prev.replace(curr.find, curr.replace);
		}, this.record.newsubject);
		return this.cleanWhiteSpace();
	}

	setRecordStatus() {
		delete this.record.newsubject;
		delete this.record.extension;
		this.record.status = ArticleStatus.OK;
		if (this.record.errors.extractFilename) {
			return this.record.status = ArticleStatus.FILENAME_MISSING;
		}
		if (this.record.errors.extractExtension) {
			return this.record.status = ArticleStatus.EXTENSION_MISSING;
		}
		if (this.record.errors.extractRegex) {
			return this.record.status = ArticleStatus.REGEX_MISSING;
		}
		if (this.record.errors.extractPartIndex) {
			return this.record.status = ArticleStatus.PART_MISSING;
		}
		if (this.record.errors.extractFileIndex) {
			return this.record.status = ArticleStatus.FILE_MISSING;
		}
		// if (this.record.regex.match(/^(?=(?:.{25}|.{30}|.{32})$)[0-9a-z_]*$/)) { // this should be safe
		// 	return this.record.spam = true;
		// }
		// if (this.record.regex.match(/^[0-9a-z_]{25}$/)) {
		// 	return this.record.filter = true;
		// }
		// if (this.record.regex.match(/^[0-9a-z]{20}$/)) {
		// 	return this.record.filter = true;
		// }
		// if (this.record.regex.match(/^[0-9a-z_]{10}$/)) { // this *could* filter stuff that we DO want right?
		// 	// return this.record.filter = true;
		// 	return this.record.spam = true;
		// }
	}
	processErrors() {
		if (this.record.status !== ArticleStatus.OK) {
			switch (this.record.status) {
				case ArticleStatus.FILENAME_MISSING:
					this.record.error = 'extractFilename: ' + this.record.errors['extractFilename'];
					log.error('extractFilename', this.record.errors['extractFilename']);
					break;
				case ArticleStatus.EXTENSION_MISSING:
					this.record.error = 'extractExtension: ' + this.record.errors['extractExtension'];
					log.error('extractExtension', this.record.errors['extractExtension']);
					break;
				case ArticleStatus.REGEX_MISSING:
					this.record.error = 'extractRegex: ' + this.record.errors['extractRegex'];
					log.error('extractRegex', this.record.errors['extractRegex']);
					break;
				case ArticleStatus.PART_MISSING:
					this.record.error = 'extractPartIndex: ' + this.record.errors['extractPartIndex'];
					// log.error('extractPartIndex', this.record.errors['extractPartIndex']);
					break;
				case ArticleStatus.FILE_MISSING:
					this.record.error = 'extractFileIndex: ' + this.record.errors['extractFileIndex'];
					// log.error('extractFileIndex', this.record.errors['extractFileIndex']);
					break;
				default:
			}
		}
		delete this.record.errors;
	}
}

// const record = new SubjectExtracter('');
// console.log(record);

// extractFilesize() {
// 	var regex = /(\d{1,5}[.,]\d{1,4})[ ]+(gb|mb|kb)/g;
// 	var fn = regex.exec(this.record.newsubject);
// 	if (!fn || fn.length !== 3) {
// 		return;
// 		// return this.record.errors['extractFilesize'] = this.subject;
// 	}
// 	this.record.filesize = fn[1] + ' ' + fn[2];
// 	this.record.newsubject = this.record.newsubject.replace(fn[0], '');
// 	return this.cleanWhiteSpace();
// }

// cleanDuplicateFilenames() {
// 	if (this.record.filename) {
// 		var cleanednewsubject = this.record.newsubject.replace(/-*[\[\({](.*)[\]\)}]-*/, '$1');
// 		if (this.record.filename.indexOf(cleanednewsubject) !== -1) {
// 			return this.record.newsubject = '';
// 		}
// 		var splitted = cleanednewsubject.split(' ');
// 		var found = true;
// 		splitted.forEach((part: string) => {
// 			if (this.record.filename.indexOf(part) === -1) found = false;
// 		});
// 		if (found) {
// 			return this.record.newsubject = '';
// 		}
// 		// if (this.record.newsubject.length > 0) {
// 		// 	return this.record.errors['remainingSubject'] = '"' + this.record.newsubject + '" --> ' + this.subject;
// 		// }
// 		return;
// 	} else {
// 		return;
// 	}
// }
