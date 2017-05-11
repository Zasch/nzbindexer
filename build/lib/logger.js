"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan = require("bunyan");
const config_1 = require("../config");
exports.logger = bunyan.createLogger(config_1.config.logger);
//# sourceMappingURL=logger.js.map