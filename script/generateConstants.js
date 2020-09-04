/** @format */

"use strict";

const dns = require("dns");
const _ = require("lodash");

_.forIn(dns, (val, key) => {
	if (_.isNumber(val) || _.isString(val) || _.isBoolean(val)) {
		process.stdout.write(`export const ${key} = ${JSON.stringify(val)};\n`);
	}
});
