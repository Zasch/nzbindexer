const bunyan = require('bunyan');
const config = require('../config');

global.log = bunyan.createLogger(config.logger);
