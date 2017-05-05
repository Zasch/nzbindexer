require('./logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});

const regexes = [
	// /\.par2$/,
	/\.vol\d{1,5}\+\d{1,5}$/,
	/\.rar$/,
	/\.part\d{1,5}$/,
	/\.r\d{1,5}$/,
	/[ ._-]sample$/,
	/([ ._-]thumb[s]?|[ ._-]{1,2}screen[s]?[\d]{0,4}|[ ._-]r|[ ._-]f|[ ._-]b|[ ._-]back|[ ._-]front|[ ._-]rear|[ ._-]index|[ ._-]info|[ ._-]cover[s]?)$/
];
const movie_types = ['3gp', 'asf', 'avi', 'f4v', 'm4v', 'mkv', 'mov', 'mp2', 'mp3', 'mp4', 'mpeg', 'mpg', 'ogg', 'rm', 'vob', 'wmv'];

var replace_strings = [{
	find: 'join us @',
	replace: ''
}, {
	find: '<<best provider hitnews>>',
	replace: ''
}, {
	find: '<3 https://house-of-porn.com number one porn source <3',
	replace: ''
}, {
	find: 'https://house-of-porn.com/',
	replace: ''
}, {
	find: 'brothers-of-usenet.net',
	replace: ''
}, {
	find: 'empfehlen useindex.net/',
	replace: ''
}, {
	find: 'free invites by b-deadangel',
	replace: ''
}, {
	find: '>>>no.1 nzb indexer<<<',
	replace: ''
}, {
	find: '<<house-of-usenet.com>>',
	replace: ''
}, {
	find: '<<house-of-usenet>>',
	replace: ''
}, {
	find: '<<<hitnews.com>>>',
	replace: ''
}, {
	find: '<<hitnews>>',
	replace: ''
}, {
	find: 'www.usenet-space-cowboys.online',
	replace: ''
}, {
	find: 'usenet-space-cowboys.online',
	replace: ''
}, {
	find: '[u4a]',
	replace: ''
}, {
	find: '- description -',
	replace: ''
}, {
	find: '-always take the post from the first and original poster!-',
	replace: ''
}, {
	find: '<-> empfehlen <->',
	replace: ''
}, {
	find: '-[#a.b.erotica@efnet]',
	replace: ''
}, {
	find: '-[full]',
	replace: ''
}, {
	find: / - /g,
	replace: ' '
}, {
	find: / -/g,
	replace: ' '
}, {
	find: /- /g,
	replace: ' '
}, {
	find: /-\[/g,
	replace: ' ['
}, {
	find: /\]-/g,
	replace: '] '
}, {
	find: /\[ /g,
	replace: '['
}, {
	find: / \]/g,
	replace: ']'
}, {
	find: /\[\]/g,
	replace: ' '
}, {
	find: / yenc/g,
	replace: ''
}, {
	find: /yenc /g,
	replace: ''
}, {
	find: /^\[\d{6}\]/,
	replace: ''
}];

class SubjectExtracter {
	constructor(subject) {
		this.subject = subject;
		this.record = {
			newsubject: subject,
			errors: {}
		};
		this.process();
		return this.record;
	}

	process() {
		this.cleanStrings();
		this.extractFilename();
		this.extractFileIndex();
		this.extractPartIndex();
		this.extractExtension();
		this.extractRegex();
		this.extractFilesize();
		this.cleanDuplicateFilenames();
		this.isOk();
		this.printErrors();
	}

	cleanWhiteSpace() {
		this.record.newsubject = this.record.newsubject.replace(/  /g, " ").trim();
	}

	extractFilename() {
		var regex = /\"(.*)\"/g;
		var fn = regex.exec(this.record.newsubject);
		if (!fn) {
			return this.record.errors['extractFilename'] = this.subject;
		}
		if (fn.length !== 2) {
			return this.record.errors['extractFilename'] = this.subject;
		}
		this.record['filename'] = fn[1];
		this.record.newsubject = this.record.newsubject.replace(fn[0], '');
		this.cleanWhiteSpace();
	}

	extractExtension() {
		const filename = this.record.filename;
		if (filename) {
			const needle = filename.lastIndexOf('.');
			if (needle !== -1) {
				const extension = filename.substring(needle + 1);
				return this.record['extension'] = extension;
			} else {
				return this.record.errors['extractExtension'] = this.subject;
			}
		}
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
		return this.record.errors['extractRegex'] = this.record.filename;
	}

	extractFileIndex() {
		// const str = "aaa aaa";
		// var r = /(a{1,6})(.*)(a{1,6})/g;
		// console.log(r.exec(str));

		let regex = /\[(\d{1,4})(\/| of )(\d{1,4})\]/g;
		let fn = regex.exec(this.record.newsubject);
		// if (!fn) {
		// 	regex = /^\((\d{1,4})\/(\d{1,4})\)/g;
		// 	fn = regex.exec(this.record.newsubject);
		// }
		if (!fn) {
			// regex = /\((\d{1,4})\/(\d{1,4})\)/g;
			regex = /\((\d{1,4})(\/| of )(\d{1,4})\)./g;
			fn = regex.exec(this.record.newsubject);
		}
		// console.log('extractFileIndex', this.record.newsubject, fn);
		if (!fn) {
			return this.record.errors['extractFileIndex'] = this.subject;
		}
		if (fn.length !== 4) {
			return this.record.errors['extractFileIndex'] = this.subject;
		}
		this.record['file'] = {
			index: parseInt(fn[1], 10),
			total: parseInt(fn[3], 10)
		}
		this.record.newsubject = this.record.newsubject.replace(fn[0], '');
		this.cleanWhiteSpace();
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
		this.cleanWhiteSpace();
	}

	extractFilesize() {
		var regex = /(\d{1,5}[.,]\d{1,4})[ ]+(gb|mb|kb)/g;
		var fn = regex.exec(this.record.newsubject);
		if (!fn || fn.length !== 3) {
			return this.record.errors['extractFilesize'] = this.subject;
		}
		this.record.filesize = fn[1] + ' ' + fn[2];
		this.record.newsubject = this.record.newsubject.replace(fn[0], '');
		this.cleanWhiteSpace();
	}

	cleanDuplicateFilenames() {
		if (this.record.filename) {
			var cleanednewsubject = this.record.newsubject.replace(/-*[\[\({](.*)[\]\)}]-*/, '$1');
			if (this.record.filename.indexOf(cleanednewsubject) !== -1) {
				return this.record.newsubject = '';
			}
			var splitted = cleanednewsubject.split(' ');
			var found = true;
			splitted.forEach((part) => {
				if (this.record.filename.indexOf(part) === -1) found = false;
			});
			if (found) {
				return this.record.newsubject = '';
			}
			if (this.record.newsubject.length > 0) {
				return this.record.errors['remainingSubject'] = '"' + this.record.newsubject + '" --> ' + this.subject;
			}
		} else {
			return;
		}
	}

	cleanStrings() {
		this.record.newsubject = replace_strings.reduce((prev, curr) => {
			return prev.replace(curr.find, curr.replace);
		}, this.record.newsubject);
		this.cleanWhiteSpace();
	}

	isOk() {
		if (this.record.errors.extractFilename) {
			return this.record.filter = true;
		}
		if (this.record.errors.extractRegex) {
			return this.record.filter = true;
		}
		if (this.record.errors.extractFileIndex) {
			return this.record.filter = true;
		}
		if (this.record.errors.extractPartIndex) {
			return this.record.filter = true;
		}
		if (this.record.regex.match(/^(?=(?:.{25}|.{30}|.{32})$)[0-9a-z_]*$/)) { // this should be safe
			// return this.record.filter = true;
			return this.record.spam = true;
		}
		// if (this.record.regex.match(/^[0-9a-z_]{25}$/)) {
		// 	return this.record.filter = true;
		// }
		// if (this.record.regex.match(/^[0-9a-z]{20}$/)) {
		// 	return this.record.filter = true;
		// }
		if (this.record.regex.match(/^[0-9a-z_]{10}$/)) { // this *could* filter stuff that we DO want right?
			// return this.record.filter = true;
			return this.record.spam = true;
		}
	}
	printErrors() {
		if (!this.record.filter) {
			const print = [
				// 'extractFilename',
				// 'extractRegex',
				// 'extractFileIndex',
				// 'extractPartIndex',
				'extractExtension'
				// 'remainingSubject'
				// do not use, too much errors:
				// 'extractFilesize'
			];
			print.forEach((error) => {
				if (this.record.errors[error]) log.error(error, this.record.errors[error]);
				// if (this.record.errors[error]) console.log(this);
			})
		}
	}

}

// const record = new SubjectExtracter('[534916]-[full]-[#a.b.erotica@efnet]-[ 28_[electrosluts].dolly.leigh,.veruca.james.birthday.girl.electric.spankings,.fucking,.and.tons.of.pussy.licking!.2016.09.08 ]-[01/47] - "28_[electrosluts].dolly.leigh,.veruca.james.birthday.girl.electric.spankings,.fucking,.and.tons.of.pussy.licking!." yenc (102/106)');
// console.log(record);

module.exports = SubjectExtracter;

// extractRegexOld() {
// 	const filename = this.record.filename;
// 	const extension = this.record.extension;
// 	if (filename && extension) {
// 		const filename_without_extension = filename.replace('.' + extension, '');
// 		if (filename_without_extension) {
// 			let regex = /\.vol\d{1,5}\+\d{1,5}$/g;
// 			let fn = regex.exec(filename_without_extension);
// 			if (!fn) {
// 				regex = /\.part\d{1,5}$/g;
// 				fn = regex.exec(filename_without_extension);
// 			}
// 			if (!fn) {
// 				regex = /\.r\d{1,5}$/g;
// 				fn = regex.exec(filename_without_extension);
// 			}
// 			if (!fn) {
// 				if (['jpg', 'jpeg'].indexOf(extension) === -1) {
// 					regex = /_\d{1,4}$/g;
// 					fn = regex.exec(filename_without_extension);
// 				}
// 			}
// 			if (fn) {
// 				this.record['regex'] = filename_without_extension.replace(regex, '').replace(/([ ._-]sample|\.rar)$/, '').trim();
// 			} else {
// 				this.record['regex'] = filename_without_extension.replace(/([ ._-]sample|\.rar)$/, '').trim();
// 			}
// 			const splitted = this.record['regex'].split('.');
// 			if (splitted.length >= 2) {
// 				const e = splitted.pop();
// 				if (movie_types.indexOf(e) !== -1) {
// 					this.record['regex'] = splitted.join('.');
// 				}
// 			}
// 			this.record['regex'] = this.record['regex'].replace(/([ ._-]thumb[s]?|[ ._-]{1,2}screen[s]?[\d]{0,4}|[ ._-]r|[ ._-]f|[ ._-]b|[ ._-]back|[ ._-]front|[ ._-]rear|[ ._-]index|[ ._-]info|[ ._-]cover[s]?)$/, '').trim()
// 			if (this.record['regex'] === '') {
// 				return this.record.errors['extractRegex'] = this.record.filename;
// 			}
// 			return;
// 		} else {
// 			return this.record.errors['extractRegex'] = this.record.filename;
// 		}
// 	}
// 	return this.record.errors['extractRegex'] = this.record.filename;
// }