const log = global.log.child({
	file: __filename.split(/[\\/]/).pop()
});
const NNTP = require('./node-nntp/nntp');

class Connection {
	constructor(name, settings) {
		log.info('creating connection', name);
		this.connected = false;
		this.connecting = false;
		this.name = name;
		this.settings = settings;
		this.nntp = new NNTP(settings);
	}

	get isConnected() {
		return this.connected;
	}

	connect(cb) {
		if (this.connected === true) return cb(null);
		if (this.connecting === true) {
			log.warn('waiting....', this.name);
			return setTimeout(() => {
				this.connect(cb);
			}, 1000);
		}
		this.connecting = true;
		this.nntp.connectAndAuthenticate((error, response) => {
			if (error) {
				log.error({
					command: 'connect',
					connection: this.name,
					err: error
				}, 'connectAndAuthenticate error');
				return cb(true);
			}
			if (response.status !== 281 && response.status !== 200) {
				log.error({
					command: 'connect',
					connection: this.name,
					err: {
						code: response.status,
						message: response.message
					}
				}, 'connectAndAuthenticate invalid response code');
				return cb(true);
			}
			// log.info('connectAndAuthenticate', this.name, response.status, response.message);
			this.nntp.overviewFormat((error, format) => {
				if (error) {
					log.info({
						command: 'connect',
						connection: this.name,
						err: error
					}, 'overviewFormat');
					return cb(true);
				}
				this.format = format;
				this.connected = true;
				this.connecting = false;
				return cb(null);
			});
		});
	}

	group(groupname, cb) {
		if (this.grouprecord && this.grouprecord.name === groupname) {
			return cb(null, this.grouprecord);
		}
		this.nntp.group(groupname, (error, group) => {
			if (error) {
				log.error({
					command: 'group',
					connection: this.name,
					groupname: groupname,
					err: {
						code: 404,
						message: 'Group Missing'
					}
				}, 'group');
				return cb(true, null);
			}
			this.grouprecord = group;
			return cb(null, this.grouprecord);
		});
	}

	xzver(range, cb) {
		this.nntp.xzver(range, this.format, (error, messages) => {
			if (error) {
				log.error({
					command: 'xzver',
					connection: this.name,
					range: range,
					err: error
				}, 'xzver');
				return cb(true, null, null);
			}
			if (messages.length === 0) {
				log.error({
					command: 'xzver',
					connection: this.name,
					range: range,
					err: {
						code: 404,
						message: 'No Articles in that range'
					}
				}, 'xzver');
				return cb(true, null, null);
			}
			cb(null, range, messages);
		});
	}
}

module.exports = Connection;