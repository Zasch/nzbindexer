export const config = {
	server: {
		host: 'news.newshosting.com', // Example uses the open PHP newsgroups server
		user: 'sander1972', // Example doesn't need username
		pass: 'jennajameson0', // Nor password
		port: 563,
		secure: true
	},
	mongodb: 'mongodb://localhost:27017/nzbindex',
	bulksize: 999,
	redis: {
		host: 'localhost',
		port: 6379,
		db: "9",
		return_buffers: true
	},
	group: 'alt.binaries.erotica',
	articles_per_connection: 10000,
	total_articles: 1000000,
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
	},
	articlestofiles: {
		threads: 6
	}
};

// , {
// 	type: 'rotating-file',
// 	path: '/var/log/nzbindexer.log',
// 	period: 'daily', // daily rotation
// 	count: 30 // keep 30 back copies
// }