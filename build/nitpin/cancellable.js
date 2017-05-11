"use strict";
const EventEmitter = require('events');
class Cancellable extends EventEmitter {
    constructor(job) {
        super(); // event emitter
        // Set the function to execute if not cancelled
        this.job = job;
        // Has the function already executed?
        this.executed = false;
        // Has it already been cancelled?
        this.cancelled = false;
        // Have we been paused
        this.paused = false;
    }
    cancel() {
        // Don't cancel it twice
        if (this.cancelled) {
            return this.emit('alreadycancelled');
        }
        // Don't cancel if it has already executed
        if (this.executed) {
            return this.emit('alreadyexecuted');
        }
        this.cancelled = true;
        this.emit('cancel');
    }
    pause() {
        // Do nothing if already paused, cancelled or executed
        if (this.paused || this.cancelled || this.executed) {
            return;
        }
        this.paused = true;
        this.emit('paused');
    }
    resume() {
        // Do nothing if it hasn't been paused or already cancelled or executed
        if (!this.paused || this.cancelled || this.executed) {
            return;
        }
        this.paused = false;
        this.emit('resumed');
    }
    execute(fnc) {
        var that = this;
        if (this.cancelled) {
            return this.emit('executionprevented');
        }
        if (this.paused) {
            this.once('resumed', function whenResumed() {
                that.execute(fnc);
            });
            return this.emit('executiondelayed');
        }
        if (this.job)
            this.job();
        if (fnc)
            fnc();
        this.emit('executed');
    }
}
module.exports = Cancellable;
//# sourceMappingURL=cancellable.js.map