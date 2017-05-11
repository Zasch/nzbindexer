"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import {logger} from './logger';
// const log = logger.child({
// 	file: __filename.split(/[\\/]/).pop()
// });
const redis_1 = require("redis");
const config_1 = require("../config");
module.exports.connect = function (callback) {
    const c = redis_1.createClient(config_1.config.redis);
    c.on('ready', () => {
        // console.log('redis ready');
        if (callback) {
            return callback(c);
        }
    });
    // c.on('end', () => console.log('redis end'));
    return c;
};
//# sourceMappingURL=redis.js.map