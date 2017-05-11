const ChildProcess = require('child_process');
const libpath = require('path');
const EventEmitter = require('events');

const NitpinWorker = require('./nitpin_worker');
const Cancellable = require('./cancellable');

class Nitpin extends EventEmitter {
	constructor(config) {
		super(); // event emitter

		var that = this;
		// Host(name) to connect to
		this.host = config.host;
		// Use secure connection?
		this.secure = config.secure || false;
		// Port to use
		this.port = config.port || 119;
		// Username
		this.user = config.user;
		// Password
		this.pass = config.pass;
		// Maximum amount of connections to use
		this.connections = config.connections || config.conn || 1;
		// Enable debugging
		this.debugMode = config.debug || false;
		// Server specific information (cache)
		this.serverinfo = {};
		// Available sockets
		this.sockets = [];
		// Convert all \r\n to \n?
		this.convertNewline = false;
		// Amount of commands waiting for a worker
		this.waiting = 0;
		// Temporary directory
		this.tempdir = config.tempdir || '/tmp/nitpin';
		// The worker request array
		this.requestQueue = [];
		// Listen for free workers
		this.on('freeworker', function gotFreeWorker(worker) {
			var thisEvent = this,
				temp,
				task;
			// If there are no waiting requests, do nothing
			if (!that.requestQueue.length) {
				return;
			}
			// Else, sort them by their order
			that.sortRequestQueue();
			// Get the first entry
			temp = that.requestQueue.shift();
			// Get the task
			temp.fnc(worker);
		});
		this.linkWorker('getHead');
		this.linkWorker('getBody');
		this.linkWorker('getArticle');
		this.linkWorker('stat');
		this.linkWorker('over');
		this.linkWorker('group');
		this.linkWorker('capabilities');
		this.linkWorker('list');
	}

	linkWorker(methodName, hasGroup) {
		this[methodName] = workerMethod;

		function workerMethod() {
			// console.log('workerMethod', arguments);
			var that = this,
				args,
				task;

			const groupName = arguments[0];
			args = arguments;
			this.waiting++;

			task = this.requestFreeSocket(groupName, function gotSocket(err, worker) {
				that.waiting--;
				worker[methodName].apply(worker, args);
			});
			task.on('cancelled', function onCancelled() {
				that.waiting--;
			});
			task.on('paused', function onPaused() {
				that.waiting--;
			});
			task.on('resumed', function onResumed() {
				that.waiting++;
			});
			return task;
		}
	}

	sortRequestQueue() {
		this.requestQueue = this.requestQueue.sort((a, b) => a.weight - b.weight);
	}

	addRequest(fnc, weight) {
		if (weight == null) {
			weight = 10;
		}
		this.requestQueue.push({
			fnc: fnc,
			weight: weight
		});
	}

	info(hostname, key, value) {
		if (!this.serverinfo[hostname]) {
			// console.log("put info", hostname);
			this.serverinfo[hostname] = {};
		}
		if (arguments.length == 2) {
			// console.log("get info", hostname, key, 'is', this.serverinfo[hostname][key]);
			if (this.serverinfo[hostname][key] == null) {
				return null;
			}
			return this.serverinfo[hostname][key];
		} else {
			// console.log("set info", hostname, key, '=', value);
			this.serverinfo[hostname][key] = value;
		}
	}

	connect() {
		return this.getSocket();
	}

	getSocket(groupname) {

		var upstarts = [],
			results = [],
			that = this,
			result,
			sock,
			b,
			i;

		for (i = 0; i < this.sockets.length; i++) {
			sock = this.sockets[i];
			b = sock.busy;
			if (!b) {
				// If this is not busy, and the group matched, return it immediatly
				if (sock.currentGroup == groupname) {
					return sock;
				}
				results.push(sock);
			}
			// Keep the starting sockets separate
			if (b == 1 && !sock.authenticated) {
				upstarts.push(sock);
			}
		}

		// If there are non-busy sockets, return that
		if (results.length) {
			result = results[0];
		} else if (!results.length && this.sockets.length < this.connections) {
			// See if there are any upstarting sockets
			if (upstarts.length && that.waiting == 0) {
				result = upstarts[0];
			} else {
				// Create a new connection if there are no available sockets
				// and we haven't used up all our allowed ones
				result = new NitpinWorker(this);
			}
		} else {
			// All sockets are busy and we can't create new ones, return the least busy
			results = this.sockets.slice(0);
			results = results.sort((a, b) => b.busy - a.busy);
			// See if any of the least busy ones are on the same group
			for (i = 0; i < ~~(results.length / 2); i++) {
				if (results[i].currentGroup == groupname) {
					result = results[i];
				}
			}
			// Just use the least busy one, then
			result = results[0];
		}
		return result;
	}

	requestFreeSocket(groupname, callback, weight) {
		var that = this,
			task = new Cancellable();

		setImmediate(() => {
			var result;
			// If the task has already been cancelled, exit already
			if (task.cancelled) {
				return;
			}
			result = that.getSocket(groupname);
			if (result && !result.busy) {
				return callback(null, result);
			}
			that.addRequest(function gotFreeWorker(worker) {
				// Execute this if not yet cancelled
				task.execute(function () {
					callback(null, worker);
				});
			}, weight);
		});

		// var result;
		// // If the task has already been cancelled, exit already
		// if (task.cancelled) {
		// 	return;
		// }
		// result = that.getSocket(groupname);
		// if (result && !result.busy) {
		// 	return callback(null, result);
		// }
		// that.addRequest(function gotFreeWorker(worker) {
		// 	// Execute this if not yet cancelled
		// 	task.execute(function () {
		// 		callback(null, worker);
		// 	});
		// }, weight);
		return task;
	}

	getBodyWeight(groupName, id, weight, callback) {
		var that = this,
			groupName,
			task;

		this.waiting++;
		task = this.requestFreeSocket(groupName, function gotSocket(err, worker) {
			that.waiting--;
			worker.getBody(groupName, id, callback);
		}, weight);
		task.on('cancelled', function onCancelled() {
			that.waiting--;
		});
		task.on('paused', function onPaused() {
			that.waiting--;
		});
		task.on('resumed', function onResumed() {
			that.waiting++;
		});
		return task;
	}
}

module.exports = Nitpin;