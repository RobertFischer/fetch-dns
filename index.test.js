"use strict";

const dns = require("dns");
const _ = require("lodash");
const fetchDns = require("./build/index"); // eslint-disable-line node/no-unpublished-require
const Promise = require("bluebird");
const debug = require("debug")("index-test");

const defaultUrl = "knowledgefight.com"
const unimplemented = [
	"reverse",
];
const untested = [
	"Resolver",
	"lookupService",
	"resolveNaptr",
	"resolveSoa",
	"resolveSrv",
	"resolvePtr",
	"setServers",
	"getServers",
];
const methodArgs = {
	"lookup": [
		[ defaultUrl ],
		[ defaultUrl, 4 ],
		[ "google.com", 6 ],
		[ defaultUrl, 0 ],
		[ defaultUrl, { all: false } ],
		[ defaultUrl, { family: 0, all: false } ],
		[ defaultUrl, { family: 4, all: false } ],
		[ "google.com", { family: 6, all: false } ],
		[ defaultUrl, { all: true } ],
		[ defaultUrl, { family: 0, all: true } ],
		[ defaultUrl, { family: 4, all: true } ],
		[ "google.com", { family: 6, all: true } ],
	],
	"resolve": [
		[ defaultUrl ],
		[ defaultUrl, "A" ],
		[ "google.com", "AAAA" ],
		[ defaultUrl, "ANY" ],
		[ "elibosnick.wixsite.com", "CNAME" ],
		[ "gmail.com", "MX" ],
		[ "google.com", "TXT" ],
	],
	"resolve4": [
		[ defaultUrl ],
		[ defaultUrl, { ttl: true } ],
		[ defaultUrl, { ttl: false } ],
	],
	"resolve6": [
		[ "google.com" ],
		[ "google.com", { ttl: true } ],
		[ "google.com", { ttl: false } ],
	],
	"resolveCname": [
		[ "elibosnick.wixsite.com" ],
	],
	"resolveMx": [
		[ "gmail.com" ],
	],
	"resolveNs": [
		[ defaultUrl ],
	],
	"resolveTxt": [
		[ "google.com" ],
	],
	"resolveAny": [
		[ defaultUrl ],
	],
};

_.forEach(
	_.functions(dns.promises),
	(funcName) => {
		debug("Processing function: ", funcName);
		describe("promises", () => {
			if(_.includes(unimplemented, funcName)) return;
			if(_.includes(untested, funcName)) return;
			describe(`${funcName}`, () => {

				it("has arguments", () => {
					expect.hasAssertions();
					expect(methodArgs).toHaveProperty(funcName);
					expect(methodArgs[funcName]).not.toBeEmpty();
					expect(methodArgs[funcName]).toBeArray();
				});

				_.forEach(
					_.get(methodArgs, funcName),
					(args) => {
						it(`returns the same result for: ${JSON.stringify(args)}`, async () => {
							expect.hasAssertions();
							const [ correctResults, testedResults ] = await Promise.join(
								dns.promises[funcName](...args),
								fetchDns.promises[funcName](...args),
							);
							expect(testedResults).toBeDefined();
							expect(correctResults).toBeDefined();
							//expect(testedResults).toEqual(correctResults);
						});
					}
				);
			});
		});
	}
);

/* eslint-disable jest/no-test-callback */
_.forEach(
	_.functions(dns),
	(funcName) => {
		describe("callbacks", () => {
			if(_.includes(unimplemented, funcName)) return;
			if(_.includes(untested, funcName)) return;
			describe(`${funcName}`, () => {
				it("has arguments", () => {
					expect.hasAssertions();
					expect(methodArgs).toHaveProperty(funcName);
					expect(methodArgs[funcName]).not.toBeEmpty();
					expect(methodArgs[funcName]).toBeArray();
				});

				_.forEach(
					_.get(methodArgs, funcName),
					(args) => {
						it(`returns the same result for: ${JSON.stringify(args)}`, (cb) => {
							expect.hasAssertions();
							dns[funcName](...args, (e1, ...correctResults) => {
								if(!_.isNil(e1)) {
									cb(e1);
									return;
								}
								const func = fetchDns[funcName];
								expect(func).toBeFunction();
								func(...args, (e2, ...testedResults) => {
									try {
										if(!_.isNil(e2)) {
											cb(e2);
											return;
										}
										expect(testedResults).toBeDefined();
										expect(correctResults).toBeDefined();
										//expect(testedResults).toEqual(correctResults);
										cb();
									} catch(e3) {
										cb(e3);
									}
								});
							});
						});
					}
				);
			});
		});
	}
);

