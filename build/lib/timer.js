"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
class Timer {
    constructor() {
        throw new Error("Cannot new this class");
    }
    static start(name) {
        if (!this.timers)
            this.timers = {};
        this.timers[name] = process.hrtime();
    }
    static end(name) {
        if (this.timers && this.timers[name]) {
            const end = process.hrtime(this.timers[name]);
            return `${end[0]}s ${end[1] / 1000000}ms`;
        }
        else {
            throw `timer.end called  for [${name}] before start`;
        }
    }
}
exports.Timer = Timer;
//# sourceMappingURL=timer.js.map