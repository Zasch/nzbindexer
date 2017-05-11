import * as process from 'process';

export interface Timers {
	// [key: string]: Timevalue;
	[key: string]: [number, number];
}

export class Timer {
	static timers: Timers;

	constructor() {
		throw new Error("Cannot new this class");
	}

	static start(name: string) {
		if (!this.timers) this.timers = {};
		this.timers[name] = process.hrtime();
	}

	static end(name: string) {
		if (this.timers && this.timers[name]) {
			const end = process.hrtime(this.timers[name]);
			return `${end[0]}s ${end[1] / 1000000}ms`;
		} else {
			throw `timer.end called  for [${name}] before start`
		}
	}
}
