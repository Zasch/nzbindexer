module.exports = {
	server: {
		host: 'news.newshosting.com',
		user: '<username>', // Example doesn't need username
		pass: '<password>', // Nor password
		port: 563,
		secure: true
	},
	mongodb: 'mongodb://localhost:27017/nzbindex',
	redis: {
		host: 'localhost',
		port: 6379,
		db: 9,
		return_buffers: true
	},
	group: '<alt.binaries.teevee>',
	articles_per_connection: 25000,
	total_articles: 1000000,
	logger: {
		name: 'nzbindexer',
		streams: [{
			level: 'debug',
			stream: process.stdout
		}]
	}
}

// extra file logger

// ,{
// 	type: 'rotating-file',
// 	path: '/var/log/nzbindexer.log',
// 	period: 'daily', // daily rotation
// 	count: 30 // keep 30 back copies
// }