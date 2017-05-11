import { logger } from './lib/logger';
const filename: string | undefined = __filename.split(/[\\/]/).pop();
const log = logger.child({
	file: filename
});
import { config } from './config';
import { Range } from './types';
import { Db } from 'mongodb';
import { RedisQueue } from './lib/queue';
import { Timer } from './lib/timer';
import * as cluster from 'cluster';
import * as Nitpin from './nitpin';
import * as database from './lib/database';
let mongoclient: Db;
let taskqueue: RedisQueue;
let nitpin: any;

cluster.setupMaster({
	exec: 'articles1Worker.ts',
	silent: false
});

if (cluster.isMaster) {
	process.title = `node ${filename} server(master)`;
	for (let i = 0; i < config.articlesdownload.threads; i++) {
		cluster.fork();
	}
	master();
}
function getGroup(callback: Function) {
	nitpin.group(config.group, (error: any, group: Range) => {
		log.info({
			group
		}, 'group');
		return callback(group);
	});
}

function getStats(callback: Function) {
	database.connect((db: Db) => {
		if (db) {
			mongoclient = db;
			mongoclient.collection('stats').findOne({
				_id: config.group
			}, (error: any, stats: Range) => {
				log.info({
					stats
				}, 'stats');
				return callback(stats);
			})
		} else throw "Error";
	})
}

function pushBackfillTasks(group: Range, stats: Range, callback: Function) {
	if (!stats) {
		throw "Stats Missing";
	}
	let total = (stats.low - group.low);
	if (total < 0) {
		log.warn('backfill complete');
		return 0;
	}
	if (total > config.total_articles) {
		total = config.total_articles;
	}
	log.info('Total articles', total);
	const fulltasks = Math.floor(total / config.articles_per_connection);
	const remaining = total % config.articles_per_connection;
	for (let i = 0; i < fulltasks; i++) {
		const task = {
			low: stats.low - ((i + 1) * config.articles_per_connection),
			high: stats.low - (i * config.articles_per_connection) - 1,
		};
		// console.log(task);
		taskqueue.push(task);
	}
	if (remaining > 0) {
		const task = {
			low: stats.low - (fulltasks * config.articles_per_connection) - remaining,
			high: stats.low - (fulltasks * config.articles_per_connection) - 1
		};
		// console.log(task);
		taskqueue.push(task);
	}
	const dbvalue = {
		low: stats.low - total,
		high: stats.high
	};
	// console.log('db', dbvalue);
	mongoclient.collection('stats').updateOne({
		_id: config.group
	}, dbvalue, {
			upsert: true
		}, () => {
			return callback(fulltasks + (remaining > 0 ? 1 : 0));
		});
}

function master() {
	nitpin = new Nitpin(config.server);
	taskqueue = new RedisQueue('tasks', true, false);
	Timer.start('process');
	getGroup((group: Range) => {
		getStats((stats: Range) => {
			pushBackfillTasks(group, stats, (tasks: Array<any>) => {
				log.info(tasks + ' tasks created');
				mongoclient.close();
			});
		})
	});
	let exited = 0;
	cluster.on('exit', function (worker: any, code: any, signal: any) {
		exited++;
		if (exited === config.articlesdownload.threads) {
			log.info(`All workers have exited: ${Timer.end('process')}`);
			process.exit(0);
		}
	});
	let done = 0;
	cluster.on('message', (worker: any, cmd: string) => {
		if (cmd = 'done') {
			done++;
			if (done === config.articlesdownload.threads) {
				log.info("All workers are done");
				taskqueue.stop();
				cluster.disconnect();
			}
		}
	});
}
