require('./lib/config');
require('./lib/logger'); // configure global logger
const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const filename = __filename.split(/[\\/]/).pop();
const cluster = require('cluster');
const ws = require('ws');
const encoder = JSON.stringify;
const decoder = JSON.parse;

var _once_cache = {};
function once(collection, str, fn) {
	if (!_once_cache[collection]) _once_cache[collection] = {};
	if (!_once_cache[collection][str]) {
		_once_cache[collection][str] = str;
		fn.apply();
	}
}

cluster.setupMaster({
	exec: 'articles2ToDatabaseWorker.js',
	silent: false
});

if (cluster.isMaster) {
	process.title = `node ${filename} server(master)`;
	return startMaster();
}

function startMaster() {
	const wss = new ws.Server({
		port: 9999
	});
	for (let i = 0; i < global.config.articlestodatabase.threads; i++) {
		cluster.fork();
	}
	let m = 0;
	setInterval(() => {
		once('master', 'messages' + m, () => {
			log.debug('messages', m);
		});
	}, 2000);
	target = 0;
	wss.on('connection', function connection(ws) {
		ws.on('message', function incoming(messages) {
			m++;
			if (target++ === global.config.articlestodatabase.threads) {
				target = 1;
			}
			return cluster.workers[target].send(decoder(messages));
		});
	});
}
