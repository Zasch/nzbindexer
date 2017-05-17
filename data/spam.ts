
export const spamfilters: any = {
	'alt.binaries.erotica': [
		{
			field: 'filename',
			regex: /\d{4}\-srpx\./
		},
		{
			field: 'filename',
			regex: /\d{4}\-srp\./
		}
	]
};

// let filename = '-720p-x264-2016-srpxs.rar';
// const result = spamfilters['alt.binaries.erotica'][0].regex.test(filename);
// console.log(result);