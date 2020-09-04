/** @format */

"use strict";

module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	setupFilesAfterEnv: ["jest-extended"],
	bail: true,
	resetModules: true,
	resetMocks: true,
	clearMocks: true,
	collectCoverage: true,
	collectCoverageFrom: [
		"*.ts",
		"*.js",
		"!**/node_modules/**",
		"!**/build/**",
		"!**/*.config.*",
		"!**/.*",
	],
	coverageReporters: ["text", "text-summary"],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 70,
			lines: 70,
			statements: 70,
		},
		"Rrtypes.ts": {
			branches: 35,
			functions: 30,
			lines: 60,
			statements: 50,
		},
	},
	errorOnDeprecated: true,
};
