const bunyan = require('bunyan');
const config = require('../config');

// create global logger
global.log = bunyan.createLogger(config.logger);
