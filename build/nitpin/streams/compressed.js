"use strict";
const zlib = require('zlib');
const Transform = require('stream').Transform;
class CompressedStream extends Transform {
    constructor() {
        super();
        this.chunks = [];
        this.response;
        Transform.call(this);
    }
    _transform(chunk, encoding, done) {
        const that = this;
        let buffer;
        this.chunks.push(encoding === 'buffer' ? chunk : new Buffer(chunk, 'binary'));
        if (undefined === this.response && -1 !== (buffer = Buffer.concat(this.chunks).toString('binary')).indexOf('\r\n')) {
            // its the first chunk
            this.response = buffer.substring(0, buffer.indexOf('\r\n') + 2);
            this.chunks = [new Buffer(buffer.substring(buffer.indexOf('\r\n') + 2), 'binary')];
            this.push(this.response);
        }
        zlib.inflate(Buffer.concat(this.chunks), function (error, result) {
            if (undefined !== result && '.\r\n' === result.toString().substr(-3)) {
                that.push(result);
                that.push(null); // stream end
            }
            done();
        });
    }
}
module.exports = CompressedStream;
//# sourceMappingURL=compressed.js.map