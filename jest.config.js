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
			"functions": 70,
			"lines": 70,
			"statements": 70,
		},
		"./build/Rrtypes.js": {
			"branches": 40,
			"functions": 30,
			"lines": 60,
			"statements": 50,
		}
	},
	errorOnDeprecated: true,
};
