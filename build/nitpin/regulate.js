"use strict";
// Make sure finish only gets called one time
function regulate(fnc, amount) {
    var count = 0;
    if (!amount) {
        amount = 1;
    }
    return function wrapper() {
        count++;
        if (count > amount) {
            return;
        }
        return fnc.apply(this, arguments);
    };
}
module.exports = regulate;
//# sourceMappingURL=regulate.js.map