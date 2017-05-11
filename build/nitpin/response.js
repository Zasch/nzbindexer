"use strict";
class Response {
    constructor(status, message) {
        this.GROUP_SELECTED = 211; // RFC 3977
        this.NO_SUCH_GROUP = 411; // RFC 3977
        // The status of the response
        this.status = status;
        // The message of the initial response
        this.message = message;
        // The buffer of the body
        this.buffer = null;
    }
    static createFromChunk(chunk, encoding, command) {
        var endIndex, response, matches, string, len, i;
        for (i = 0; i < chunk.length; i++) {
            if (chunk[i] == 13 && chunk[i + 1] == 10) {
                endIndex = i;
                break;
            }
        }
        // Get the first line (the status & message)
        string = chunk.slice(0, endIndex).toString();
        // Store the rest of the buffer
        chunk = chunk.slice(endIndex + 2);
        len = chunk.length;
        if (chunk[len - 3] == 46 && chunk[len - 2] == 13 && chunk[len - 1] == 10) {
            // Remove the ".\r\n" from the end of the message
            chunk = chunk.slice(0, -3);
        }
        matches = /^(\d{3}) ([\S\s]+)$/g.exec(string.trim());
        if (!matches) {
            throw new Error('Invalid response given: ' + JSON.stringify(string));
        }
        if (matches[1] < 100 || matches[1] >= 600) {
            throw new Error('Invalid status code given: ' + matches[1]);
        }
        response = new Response(parseInt(matches[1], 10), matches[2]);
        response.buffer = chunk;
        return response;
    }
    get lines() {
        if (this.buffer == null) {
            return [];
        }
        // Trim so the trailing "\r\n" is removed
        return this.buffer.toString('binary').trim().split('\r\n');
    }
}
module.exports = Response;
//# sourceMappingURL=response.js.map