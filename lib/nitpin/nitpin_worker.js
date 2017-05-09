const async = require('async');
const EventEmitter = require('events');

const CompressedStream = require('./streams/compressed');
const MultilineStream = require('./streams/multiline');
const ResponseStream = require('./streams/response');

const Queue = require('./queue');
const regulate = require('./regulate');
const timebomb = require('./timebomb');

let sids = 0;

class NitpinWorker extends EventEmitter {
	constructor(parent) {
		// console.log('creating worker');
		super(); // eventemitter
		var that = this,
			sockType = require(parent.secure ? 'tls' : 'net'),
			attempts = 0,
			socket;

		// Socket id (not related to the parent array)
		this.id = sids++;
		// Workers add themselves to the parent
		parent.sockets.push(this);
		// Emit an event to let the parent know a new worker has been made
		parent.emit('worker', this);
		// Create a reference to the parent
		this.parent = parent;
		// Initialize the socket
		// this.socket = socket = new sockType.Socket();
		this.socket = socket = sockType.connect(parent.port, parent.host);
		// Create the initial connection
		// makeConnection();
		// Are we connected?
		this.connected = false;
		// Are we authenticated?
		this.authenticated = false;
		// New queue
		this.comboqueue = new Queue();
		// Socket communication queue
		this.commqueue = new Queue();
		// Allow maximum 1 running function at a time
		this.comboqueue.limit = 1;
		this.commqueue.limit = 1;
		// The communication queue can start now
		this.commqueue.start();
		// Current group
		this.currentGroup = null;
		// Current group info
		this.groupInfo = {};
		// Authenticate
		that.authenticate();
		// Has this been explicitly set as busy?
		this.explicitBusy = null;
		// When was the last activity?
		this.lastActivity = Date.now();
		// Server info
		this.server = {
			host: parent.host,
			secure: parent.secure,
			port: parent.port,
			user: parent.user,
			pass: parent.pass
		};

		function makeConnection() {
			if (attempts > 1) {
				that.emit('error', new Error('Reconnection attempt ' + attempts));
			}
			socket.connect(parent.port, parent.host);
			attempts++;
		}

		// Listen to timeout messages
		this.socket.on('timeout', function onTimeout() {
			// console.log('timeout');
			that.socket.end();
		});

		// Listen to error messages
		this.socket.on('error', function onError(err) {
			// See if this is an EMFILE error
			if (err.message.indexOf('EMFILE') > -1) {
				return setTimeout(makeConnection, 1000);
			}
			that.emit('error', err);
			that.cleanup();
		});

		// Clean up when the server closes the connection
		this.socket.on('end', function onEnd(e) {
			that.cleanup();
		});

		// Listen to the initial message
		this.socket.once('data', function initialData(data) {
			// Initial message received, connection has been made
			that.connected = true;
			// Start the queue
			that.comboqueue.start();
			// Emit the connected event
			that.emit('connected');
		});

		// Remove this worker after 30 seconds of innactivity
		this.intervalId = setInterval(function removingWorker() {
			// Only remove this if it isn't busy and if there are other connected sockets
			if (!that.busy && parent.sockets.length > 1 && (Date.now() - that.lastActivity) > 30000) {
				// Submit the QUIT command
				that.submit('QUIT', function gotQuitResponse(err, response) {
					// Destroy the actual socket
					that.socket.destroy();
				});
				that.cleanup();
			}
		}, 31000);
	}

	debug() {
		if (!this.parent.debugMode) {
			return false;
		}
		return this.parent.debug('__debug__', 'NITPINWORKER', arguments);
	}

	destroy() {
		// Submit the QUIT command
		this.socket.write('QUIT\r\n');
		// Destroy the socket
		this.socket.destroy();
		// Cleanup
		this.cleanup();
	}

	cleanup() {
		var sockid;
		// Get the id of this socket in the parent's array
		sockid = this.parent.sockets.indexOf(this);
		if (sockid > -1) {
			// Remove it from that array
			this.parent.sockets.splice(sockid, 1);
		}
		// Clear the interval
		clearInterval(this.intervalId);
	}

	info(key, value) {
		if (arguments.length == 1) {
			return this.parent.info(this.server.host, key);
		} else {
			return this.parent.info(this.server.host, key, value);
		}
	}

	get busy() {
		var count;
		// Explicit busy should not be used
		if (this.explicitBusy) {
			return 10;
		}
		// Count combo's currently running and in the queue
		count = this.comboqueue.running + this.comboqueue._queue.length;
		if (count) {
			return count;
		}
		// Count communications currently running and in the queue
		count = this.commqueue.running + this.commqueue._queue.length;
		if (count) {
			return count;
		}
		return 0;
	}

	set busy(val) {
		console.log('set', val);
		this.explicitBusy = val;
	}

	poke() {
		this.lastActivity = Date.now();
	}

	announce() {
		var that = this;

		setImmediate(() => {
			if (that.comboqueue._queue.length == 0 && that.comboqueue.running == 0) {
				// Emit an event this worker is no longer busy
				that.parent.emit('freeworker', that);
			}
		});
		// (function doAnnounce() {
		// 	if (that.comboqueue._queue.length == 0 && that.comboqueue.running == 0) {
		// 		// Emit an event this worker is no longer busy
		// 		that.parent.emit('freeworker', that);
		// 	}
		// })();
	}
	queue(callback, fnc) {
		// console.log('callback', typeof callback, typeof fnc);
		var that = this;
		if (typeof fnc !== 'function') {
			fnc = callback;
			callback = null;
		}
		if (typeof callback !== 'function') {
			callback = function (err) {
				if (err) {
					throw err;
				}
			}
		}
		this.comboqueue.add(function doCommandInQueue(done) {
			// Execute the given function
			fnc.call(that, function whenDone(err, response) {
				// We got a response, call the user's callback
				callback.apply(that, arguments);
				// Indicate this queue entry is finished
				done();
				// Announce if it's free
				that.announce();
			});
		});
	}

	_submit(command, multiline, compressed, callback) {
		var that = this,
			socket = this.socket,
			pipe = socket;
		if (typeof multiline == 'function') {
			callback = multiline;
			compressed = false;
			multiline = false;
		} else if (typeof compressed == 'function') {
			callback = compressed;
			compressed = false;
		}
		// Use the commqueue so only 1 message-response can happen at a time
		this.commqueue.add(function doCommand(done) {
			var response,
				bomb,
				len;
			// Create finish function that handles everything when done
			function finish(err) {
				var buf,
					i;
				// Defuse the bomb (does nothing when called after explosion)
				bomb.defuse();
				// Remove connected pipes
				socket.unpipe();
				// Remove listeners
				socket.removeAllListeners('data');
				socket.removeAllListeners('error');
				// Make sure the newline is removed from the end of the buffer
				if (response && response.buffer) {
					buf = response.buffer;
					len = buf.length;
					if (buf[len - 2] == 13 && buf[len - 1] == 10) {
						buf = buf.slice(0, -2);
					}
					// Remove dot stuffing
					for (i = 2; i < buf.length; i++) {
						if (buf[i - 2] == 13 && buf[i - 1] == 10 && buf[i] == 46 && buf[i + 1] == 46) {
							buf = Buffer.concat([buf.slice(0, i), buf.slice(i + 1)]);
						}
					}
					// Convert all \r\n to \n if wanted
					if (that.parent.convertNewline) {
						for (i = 2; i < buf.length; i++) {
							if (buf[i - 2] == 13 && buf[i - 1] == 10) {
								buf = Buffer.concat([buf.slice(0, i - 2), buf.slice(i - 1)]);
							}
						}
					}
					if (response) {
						response.buffer = buf;
					}
				}
				// Call queue done
				done();
				// If there's an error, callback with that
				if (err) {
					// If the error is a timeout, destroy this worker just in case
					if (err && err.message && err.message.indexOf('Timeout') > -1) {
						that.destroy();
					}
					callback(err);
					that.debug('Instance', that.id, 'error:', err);
				} else {
					callback(null, response);
				}
			}
			// Make sure finish only gets called one time
			finish = regulate(finish);
			// Create a timebomb: explode when we haven't called back in 10 seconds // 1 minute
			bomb = timebomb(10000, finish);

			if (compressed) {
				pipe = pipe.pipe(new CompressedStream());
				pipe.on('error', finish);
			}
			if (multiline) {
				pipe = pipe.pipe(new MultilineStream());
				pipe.on('error', finish);
			}
			pipe = pipe.pipe(new ResponseStream(multiline));
			// Receive response object (same one on each push)
			pipe.on('data', function gotData(data) {
				response = data;
			});
			// When the end event has fired, the response is complete
			pipe.on('end', finish);
			pipe.on('error', finish);
			// Reset the activity counter
			that.poke();
			// Write the command to the socket
			socket.write(command + '\r\n');
		});
	}

	parseArticle(article, hasHead, hasBody) {
		var headers,
			lastkey,
			lines,
			head,
			temp,
			body,
			id;

		if (typeof article != 'string') {
			if (Array.isArray(article)) {
				article = article.join('\r\n');
			} else {
				if (article.buffer) {
					article = article.buffer;
				}
				if (Buffer.isBuffer(article)) {
					article = article.toString('binary');
				}
			}
		}

		if (hasHead == null) {
			hasHead = true;
		}

		if (hasBody == null) {
			hasBody = true;
		}

		if (hasHead) {
			headers = {}; // Parsed headers go here
			id = article.indexOf('\r\n\r\n');
			head = article.slice(0, id);
			body = article.slice(id + 4);
			lines = head.split('\n');

			for (i = 1; i < lines.length; i++) {
				temp = lines[i];
				if (temp.indexOf(':') == -1) {
					headers[lastkey] += '\n' + temp;
					continue;
				} else {
					temp = temp.split(':');
				}
				lastkey = temp[0].toLowerCase().trim();
				headers[lastkey] = temp[1].trim();
			}
		} else {
			body = article;
		}
		return {
			headers: headers,
			head: head,
			body: body
		};
	}

	normalizeArticleId(id) {
		var error;
		if (typeof id == 'number') {
			// Make sure this article number is actually available
			if (id < this.groupInfo.low || id > this.groupInfo.high) {
				error = 'This article number is not available';
			}
		} else {
			if (id[0] !== '<') {
				id = '<' + id + '>';
			}
		}
		return {
			id: id,
			error: error
		};
	}

	submit(command, multiline, compressed, callback) {
		if (this.authenticated) {
			return this._submit(command, multiline, compressed, callback);
		} else {
			this.on('authenticated', function authenticated() {
				this._submit(command, multiline, compressed, callback);
			});
		}
	}

	authenticate(callback) {
		// console.log('authenticate', typeof callback);
		var that = this;

		function finish(err, response) {
			that.announce();
			if (callback) callback(err, response);
		}
		if (!this.parent.user) {
			this.emit('authenticated');
			this.authenticated = true;
			return finish(null);
		}
		this.queue(callback, function gotQueue(done) {
			that._submit('AUTHINFO USER ' + that.parent.user, false, false, function gotUserResponse(err, response) {
				if (err) {
					return done(err);
				}
				if (response.status === 381) {
					if (that.parent.pass == null) {
						return done(new Error('A password is required'));
					}
					return that._submit('AUTHINFO PASS ' + that.parent.pass, false, false, function gotPassResponse(err, response) {
						if (err) {
							return done(err);
						}

						that.authenticated = true;
						done(null);
						that.emit('authenticated');
					});
				}
				that.authenticated = true;
				done(null, response);
				that.emit('authenticated');
			});
		});
	}

	_stat(group, id, callback) {
		var that = this;
		that._group(group, false, () => {
			var cmd = 'STAT ',
				art = that.normalizeArticleId(id);

			if (art.error) {
				return callback(new Error(art.error));
			}
			cmd += art.id;

			that.submit(cmd, false, false, function (err, response) {
				var temp;
				if (err) {
					return callback(err);
				}
				temp = response.message.split(' ');
				callback(null, Number(temp[0]), temp[1]);
			});
		});
	}

	stat(group, id, callback) {
		this.queue(callback, function (done) {
			this._stat(group, id, done);
		});
	}

	_getHead(group, id, callback) {

		var that = this;

		Fn.series(function changeGroup(next) {
			that._group(group, false, next);
		}, function getHead() {

			var cmd = 'HEAD ',
				art = that.normalizeArticleId(id);

			if (art.error) {
				return callback(new Error(art.error));
			}

			cmd += art.id;

			that.submit(cmd, true, false, function submittedHeadCmd(err, response) {

				var temp;

				if (err) {
					return callback(err);
				}

				temp = that.parseArticle(response, true, false);

				callback(null, temp.headers, temp.head);
			});
		});
	}

	getHead(group, id, callback) {
		this.queue(callback, function (done) {
			this._getHead(group, id, done);
		});
	}

	_getBody(group, id, callback) {

		var that = this;

		Fn.series(function changeGroup(next) {
			that._group(group, false, next);
		}, function getHead() {

			var cmd = 'BODY ',
				art = that.normalizeArticleId(id);

			if (art.error) {
				return callback(new Error(art.error));
			}

			cmd += art.id;

			that.submit(cmd, true, false, function submittedBodyCmd(err, response) {

				var temp;

				if (err) {
					return callback(err);
				}

				temp = that.parseArticle(response, false, true);

				callback(null, temp.body);
				temp = null;
				response = null;
			});
		});
	}

	getBody(group, id, callback) {
		this.queue(callback, function doneGettingBody(done) {
			this._getBody(group, id, done);
		});
	}

	_getArticle(group, id, callback) {

		var that = this;

		Fn.series(function changeGroup(next) {
			that._group(group, false, next);
		}, function getArticle() {

			var cmd = 'ARTICLE ',
				art = that.normalizeArticleId(id);

			if (art.error) {
				return callback(new Error(art.error));
			}

			cmd += art.id;

			that.submit(cmd, true, false, function submittedArticleCmd(err, response) {

				var temp;

				if (err) {
					return callback(err);
				}

				temp = that.parseArticle(response);

				callback(null, temp.headers, temp.body);
			});
		});
	}

	getArticle(group, id, callback) {
		this.queue(callback, function gotArticle(done) {
			this._getArticle(group, id, done);
		});
	}

	_list(wildmat, force, callback) {

		var that = this,
			cache,
			cmd;

		if (typeof wildmat == 'function') {
			callback = wildmat;
			wildmat = false;
			force = false;
		} else if (typeof wildmat == 'boolean') {
			callback = force;
			force = wildmat;
			wildmat = false;
		} else if (typeof wildmat == 'string') {
			if (typeof force == 'function') {
				callback = force;
				force = false;
			}
		}

		cmd = 'LIST ACTIVE';

		if (wildmat) {
			cmd += ' ' + wildmat;
		} else if (!force) {
			cache = this.info('activelist');

			if (cache) {
				callback(null, cache);
			}
		}

		this.submit(cmd, true, false, function gotList(err, response) {

			var result,
				temp,
				type,
				rec,
				i;

			if (err) {
				return callback(err);
			}

			result = {};

			for (i = 0; i < response.lines.length; i++) {
				temp = response.lines[i].split(' ');

				rec = {
					name: temp[0],
					high: temp[1],
					low: temp[2]
				};

				if (temp[3] == 'n') {
					rec.post = false;
					rec.moderated = false;
				} else if (temp[3] == 'y') {
					rec.post = true;
					rec.moderated = false;
				} else if (temp[3] == 'm') {
					rec.post = true;
					rec.moderated = true;
				}

				result[temp[0]] = rec;
			}

			if (!wildmat) {
				that.info('activelist', result);
			}

			callback(null, result);
		});
	}

	list(wildmat, force, callback) {
		// console.log('list', typeof callback);
		if (typeof wildmat == 'function') {
			callback = wildmat;
			wildmat = '';
			force = false;
		} else if (typeof wildmat == 'boolean') {
			callback = force;
			force = wildmat;
			wildmat = '';
		} else if (typeof wildmat == 'string') {
			if (typeof force == 'function') {
				callback = force;
				force = false;
			}
		}

		this.queue(callback, function gotLists(done) {
			this._list(wildmat, force, done);
		});
	}

	_group(groupname, force, callback) {

		var that = this;

		if (typeof force == 'function') {
			callback = force;
			force = false;
		}

		// Send cached data when we're already in this group
		if (!force && that.currentGroup == groupname) {
			return callback(null, this.groupInfo);
		}

		this.submit('GROUP ' + groupname, function changedGroup(err, response) {

			var info,
				temp;

			if (err) {
				return callback(err);
			}

			info = {};
			temp = response.message.split(' ');

			// Get available number of articles
			info.available = Number(temp[0]);

			// Get lowest number
			info.low = Number(temp[1]);

			// Get highest number
			info.high = Number(temp[2]);

			// Add groupname
			info.name = groupname;

			that.groupInfo = info;

			that.currentGroup = groupname;
			callback(null, info);
		});
	}

	group(groupname, force, callback) {
		// console.log('group', typeof callback);
		var that = this;
		if (typeof force == 'function') {
			callback = force;
			force = false;
		}
		this.queue(callback, function (done) {
			that._group(groupname, force, done);
		});
	}

	_capabilities(force, callback) {

		var that = this,
			cap;

		if (typeof force == 'function') {
			callback = force;
			force = false;
		}

		cap = this.info('capabilities');

		if (!force && cap) {
			return callback(null, cap);
		}

		this.submit('CAPABILITIES', true, false, function gotCapabilities(err, response) {

			var result,
				temp,
				i;

			if (err) {
				return callback(err);
			}

			result = {};

			for (i = 0; i < response.lines.length; i++) {
				temp = response.lines[i].toLowerCase();
				that.info('cap.' + temp, true);
				result[temp] = true;
			}

			that.info('capabilities', result);

			callback(null, result);
		});
	}

	capabilities(force, callback) {
		// console.log('capabilities', typeof callback);
		if (typeof force == 'function') {
			callback = force;
			force = false;
		}

		this.queue(callback, function (done) {
			this._capabilities(force, done);
		});
	}

	_format(callback) {

		var that = this,
			val = this.info('listformat');
		if (val) {
			return callback(null, val);
		}

		// Get the format
		this.submit('LIST OVERVIEW.FMT', true, false, function gotFormat(err, response) {

			var temp,
				i;

			if (err) {
				return callback(err);
			}

			val = [{
				name: 'id',
				flag: ''
			}];

			for (i = 0; i < response.lines.length; i++) {
				temp = response.lines[i];

				if (!temp) {
					continue;
				}

				temp = temp.split(':');

				if (temp[0]) {
					val.push({
						name: temp[0].toLowerCase(),
						flag: temp[1].toLowerCase()
					});
				} else {
					val.push({
						name: temp[1].toLowerCase(),
						flag: 'meta'
					});
				}
			}

			that.info('listformat', val);

			callback(null, val);
		});
	}

	_over(group, first, last, callback) {

		var that = this,
			hasXzver = this.info('cap.xzver'),
			format,
			lines,
			r;

		async.series([
			function changeGroup(next) {
				that._group(group, false, next);
			},
			function getFormat(next) {
				that._format(next);
			},
			function Xzver(next) {
				// Get the set listformat
				format = that.info('listformat');

				// Try Xzver
				if (hasXzver == null || hasXzver) {
					that.submit('XZVER ' + first + '-' + last, true, true, function gotXzverResponse(err, response) {

						if (err) {
							// Xzver failed
							that.info('cap.xzver', false);
							return next();
						}

						r = response;
						lines = response.lines;
						next();
					});
				} else {
					next();
				}
			},
			function Xover(next) {

				if (!lines) {
					that.submit('XOVER ' + first + '-' + last, true, false, function gotXoverResponse(err, response) {

						if (err) {
							return next(err);
						}

						r = response;
						lines = response.lines;
						next();
					});
				} else {
					next();
				}
			}
		], function done(err) {
			// console.log('fetch complete', lines.length);
			var results,
				record,
				field,
				temp,
				line,
				conf,
				i,
				j;

			if (err) {
				return callback(err);
			}

			results = [];
			for (i = 0; i < lines.length; i++) {
				line = lines[i].split('\t');
				record = {};
				for (j = 0; j < line.length; j++) {
					temp = line[j].toLowerCase();
					// Get the field format config
					conf = format[j];
					// See if the name is part of the field
					if (conf.flag == 'full') {
						if (temp.indexOf(':') !== -1) {
							temp = temp.substring(temp.indexOf(':') + 1).trim();
						} else {
							temp = temp.trim();
						}
					}
					if (/\0/.test(temp)) {
						console.log(temp, 'contains null character');
						temp = temp.replace(/\0/, '');
					}
					if (/\n/.test(temp)) {
						console.log(temp, 'contains newline character');
						temp = temp.replace(/\n/, '');
					}
					if (/\f/.test(temp)) {
						console.log(temp, 'contains formfeed character');
						temp = temp.replace(/\f/, '');
					}
					if (/\r/.test(temp)) {
						console.log(temp, 'contains carriagereturn character');
						temp = temp.replace(/\r/, '');
					}
					if (/\t/.test(temp)) {
						console.log(temp, 'contains tab character');
						temp = temp.replace(/\t/, ' ');
					}
					if (/\v/.test(temp)) {
						console.log(temp, 'contains verticaltab character');
						temp = temp.replace(/\v/, '');
					}
					if (conf.name === 'message-id') conf.name = 'messageid';
					if (conf.name === 'messageid') {
						temp = temp.replace('<', '').replace('>', '');
						// if (temp.indexOf('@') === -1) {
						// 	console.log('error', temp);
						// }
						// record['application'] = temp.split('@')[1];
					}
					if (conf.name === 'bytes') temp = parseInt(temp, 10);
					// if (conf.name === 'lines') temp = parseInt(temp, 10);
					if (conf.name === 'date') temp = new Date(temp);
					if (conf.name === 'from') {
						record['email'] = temp.split(' ').reduce((acc, current) => {
							if (current.indexOf('@') !== -1) {
								return current.replace('<', '').replace('>', '');
							} else {
								return acc;
							}
						});
					}
					if (conf.name === 'xref') {
						const splitted = temp.split(' ');
						splitted.shift();
						temp = splitted;
						// splitted = splitted.map((crosspost)=>crosspost.split)
					}
					if (conf.name === 'subject') {}
					if (conf.name === 'id') conf.name = '';
					if (conf.name === 'lines') conf.name = '';
					if (conf.name === 'references') conf.name = '';
					// if (conf.name === 'messageid') {
					// 	record['_id'] = temp;
					// } else {
					// 	if (conf.name) record[conf.name] = temp;
					// }
					if (conf.name) record[conf.name] = temp;
				}
				// console.log(record);
				results.push(record);
			}
			callback(null, results);
		})
	}

	over(group, first, last, callback) {
		// console.log('over', this.id, group, first, last);
		var that = this;
		if (typeof first == 'function') {
			callback = first;
			first = 1;
			last = 10;
		} else if (typeof last == 'function') {
			callback = last;
			last = Number(first) + 10;
		}
		this.queue(callback, function gotOverResponse(done) {
			that._over(group, first, last, done);
		});
	}
}

// function setBusy(val) {
// 	this.explicitBusy = val;
// }

module.exports = NitpinWorker;