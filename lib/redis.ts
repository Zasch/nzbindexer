// import {logger} from './logger';
// const log = logger.child({
// 	file: __filename.split(/[\\/]/).pop()
// });
import {createClient} from 'redis';
import {config} from '../config';

module.exports.connect = function (callback: Function) {
	const c = createClient(config.redis);
	c.on('ready', () => {
		// console.log('redis ready');
		if (callback) {
			return callback(c);
		}
	});
	// c.on('end', () => console.log('redis end'));
	return c;
}