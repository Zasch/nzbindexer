require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
})
const async = require('async');
const config = require('./config');

const Connection = require('./lib/connection');
const connections = Array
	.apply(null, Array(config.connections))
	.map((x, i) => {
		const c = new Connection(i, config.server);
		return c;
	});

let connectionPointer = 0;

function test(task, cb) {
	const c = connections[connectionPointer++];
	const from = (task + 1) * 1000;
	const to = from + 999;
	log.info('task', c.name, from, to);
	if (connectionPointer > (config.connections - 1)) connectionPointer = 0;
	c.connect((error) => {
		if (error) return;
		c.group('alt.binaries.kleverig', (error, group) => {
			if (error) return;
			log.debug({
				group: group
			}, 'group');
			// const xzver = group.first + '-' + (parseInt(group.first, 10) + 0);
			const xzver = from + '-' + to;
			c.xzver(xzver, (error, range, messages) => {
				if (error) return setTimeout(() => {
					log.warn('retrying', xzver);
					test(task, cb);
				}, 1000);
				if (messages.length > 0) log.info('connection', c.name, 'range', range, 'count', messages.length);
				cb(null, messages);
			});
		});
	});
}

const tasks = Array
	.apply(null, Array(10))
	.map((x, i) => i);

async.mapLimit(tasks, config.connections, test, (a, b) => {
	a && console.log('a', a);
	b && console.log('b', b.length);
})