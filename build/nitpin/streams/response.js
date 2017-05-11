"use strict";
const Transform = require('stream').Transform;
const Response = require('../response');
class ResponseStream extends Transform {
    constructor(multiline) {
        super();
        const that = this;
        // Is this a multiline response?
        this.multiline = !!multiline;
        // What is the response so far?
        this.response = undefined;
        // Upstream pipe
        this.upstream = null;
        // Listen to pipes
        this.on('pipe', function (src) {
            that.upstream = src;
        });
        // Call parent constructor
        Transform.call(this, {
            objectMode: true
        });
    }
    _transform(chunk, encoding, callback) {
        var response = this.response, err;
        if (this.response === undefined) {
            // See if upstream has already made a Response object
            if (this.upstream && this.upstream.response) {
                response = this.upstream.response;
            }
            else {
                // Create a new Response object
                response = Response.createFromChunk(chunk);
            }
            this.response = response;
            // Certain status codes indicate errors
            if (response.status > 399) {
                err = new Error(response.message);
                err.code = response.status;
                return callback(err);
            }
            // Always submit the entire response object
            this.push(response);
            // End the stream if it's not a multiline response
            if (this.multiline === false) {
                this.end();
            }
        }
        else {
            if (!response.buffer) {
                response.buffer = chunk;
            }
            else {
                response.buffer = Buffer.concat([response.buffer, chunk]);
            }
        }
        callback();
    }
    flush(callback) {
        this.push(this.response);
        callback();
    }
}
module.exports = ResponseStream;
//# sourceMappingURL=response.js.map