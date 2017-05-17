export const ArticleStatus = {
	OK: 0,
	FILE_MISSING: 1,
	PART_MISSING: 2,
	REGEX_MISSING: 3,
	EXTENSION_MISSING: 4,
	FILENAME_MISSING: 5,
}

export const movie_types = ['3gp', 'asf', 'avi', 'f4v', 'm4v', 'mkv', 'mov', 'mp2', 'mp3', 'mp4', 'mpeg', 'mpg', 'ogg', 'rm', 'vob', 'wmv'];

export const regexes = [
	// /\.par2$/,
	/\.vol\d{1,5}\+\d{1,5}$/,
	/\.rar$/,
	/\.part\d{1,5}$/,
	/\.r\d{1,5}$/,
	/[ ._-]sample$/,
	/([ ._-]thumb[s]?|[ ._-]{1,2}screen[s]?[\d]{0,4}|[ ._-]r|[ ._-]f|[ ._-]b|[ ._-]back|[ ._-]front|[ ._-]rear|[ ._-]index|[ ._-]info|[ ._-]cover[s]?)$/
];

export const replace_strings = [{
	find: 'join us @',
	replace: ''
}, {
	find: '<<best provider hitnews>>',
	replace: ''
}, {
	find: '<3 https://house-of-porn.com number one porn source <3',
	replace: ''
}, {
	find: 'https://house-of-porn.com/',
	replace: ''
}, {
	find: 'brothers-of-usenet.net',
	replace: ''
}, {
	find: 'empfehlen useindex.net/',
	replace: ''
}, {
	find: 'free invites by b-deadangel',
	replace: ''
}, {
	find: '>>>no.1 nzb indexer<<<',
	replace: ''
}, {
	find: '<<house-of-usenet.com>>',
	replace: ''
}, {
	find: '<<house-of-usenet>>',
	replace: ''
}, {
	find: '<<<hitnews.com>>>',
	replace: ''
}, {
	find: '<<hitnews>>',
	replace: ''
}, {
	find: 'www.usenet-space-cowboys.online',
	replace: ''
}, {
	find: 'usenet-space-cowboys.online',
	replace: ''
}, {
	find: '[u4a]',
	replace: ''
}, {
	find: '- description -',
	replace: ''
}, {
	find: '-always take the post from the first and original poster!-',
	replace: ''
}, {
	find: '<-> empfehlen <->',
	replace: ''
}, {
	find: '-[#a.b.erotica@efnet]',
	replace: ''
}, {
	find: '-[full]',
	replace: ''
}, {
	find: / - /g,
	replace: ' '
}, {
	find: / -/g,
	replace: ' '
}, {
	find: /- /g,
	replace: ' '
}, {
	find: /-\[/g,
	replace: ' ['
}, {
	find: /\]-/g,
	replace: '] '
}, {
	find: /\[ /g,
	replace: '['
}, {
	find: / \]/g,
	replace: ']'
}, {
	find: /\[\]/g,
	replace: ' '
}, {
	find: / yenc/g,
	replace: ''
}, {
	find: /yenc /g,
	replace: ''
}, {
	find: /^\[\d{6}\]/,
	replace: ''
}];

