"use strict";

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	"setupFilesAfterEnv": ["jest-extended"],
	bail: true,
	resetModules: true,
	resetMocks: true,
	clearMocks: true,
	collectCoverage: true,
	coverageDirectory: "./coverage",
	coverageReporters: [ "text", "text-summary" ],
	coverageThreshold: {
		global: {
			"branches": 50,
			"functions": 50,
			"lines": 50,
			"statements": 50,
		},
		"./build/Rrtypes.js": {
			"branches": 40,
			"functions": 30,
			"lines": 50,
			"statements": 50,
		}
	},
	errorOnDeprecated: true,
};
