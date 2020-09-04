/** @format */

const isDev = !process.env.NODE_ENV || process.env.NODE_ENV.startsWith("dev");
const isProduction = !isDev && process.env.NODE_ENV.startsWith("prod");

const presets = [
	[
		"@babel/preset-env",
		{
			loose: true,
			useBuiltIns: "usage",
			corejs: {
				version: 3,
				proposals: true,
			},
			shippedProposals: true,
		},
	],
];

const plugins = [
	["@babel/plugin-proposal-class-properties", { loose: true }],
	"@babel/plugin-proposal-export-default-from",
	"@babel/plugin-proposal-export-namespace-from",
	"@babel/plugin-proposal-function-bind",
	"@babel/plugin-proposal-logical-assignment-operators",
	["@babel/plugin-proposal-nullish-coalescing-operator", { loose: true }],
	["@babel/plugin-proposal-optional-chaining", { loose: true }],
	"@babel/plugin-proposal-throw-expressions",
	"babel-plugin-import-directory",
	"babel-plugin-transform-promise-to-bluebird",
];

if(!isDev) {
	presets.unshift(
		// Presets are executed from last to first, so these go at the front to go last
		"minify",
	);
	plugins.push(
		// Plugins are executed from first to last, so these go at the end to go last
		"babel-plugin-lodash", // This is specially-tuned to support modularizing Lodash imports.
		[
			// This is a more general-purpose way to modularize imports.
			// It's super useful for enabling tree shaking, assuming the imported library has a sane organization.
			"babel-plugin-transform-imports",
			{},
		],
		"babel-plugin-remove-debug",
		"babel-plugin-transform-remove-debugger",
		"babel-plugin-transform-remove-console",
		"babel-plugin-minify-constant-folding",
		"babel-plugin-minify-simplify",
		"babel-plugin-minify-dead-code-elimination",
	);

}

module.exports = {
	presets,
	plugins,
	sourceMaps: true,
	retainLines: isDev,
	compact: isProduction,
	minified: isProduction,
	comments: isDev,
	ignore: isProduction ? [/^.*\.test\.js$/i] : [],
};
