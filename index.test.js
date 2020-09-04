/** @format */

"use strict";

const dns = require("dns");
const DEFAULT_SERVERS = require("./DefaultServers").default;
const _ = require("lodash");
const fetchDns = require("./index");
const Promise = require("bluebird");
const debug = require("debug")("index-test");

const defaultUrl = "knowledgefight.com";
const unimplementedOrUntested = [
	"reverse",
	"lookupService",
	"Resolver",
	"getServers",
	"setServers", // These two are manually handled
];
const needingTestCases = [
	"resolveNaptr",
	"resolveSoa",
	"resolveSrv",
	"resolvePtr",
	"resolve6",
	"resolveAny",
];
const methodArgs = {
	lookup: [
		[defaultUrl],
		[defaultUrl, 4],
		//[ "google.com", 6 ],
		[defaultUrl, 0],
		[defaultUrl, { all: false }],
		[defaultUrl, { family: 0, all: false }],
		[defaultUrl, { family: 4, all: false }],
		//[ "google.com", { family: 6, all: false } ],
		[defaultUrl, { all: true }],
		[defaultUrl, { family: 0, all: true }],
		[defaultUrl, { family: 4, all: true }],
		//[ "google.com", { family: 6, all: true } ],
	],
	resolve: [
		[defaultUrl],
		[defaultUrl, "A"],
		//[ "google.com", "AAAA" ],
		//[ defaultUrl, "ANY" ],
		["elibosnick.wixsite.com", "CNAME"],
		["gmail.com", "MX"],
		["google.com", "TXT"],
	],
	resolve4: [
		[defaultUrl],
		[defaultUrl, { ttl: true }],
		[defaultUrl, { ttl: false }],
	],
	resolve6: [
		["google.com"],
		["google.com", { ttl: true }],
		["google.com", { ttl: false }],
	],
	resolveCname: [["elibosnick.wixsite.com"]],
	resolveMx: [["gmail.com"]],
	resolveNs: [[defaultUrl]],
	resolveTxt: [["google.com"]],
	resolveAny: [[defaultUrl]],
};

/* eslint-disable no-invalid-this */
function toBeShapedLike(received, expected, path = "") {
	this.toBeShapedLike = toBeShapedLike; // enables the recursive usage
	const { isNot, promise } = this;
	const stringify = this.utils.stringify.bind(this.utils);
	const matcherHint = (opts) => () => {
		if (_.isString(opts)) opts = { comment: opts };
		return this.utils.matcherHint(
			`toBeShapedLike${path}`,
			stringify(received),
			stringify(expected),
			_.merge({ isNot, promise }, opts),
		);
	};
	if (_.isNil(received) !== _.isNil(expected)) {
		return {
			pass: false,
			message: matcherHint(
				`Received value is ${
					_.isNil(received) ? "nil" : "not nil"
				}, but we expected ${_.isNil(expected) ? "nil" : "not nil"}`,
			),
		};
	}
	if (typeof received !== typeof expected) {
		return {
			pass: false,
			message: matcherHint(
				`Received a '${typeof received}', but expected a '${typeof expected}'`,
			),
		};
	}
	if (_.isArray(received)) {
		const sizeToTest = Math.min(_.size(received), _.size(expected));
		const result = _.head(
			_.compact(
				_.map(
					_.take(_.zip(received, expected), sizeToTest),
					([reVal, exVal], idx) => {
						const iterResult = this.toBeShapedLike(
							reVal,
							exVal,
							`${path}[${idx}]`,
						);
						if (iterResult.pass !== isNot) {
							return iterResult;
						} else {
							return null;
						}
					}
				),
			),
		);
		if (result) return result;
	}
	if (_.isObject(received)) {
		if (
			!this.equals(
				_.sortBy(_.keys(received), _.toString),
				_.sortBy(_.keys(expected), _.toString),
			)
		) {
			return {
				pass: false,
				message: matcherHint(
					`Expected the following keys: ${JSON.stringify(
						_.keys(expected),
					)}, but receieved these keys: ${JSON.stringify(_.keys(received))}`,
				),
			};
		}
		const result = _.head(
			_.compact(
				_.map(received, (reVal, key) => {
					if (_.includes(key, ".")) {
						key = `["${key}"]`;
					} else {
						key = `.${key}`;
					}
					const iterResult = this.toBeShapedLike(
						reVal,
						_.get(expected, key),
						`${path}${key}`,
					);
					if (iterResult.pass !== isNot) {
						return iterResult;
					} else {
						return null;
					}
				}),
			),
		);
		if (result) return result;
	}
	if (_.isEmpty(received) !== _.isEmpty(expected)) {
		return {
			pass: false,
			message: matcherHint(
				`Received value is ${
					_.isEmpty(received) ? "empty" : "not empty"
				}, but we expected ${_.isEmpty(expected) ? "empty" : "not empty"}`,
			),
		};
	}
	return {
		pass: true,
		message: matcherHint(
			`Received value had the same shape as the expected value`,
		),
	};
}
/* eslint-enable no-invalid-this */
expect.extend({ toBeShapedLike });

describe("functions with good test cases", () => {
	_.forEach(_.functions(dns.promises), (funcName) => {
		debug("Processing function: ", funcName);
		describe("promises", () => {
			if (_.includes(unimplementedOrUntested, funcName)) return;
			if (_.includes(needingTestCases, funcName)) return;
			describe(`${funcName}`, () => {
				it("has arguments to test", () => {
					expect.hasAssertions();
					expect(methodArgs).toHaveProperty(funcName);
					expect(methodArgs[funcName]).not.toBeEmpty();
					expect(methodArgs[funcName]).toBeArray();
				});

				_.forEach(_.get(methodArgs, funcName), (args) => {
					it(`returns the same result for: ${JSON.stringify(
						args,
					)}`, async () => {
						expect.hasAssertions();
						const [correctResults, testedResults] = await Promise.join(
							dns.promises[funcName](...args),
							fetchDns.promises[funcName](...args),
						);
						expect(testedResults).toBeDefined();
						expect(correctResults).toBeDefined();
						expect(testedResults).toBeShapedLike(correctResults);
					});
				});
			});
		});
	});

	/* eslint-disable jest/no-test-callback */
	_.forEach(_.functions(dns), (funcName) => {
		describe("callbacks", () => {
			if (_.includes(unimplementedOrUntested, funcName)) return;
			if (_.includes(needingTestCases, funcName)) return;
			describe(`${funcName}`, () => {
				it("has arguments", () => {
					expect.hasAssertions();
					expect(methodArgs).toHaveProperty(funcName);
					expect(methodArgs[funcName]).not.toBeEmpty();
					expect(methodArgs[funcName]).toBeArray();
				});

				_.forEach(_.get(methodArgs, funcName), (args) => {
					it(`returns the same result for: ${JSON.stringify(args)}`, (cb) => {
						expect.hasAssertions();
						dns[funcName](...args, (e1, ...correctResults) => {
							if (!_.isNil(e1)) {
								cb(e1);
								return;
							}
							const func = fetchDns[funcName];
							expect(func).toBeFunction();
							func(...args, (e2, ...testedResults) => {
								try {
									if (!_.isNil(e2)) {
										cb(e2);
										return;
									}
									expect(testedResults).toBeDefined();
									expect(correctResults).toBeDefined();
									expect(testedResults).toBeShapedLike(correctResults);
									cb();
								} catch (e3) {
									cb(e3);
								}
							});
						});
					});
				});
			});
		});
	});
});

describe("functions needing test cases", () => {
	_.forEach(needingTestCases, (funcName) => {
		if (_.includes(unimplementedOrUntested, funcName)) return;
		describe(`promises.${funcName}`, () => {
			it("executes successfully", async () => {
				expect.hasAssertions();
				expect(await fetchDns.promises[funcName](defaultUrl)).not.toBeNil();
			});
		});
		describe(`${funcName}`, () => {
			it("executes successfully", (cb) => {
				expect.hasAssertions();
				fetchDns[funcName](defaultUrl, (err, ...args) => {
					expect(err).toBeNil();
					expect(args).not.toBeEmpty();
					expect(_.compact(args)).not.toBeEmpty();
					cb(err);
				});
			});
		});
	});
});

describe("get and set servers", () => {
	it("is not empty intially", () => {
		expect.hasAssertions();
		expect(fetchDns.getServers()).toBeArray();
		expect(fetchDns.getServers()).not.toBeEmpty();
		expect(fetchDns.getServers()).toIncludeSameMembers(DEFAULT_SERVERS);
	});

	it("returns the servers just assigned", () => {
		expect.hasAssertions();
		const servers = [_.sample(DEFAULT_SERVERS)];
		fetchDns.setServers(servers);
		expect(fetchDns.getServers()).toBeArray();
		expect(fetchDns.getServers()).not.toBeEmpty();
		expect(fetchDns.getServers()).toIncludeSameMembers(servers);
	});
});
