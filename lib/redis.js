const redis = require("redis");

const redis_options = {
	db: 9,
	return_buffers: true
}

module.exports.connect = function (callback) {
	const c = redis.createClient(redis_options);
	c.on('ready', () => {
		// console.log('redis ready');
		if (callback) {
			return callback(c);
		}
	});
	// c.on('end', () => console.log('redis end'));
	return c;
}