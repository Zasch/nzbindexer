require('./logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const EventEmitter = require('events');
const msgpack = require('msgpack-lite');
const redis = require('./redis');

// class RedisQueue extends EventEmitter {
class RedisQueue {
	constructor(name, binary, storecompleted) {
		// super(); // for EventEmitter
		this.redisclient = redis.connect();
		this.event_handlers = {};
		this.brpoplpushtimeout = 2;
		this.name = name;
		// queue's
		this.storecompleted = storecompleted;
		this.sourcequeue = name;
		this.workqueue = name + '.working';
		this.errorqueue = name + '.error';
		this.completedqueue = name + '.completed';
		// status
		this.started = false;
		this.should_call_drain = false; // to make sure its only called after the first message has arrived;
		// encoders / decoders
		if (binary === true) {
			this.encode = msgpack.encode;
			this.decode = msgpack.decode;
		} else {
			this.encode = JSON.stringify;
			this.decode = JSON.parse;
		}
		this.draintimeout = setTimeout(() => {
			this.should_call_drain = true;
		}, 1000);
		this.previous_depth = undefined;
		this.depthinterval = setInterval(() => {
			this.depth((count) => {
				log.info(`queuedepth[${this.sourcequeue}]: ${count}`);
			});
		}, 2000);
	}

	brpoplpush() {
		const self = this;
		if (self.started) {
			return this.redisclient.brpoplpush(self.sourcequeue, self.workqueue, self.brpoplpushtimeout, function (error, encoded) {
				if (encoded) {
					// console.log('i have a message');
					self.should_call_drain = true;
					self.encoded = encoded;
					self.decoded = self.decode(encoded);
					return self.onMessage(self.decoded);
				} else {
					// console.log('i have NO message');
					if (self.started === true) {
						if (self.should_call_drain === true) {
							self.should_call_drain = false;
							self.onDrain();
						}
						return self.brpoplpush(self.sourcequeue, self.workqueue);
					}
					return;
				}
			});
		}
		return;
	}

	onMessage(message) {
		if (this.event_handlers.message) {
			// console.log('message');
			return this.event_handlers.message(this.decoded, this);
		} else {
			return console.log("No message handler!");
		}
	}

	onDrain() {
		if (this.event_handlers.drain) {
			// console.log('drain');
			return this.event_handlers.drain();
		} else {
			return console.log("No drain handler!");
		}
	}

	on(event, fn) {
		this.event_handlers[event] = fn;
	}

	push(message) {
		this.redisclient.lpush(this.sourcequeue, this.encode(message));
	}

	ok() {
		// console.log('ok');
		this.redisclient.lrem(this.workqueue, -1, this.encoded);
		if (this.storecompleted) {
			this.redisclient.lpush(this.completedqueue, this.encoded);
		}
		return this.brpoplpush(this.sourcequeue, this.workqueue);
	}

	error() {
		// console.log('error');
		this.redisclient.lrem(this.workqueue, -1, this.encoded);
		this.redisclient.lpush(this.errorqueue, this.encoded);
		return this.brpoplpush(this.sourcequeue, this.workqueue);
	}

	retry(immediately) {
		// console.log('retry');
		this.redisclient.lrem(this.workqueue, -1, this.encoded);
		if (immediately) {
			this.redisclient.rpush(this.sourcequeue, this.encoded);
		} else {
			this.redisclient.lpush(this.sourcequeue, this.encoded);
		}
		return this.brpoplpush(this.sourcequeue, this.workqueue);
	}

	start() {
		this.started = true;
		return this.brpoplpush();
	}

	stop(callback) {
		this.started = false;
		clearTimeout(this.draintimeout);
		clearInterval(this.depthinterval);
		setTimeout(() => {
			this.redisclient.quit();
			if (callback) callback();
		}, 100);
	}

	pause() {
		this.started = false;
	}

	depth(callback) {
		this.redisclient.llen(this.sourcequeue, (error, count) => {
			if (count !== this.previous_depth) {
				this.previous_depth = count;
				if (callback) {
					callback(count);
				}
				return;
			}
			return;
		});
	}
}

module.exports = RedisQueue;