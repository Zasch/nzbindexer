"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
String.prototype.startsWith = function (prefix) {
    return this.indexOf(prefix) == 0;
};
String.prototype.endsWith = function (suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
var fib = [];
for (var i = 0, inc = 0; i < 2000; i++) {
    inc += i;
    fib.push(inc);
}
function addMinutes(date, minutes) {
    return new Date(date.getTime() + (minutes * 60000));
}
exports.addMinutes = addMinutes;
;
// Extract filename from HEADER
function extractFilename(subject) {
    var match = subject.match(/^.*\"(.*)\".*/);
    // console.log("match1", match);
    var filename = (match && match[1] ? match[1] : undefined);
    // console.log("filename", filename);
    if (!filename) {
        match = subject.match(/^([a-z0-9\.-]*).rar/i); // a-zA-Z0-9
        // console.log("match2", match);
        filename = (match && match[1] ? match[1] + ".rar" : undefined);
        // console.log("filename", filename);
    }
    if (filename == undefined) {
        match = subject.match(/^([a-z0-9\.\+-]*).par2/i); // a-zA-Z0-9
        // console.log("match3", match);
        filename = (match && match[1] ? match[1] + ".par2" : undefined);
        // console.log("filename", filename);
    }
    if (filename == undefined) {
        // global.log.error("filename missing:", subject);
    }
    return filename;
}
exports.extractFilename = extractFilename;
;
// Extract Release ID from HEADER
function extractReleaseID(subject) {
    const match = subject.match(/^\[(\d+)\]/);
    let releaseid = undefined;
    if (match && match[1]) {
        releaseid = match[1];
    }
    return releaseid;
}
exports.extractReleaseID = extractReleaseID;
;
// Extract Part & Total (per file bases) from HEADER
function extractpartAndTotal(subject) {
    let part = null;
    let total = null;
    let match = subject.match(/^.+yEnc.+\((\d+)\/(\d+)\)/);
    if (match && match[1] && match[2]) {
        part = parseInt(match[1]);
        total = parseInt(match[2]);
    }
    else {
        match = subject.match(/^.+\((\d+)\/(\d+)\)/);
        if (match && match[1] && match[2]) {
            part = parseInt(match[1]);
            total = parseInt(match[2]);
        }
    }
    if (part == null) {
        console.error("part missing:", part, total, subject);
    }
    return {
        part: part,
        total: total
    };
}
exports.extractpartAndTotal = extractpartAndTotal;
;
// Remove Part & Total (per file bases) from subject when inserting in files table
function extractpartAndTotalString(subject) {
    // console.log("before", subject);
    var part = undefined;
    var match = subject.match(/^.+(yEnc.+\(\d+\/\d+\))/);
    if (match && match[1]) {
        part = match[1];
    }
    else {
        match = subject.match(/^.+(\(\d+\/\d+\))/);
        if (match && match[1]) {
            part = match[1];
        }
    }
    if (part === undefined) {
        // global.log.error("part missing:", part, subject);
    }
    // console.log(part, subject.replace(part, "").trim());
    return subject.replace(part, "").trim();
}
exports.extractpartAndTotalString = extractpartAndTotalString;
;
function htmlEscape(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
exports.htmlEscape = htmlEscape;
;
function getFileNZB(rows) {
    var nzb = '';
    nzb += '<file poster="' + rows[0].poster + '" date="' + Math.round(rows[0].postdate.getTime() / 1000) + '" subject="' + htmlEscape(rows[0].subject) + '">\n';
    nzb += '<groups>\n';
    nzb += '<group>alt.binaries.erotica</group>\n';
    nzb += '</groups>\n';
    nzb += '<segments>\n';
    rows.forEach(function (row) {
        var line = '<segment bytes="' + row.bytes + '" number="' + row.part + '">' + row.articleid + '</segment>';
        nzb += line + '\n';
    });
    nzb += '</segments>\n';
    nzb += '</file>\n';
    return nzb;
}
exports.getFileNZB = getFileNZB;
;
function getFileNZBnew(rows) {
    var nzb = {
        group: 'alt.binaries.erotica',
        poster: rows[0].poster,
        postdate: Math.round(rows[0].postdate.getTime() / 1000),
        subject: htmlEscape(rows[0].subject),
        segments: new Array()
    };
    rows.forEach(function (row) {
        nzb.segments.push({
            bytes: row.bytes,
            part: row.part,
            articleid: row.articleid
        });
    });
    // console.log(nzb);
    // console.log();
    return nzb;
}
exports.getFileNZBnew = getFileNZBnew;
;
function getReleaseNZB(rows) {
    var nzb = '';
    nzb += '<?xml version="1.0" encoding="iso-8859-1" ?>\n';
    nzb += '<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.0//EN" "http://www.nzbindex.com/nzb-1.0.dtd">\n';
    nzb += '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">\n';
    rows.forEach(function (row) {
        nzb += row.nzb;
    });
    nzb += '</nzb>\n';
    return nzb;
}
exports.getReleaseNZB = getReleaseNZB;
function getReleaseNZBnew(rows) {
    var nzb = [];
    rows.forEach(function (row) {
        nzb.push(row.nzb);
    });
    return nzb;
}
exports.getReleaseNZBnew = getReleaseNZBnew;
function fileComplete(rows) {
    var partsum = 0;
    if (rows[0] && rows[0].total) {
        var total = rows[0].total;
        rows.forEach(function (row, index) {
            // console.log(row.part);
            // if (index == 0) total = row.total;
            partsum += row.part;
        });
        return partsum == fib[total]; // correct for (1) extra part
        // return (partsum == fib[total]) || (partsum < fib[total] + total); // correct for (1) extra part
    }
    else {
        console.log("no total??", rows);
        return false;
    }
}
exports.fileComplete = fileComplete;
;
function howMuchComplete(rows) {
    var total = rows[0].total;
    var percentage = Math.floor(100 * rows.length / total);
    if (percentage < 100) {
        // console.log("file", rows[0].filename, "is NOT complete");
        // while(!newestdate && !oldestdate) {
        // console.log("test");
        // }
        // var numhoursfromlatest = Math.floor((newestdate - rows[0].postdate) / (1000 * 3600));
        // var numhoursfromfirst = Math.floor((rows[0].postdate - oldestdate) / (1000 * 3600));
        // if (numhoursfromfirst > 48 && numhoursfromlatest > 48) {
        //     //move files
        // }
        // console.log("age", numhoursfromfirst, numhoursfromlatest);
        // console.log("rows", rows.length, "total", total, "percentage", percentage, total - rows.length, "missing\n");
    }
}
exports.howMuchComplete = howMuchComplete;
;
function extractReleasePartAndTotal(row) {
    var match = row.subject.match(/^.*\[(\d+)\/(\d+)\]/);
    var retval = {
        part: null,
        total: null
    };
    // File 1 of 9
    if (match) {
        retval = {
            part: parseInt(match[1]),
            total: parseInt(match[2])
        };
    }
    if (!retval.total) {
        match = row.subject.match(/^.+File\s(\d+)\sof\s(\d+)/);
        if (match) {
            retval = {
                part: parseInt(match[1]),
                total: parseInt(match[2])
            };
        }
    }
    if (!retval.total) {
        match = row.subject.match(/^\((\d+)\/(\d+)\)/);
        if (match) {
            retval = {
                part: parseInt(match[1]),
                total: parseInt(match[2])
            };
        }
    }
    if (!retval.total) {
        match = row.subject.match(/^.*\[(\d+) of (\d+)\]/);
        if (match) {
            retval = {
                part: parseInt(match[1]),
                total: parseInt(match[2])
            };
        }
    }
    return retval;
}
exports.extractReleasePartAndTotal = extractReleasePartAndTotal;
;
function getMatcherString(filename) {
    let m = filename.split(".");
    // console.log(filename, m);
    m.pop();
    if (m[m.length - 1]) {
        let isVol = m[m.length - 1].match(/^vol[0-9]+\+[0-9]+/);
        if (isVol) {
            m.pop();
        }
        let isPart = m[m.length - 1].match(/^part[0-9]+/);
        if (isPart) {
            m.pop();
        }
    }
    return m.join(".");
}
exports.getMatcherString = getMatcherString;
;
function calcTotalFileBytes(rows) {
    var bytes = 0;
    rows.forEach(function (row) {
        bytes += row.bytes;
    });
    return bytes;
}
exports.calcTotalFileBytes = calcTotalFileBytes;
;
function fileIDS(rows) {
    var files = [];
    rows.forEach(function (row) {
        files.push('"' + row.id + '"');
    });
    return files;
}
exports.fileIDS = fileIDS;
;
function mongoIDs(rows) {
    var files = [];
    rows.forEach(function (row) {
        files.push(row._id);
    });
    return files;
}
exports.mongoIDs = mongoIDs;
;
function mongoIDsWaterline(rows) {
    var files = [];
    rows.forEach(function (row) {
        // console.log(row);
        files.push(row.id);
    });
    // console.log(files);
    return files;
}
exports.mongoIDsWaterline = mongoIDsWaterline;
;
function getFiletypes(rows) {
    var files = {};
    rows.forEach(function (row) {
        if (row.filetype) {
            if (!files[row.filetype]) {
                files[row.filetype] = 0;
            }
            ;
            files[row.filetype] += 1;
        }
        else {
            // global.log.error("filetype missing", row.filename);
        }
        ;
    });
    return files;
}
exports.getFiletypes = getFiletypes;
;
//# sourceMappingURL=utils.js.map