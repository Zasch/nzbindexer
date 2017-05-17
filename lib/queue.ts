import {logger} from './logger';
const log = logger.child({
	file: __filename.split(/[\\/]/).pop()
});

import {} from 'redis';
const redis = require('./redis');

export interface EventHandler {
	[key: string]: Function;
}

// class RedisQueue extends EventEmitter {
export class RedisQueue {
	name: string;
	redisclient = redis.connect();
	event_handlers: EventHandler = {};
	brpoplpushtimeout = 4;
	// queue's
	storecompleted: boolean;
	sourcequeue: string;
	workqueue: string;
	errorqueue: string;
	completedqueue: string;
	previous_depth: number;
	// status
	started = false;
	should_call_drain = false; // to make sure its only called after the first message has arrived;
	// encoders / decoders
	encode = JSON.stringify;
	encoded: any;
	decode = JSON.parse;
	decoded: any;
	draintimeout: any;
	depthinterval: any;

	constructor(name: string, binary: boolean, storecompleted: boolean) {
		this.name = name;
		storecompleted = storecompleted;
		this.sourcequeue = name;
		this.workqueue = name + '.working';
		this.errorqueue = name + '.error';
		this.completedqueue = name + '.completed';
		// super(); // for EventEmitter
		this.draintimeout = setTimeout(() => {
			this.should_call_drain = true;
		}, 2000);
		this.depthinterval = setInterval(() => {
			this.depth((count: number) => {
				log.info(`queuedepth[${this.sourcequeue}]: ${count}`);
			});
		}, 2000);
	}

	brpoplpush(sourcequeue: any, workqueue: any) {
		const self = this;
		if (self.started) {
			return this.redisclient.brpoplpush(self.sourcequeue, self.workqueue, self.brpoplpushtimeout, function (error: any, encoded:string) {
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

	onMessage(message: any) {
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

	on(event: string, fn: Function) {
		this.event_handlers[event] = fn;
	}

	push(message: any) {
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

	retry(immediately: boolean) {
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
		return this.brpoplpush(this.sourcequeue, this.workqueue);
	}

	stop(callback?: Function) {
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

	depth(callback: Function) {
		this.redisclient.llen(this.sourcequeue, (error: any, count: number) => {
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
