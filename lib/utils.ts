String.prototype.startsWith = function (prefix) {
    return this.indexOf(prefix) == 0;
};

String.prototype.endsWith = function (suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var fib: Array<number> = [];
for (var i = 0, inc = 0; i < 2000; i++) {
    inc += i;
    fib.push(inc);
}

export function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + (minutes * 60000));
};

// Extract filename from HEADER
export function extractFilename(subject: String) {
    var match = subject.match(/^.*\"(.*)\".*/);
    // console.log("match1", match);
    var filename = (match && match[1] ? match[1] : undefined);
    // console.log("filename", filename);

    if (!filename) {
        match = subject.match(/^([a-z0-9\.-]*).rar/i); // a-zA-Z0-9
        // console.log("match2", match);
        filename = (match && match[1] ? match[1] + ".rar" : undefined)
        // console.log("filename", filename);
    }
    if (filename == undefined) {
        match = subject.match(/^([a-z0-9\.\+-]*).par2/i); // a-zA-Z0-9
        // console.log("match3", match);
        filename = (match && match[1] ? match[1] + ".par2" : undefined)
        // console.log("filename", filename);
    }
    if (filename == undefined) {
        // global.log.error("filename missing:", subject);
    }
    return filename;
};

// Extract Release ID from HEADER
export function extractReleaseID(subject: string) {
    const match = subject.match(/^\[(\d+)\]/);
    let releaseid: string | undefined = undefined;
    if (match && match[1]) {
        releaseid = match[1];

    }
    return releaseid;
};

// Extract Part & Total (per file bases) from HEADER
export function extractpartAndTotal(subject: string) {
    let part = null;
    let total = null;

    let match = subject.match(/^.+yEnc.+\((\d+)\/(\d+)\)/);
    if (match && match[1] && match[2]) {
        part = parseInt(match[1]);
        total = parseInt(match[2]);
    } else {
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
};

// Remove Part & Total (per file bases) from subject when inserting in files table
export function extractpartAndTotalString(subject: string) {
    // console.log("before", subject);
    var part: any = undefined;

    var match = subject.match(/^.+(yEnc.+\(\d+\/\d+\))/);
    if (match && match[1]) {
        part = match[1];
    } else {
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
};

export function htmlEscape(str: string) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

export function getFileNZB(rows: Array<any>) {
    var nzb = '';
    nzb += '<file poster="' + rows[0].poster + '" date="' + Math.round(rows[0].postdate.getTime() / 1000) + '" subject="' + htmlEscape(rows[0].subject) + '">\n';
    nzb += '<groups>\n';
    nzb += '<group>alt.binaries.erotica</group>\n';
    nzb += '</groups>\n';
    nzb += '<segments>\n';

    rows.forEach(function (row) {
        var line = '<segment bytes="' + row.bytes + '" number="' + row.part + '">' + row.articleid + '</segment>';
        nzb += line + '\n'
    });

    nzb += '</segments>\n';
    nzb += '</file>\n';
    return nzb;
};

export function getFileNZBnew(rows: Array<any>) {
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
};

export function getReleaseNZB(rows: Array<any>) {
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

export function getReleaseNZBnew(rows: Array<any>) {
    var nzb: Array<any> = [];
    rows.forEach(function (row: any) {
        nzb.push(row.nzb);
    });
    return nzb;
}

export function fileComplete(rows: Array<any>) {
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
    } else {
        console.log("no total??", rows);
        return false;
    }
};

export function howMuchComplete(rows: Array<any>) {
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
};

export function extractReleasePartAndTotal(row: any) {
    var match = row.subject.match(/^.*\[(\d+)\/(\d+)\]/);
    var retval: any = {
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
};

export function getMatcherString(filename: string) {
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
};

export function calcTotalFileBytes(rows: Array<any>) {
    var bytes = 0;
    rows.forEach(function (row) {
        bytes += row.bytes;
    });
    return bytes;
};

export function fileIDS(rows: Array<any>) {
    var files: Array<string> = [];
    rows.forEach(function (row) {
        files.push('"' + row.id + '"');
    });
    return files;
};

export function mongoIDs(rows: Array<any>) {
    var files: Array<any> = [];
    rows.forEach(function (row) {
        files.push(row._id);
    });
    return files;
};

export function mongoIDsWaterline(rows: Array<any>) {
    var files: Array<any> = [];
    rows.forEach(function (row) {
        // console.log(row);
        files.push(row.id);
    });
    // console.log(files);
    return files;
};

export function getFiletypes(rows: Array<any>) {
    var files: any = {};
    rows.forEach(function (row) {
        if (row.filetype) {
            if (!files[row.filetype]) {
                files[row.filetype] = 0
            };
            files[row.filetype] += 1;
        } else {
            // global.log.error("filetype missing", row.filename);
        };
    });
    return files;
};
