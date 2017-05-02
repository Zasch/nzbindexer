function timebomb(timer, callback) {
	var bomb;
	if (typeof timer == 'function') {
		callback = timer;
		timer = 100;
	} else if (typeof timer != 'number') {
		timer = 100;
	}
	bomb = {
		defused: false,
		exploded: false,
		handle: setTimeout(function explode() {
			var err = new Error('Timeout of ' + timer + 'ms was reached');

			exploded = true;

			if (callback) {
				callback(err);
			} else {
				throw err;
			}
		}, timer),
		defuse: function defuse() {

			if (bomb.exploded) {
				return false;
			} else if (!bomb.defused) {
				clearTimeout(bomb.handle);
				bomb.defused = true;
			}

			return true;
		}
	};
	return bomb;
}

module.exports = timebomb;