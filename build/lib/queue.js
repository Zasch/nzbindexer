"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./logger");
const log = logger_1.logger.child({
    file: __filename.split(/[\\/]/).pop()
});
const redis = require('./redis');
// class RedisQueue extends EventEmitter {
class RedisQueue {
    constructor(name, binary, storecompleted) {
        this.redisclient = redis.connect();
        this.event_handlers = {};
        this.brpoplpushtimeout = 2;
        // status
        this.started = false;
        this.should_call_drain = false; // to make sure its only called after the first message has arrived;
        // encoders / decoders
        this.encode = JSON.stringify;
        this.decode = JSON.parse;
        this.name = name;
        storecompleted = storecompleted;
        this.sourcequeue = name;
        this.workqueue = name + '.working';
        this.errorqueue = name + '.error';
        this.completedqueue = name + '.completed';
        // super(); // for EventEmitter
        this.draintimeout = setTimeout(() => {
            this.should_call_drain = true;
        }, 1000);
        this.depthinterval = setInterval(() => {
            this.depth((count) => {
                log.info(`queuedepth[${this.sourcequeue}]: ${count}`);
            });
        }, 2000);
    }
    brpoplpush(sourcequeue, workqueue) {
        const self = this;
        if (self.started) {
            return this.redisclient.brpoplpush(self.sourcequeue, self.workqueue, self.brpoplpushtimeout, function (error, encoded) {
                if (encoded) {
                    // console.log('i have a message');
                    self.should_call_drain = true;
                    self.encoded = encoded;
                    self.decoded = self.decode(encoded);
                    return self.onMessage(self.decoded);
                }
                else {
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
        }
        else {
            return console.log("No message handler!");
        }
    }
    onDrain() {
        if (this.event_handlers.drain) {
            // console.log('drain');
            return this.event_handlers.drain();
        }
        else {
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
        }
        else {
            this.redisclient.lpush(this.sourcequeue, this.encoded);
        }
        return this.brpoplpush(this.sourcequeue, this.workqueue);
    }
    start() {
        this.started = true;
        return this.brpoplpush(this.sourcequeue, this.workqueue);
    }
    stop(callback) {
        this.started = false;
        clearTimeout(this.draintimeout);
        clearInterval(this.depthinterval);
        setTimeout(() => {
            this.redisclient.quit();
            if (callback)
                callback();
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
exports.RedisQueue = RedisQueue;
//# sourceMappingURL=queue.js.map