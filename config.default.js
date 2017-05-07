module.exports = {
	server: {
		host: 'news.newshosting.com',
		user: '*** username ***',
		pass: '*** password ***',
		port: 563,
		secure: true
	},
	mongodb: 'mongodb://localhost:27017/nzbindex',
	bulksize: 999,
	redis: {
		host: 'localhost',
		port: 6379,
		db: 9,
		return_buffers: true
	},
	group: 'alt.binaries.teevee',
	articles_per_connection: 10000,
	total_articles: 500000,
	logger: {
		name: 'nzbindexer',
		streams: [{
			level: 'debug',
			stream: process.stdout
		}]
	},
	articlesdownload: {
		threads: 4
	},
	articlestodatabase: {
		threads: 7
	}
}

// extra file logger

// ,{
// 	type: 'rotating-file',
// 	path: '/var/log/nzbindexer.log',
// 	period: 'daily', // daily rotation
// 	count: 30 // keep 30 back copies
// }