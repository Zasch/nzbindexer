const redis = require("redis");
const config = require('../config');

module.exports.connect = function (callback) {
	const c = redis.createClient(config.redis);
	c.on('ready', () => {
		// console.log('redis ready');
		if (callback) {
			return callback(c);
		}
	});
	// c.on('end', () => console.log('redis end'));
	return c;
}