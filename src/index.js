"use strict";

const _ = require("lodash");
const CACHE = require("./Cache").default;
const fetch = require("cross-fetch");
const Promise = require("bluebird");
const makeDebug = require("debug");
const lookupRrtype = require("./Rrtypes").default;
const { name:packageName, version:packageVersion } = require("./package.json");

module.exports = {};
_.merge(module.exports, require("./Constants"));

/* eslint-disable no-magic-numbers */
const DEFAULT_TTL_SECONDS = 3600;
const IP_FAMILY_4 = 4;
const IP_FAMILY_6 = 6;
const IP_FAMILY_ANY = 0;
/* eslint-enable no-magic-numbers */

// DEBUG configuration
const log = makeDebug("fetch-dns");
const debug = log.extend("debug");
const error = log.extend("error");
if(debug.enabled) log.enabled = true;
if(log.enabled) error.enabled = true;
// Retrieve the methods for an object
function getMethods(obj) {
	const properties = new Set();
	let currentObj = obj;
	do {
		Object.getOwnPropertyNames(currentObj).forEach(item => properties.add(item))
	} while ((currentObj = Object.getPrototypeOf(currentObj)))
	return [...properties.keys()].filter(item => _.isFunction(obj[item]));
}

// Promote the methods of an object onto a target.
function promoteMethods(object, target) {
	getMethods(object).forEach(
		(funcName) => {
			target[funcName] = _.bind(object[funcName], object);
		}
	);
}

function forceMatch(input, regex) {
	return _.trim(input).match(regex) || [];
}

function isFamily(it) {
	return _.isFinite(it) && ( it === IP_FAMILY_4 || it === IP_FAMILY_6 || it === IP_FAMILY_ANY );
}

function isLookupOptions(it) {
	if(_.isNil(it)) return false;
	return (
		   (!("family" in it) || isFamily(it.family))
		&& (!("hints" in it) || _.isNumber(it.hints) || _.isNil(it.hints))
		&& (!("all" in it) || _.isBoolean(it.all) || _.isNil(it.all))
		&& (!("verbatim" in it) || _.isBoolean(it.verbatim) || _.isNil(it.verbatim))
	);
}

function splitNaptr(str) { // TODO Add validation
	const [ , order=0, preference=0, afterNumbers="" ] = forceMatch(str, /^(\d+)\s*(\d+)\s*(.*)$/);
	const maybeQuotedStrRE = /("(?:\\\\"|[^"])*"|'(?:\\\\'|[^'])*'|[^\s]+)\s*(.*)$/;
	const [ , flags="", afterFlags="" ] = forceMatch(afterNumbers, maybeQuotedStrRE);
	const [ , service="", afterService="" ] = forceMatch(afterFlags, maybeQuotedStrRE);
	const [ , regexp="", afterRegexp="" ] = forceMatch(afterService, maybeQuotedStrRE);
	const [ , replacement="" ] = forceMatch(afterRegexp, maybeQuotedStrRE);
	const record = {
		order: _.toFinite(order),
		preference: _.toFinite(preference),
		flags, service, regexp, replacement
	};
	debug("Parsed a NAPTR record's data", { data:str, record });
	return record;
}

function isLookupAllOptions(it) {
	return isLookupOptions(it) && it.all === true; // Yes, the "=== true" matters here for typing
}
function isLookupOneOptions(it) {
	return isLookupOptions(it) && !it.all;
}

function toLookupAddress(family, hostname) {
	return (address) => {
		if(_.isEmpty(address)) {
			throw new Error(`No IPv${family} address found for ${hostname}`);
		}
		return ({ address, family });
	}
}

function isResolveOptions(it) {
	if(_.isEmpty(it)) return false;
	return 'ttl' in it && _.isBoolean(it.ttl);
}

function isResolveWithTtlOptions(it) {
	return isResolveOptions(it) && it.ttl === true;
}

class NotImplementedError extends Error {
	constructor(methodName) {
		super(`'${methodName}' is not implemented in ${packageName} ${packageVersion}`);
		this.methodName = methodName;
		this.name = "NotImplementedError";
	}
}

/* eslint-disable promise/no-callback-in-promise */
function callbackPromise1(promise, callback) {
	const cb = _.once(callback);
	Promise.resolve(promise).tap( (result) => { cb(null, result) }).catch((e) => { cb(e); });
}

function callbackPromise2(promise, callback) {
	const cb = _.once(callback);
	Promise.resolve(promise).tap(
		( [t, u] ) => { cb(null, t, u); }
	).catch(
		(e) => { cb(e); }
	);
}

function lookupCallback(promise, callback) {
	callbackPromise2(
		promise.then( ({address, family}) => [address, family] ),
		callback
	);
}
/* eslint-enable promise/no-callback-in-promise */

const DEFAULT_SERVERS = [ 'https://dns.google.com/resolve', 'https://cloudflare-dns.com/dns-query' ];

module.exports.getDefaultServers = () => { return _.cloneDeep(DEFAULT_SERVERS); };

const promises = (module.exports.promises = {});

promises.Resolver = class PromiseResolver {

	constructor(servers=DEFAULT_SERVERS) {
		this.setServers(servers); // Ensures we don't accept empty servers
	}

	// The actual fetch-based DNS lookup implementations: everything is derived from here!
	_doResolve(hostname, rrtype, mapper) {
		const cachedResult = CACHE.check(hostname, rrtype);
		if(!_.isEmpty(cachedResult)) {
			debug("Retrieved cached result", { hostname, rrtype, cachedResult });
			return Promise.resolve(cachedResult);
		}
		const server = this._pickServer();
		const url = `${server}?name=${hostname}&type=${rrtype === "ANY" ? "*" : _.toUpper(rrtype)}`;
		return Promise.resolve(fetch(
			url,
			{
				method: "GET",
				headers: { "Accept": "application/dns-json" },
				mode: "no-cors",
				keepalive: true,
			}
		)).then(
			async (res) => {
				if(!res.ok) {
					log("Result of fetching DNS record over HTTPS was not 'OK'", { status: `${res.status} ${res.statusText}`, hostname, rrtype, server, requestUrl:url, resultUrl:res.url });
					return [];
				}
				const body = await res.json();
				debug("Retrieved result", body);
				const results = await Promise.map(
					_.get(body, 'Answer', []),
					async (ans) => {
						const ttl = _.isFinite(ans.TTL) ? ans.TTL : DEFAULT_TTL_SECONDS;
						const result = await mapper({ ...ans, rrtype, ttl });
						return { result, ttl };
					}
				);
				CACHE.put(hostname, rrtype, results);
				const toReturn = _.reject(_.map(results, 'result'), _.isEmpty);
				debug("Result of fetching DNS", hostname, rrtype, toReturn);
				return toReturn;
			}
		).then(
			_.compact
		).tap(
			(result) => {
				if(_.isEmpty(result)) {
					debug("Returning an empty result for a resolve", { hostname, rrtype, result });
				}
			}
		);
	}

	// A common, simple case.
	_doResolveSimple(hostname, rrtype) {
		const toReturn = this._doResolve(hostname, rrtype, ({ data }) => data);
		if(_.isEmpty(toReturn)) {
			debug("Returning an empty result for a simple resolve", { hostname, rrtype, result:toReturn });
		}
		return toReturn;
	}

	getServers() {
		const servers = this._servers;
		if(!servers || _.isEmpty(servers)) {
			throw new Error("No servers found");
		} else {
			return _.cloneDeep(this._servers);
		}
	}

	setServers(servers) {
		this._servers = _.cloneDeep(
			_.isEmpty(servers) ?  DEFAULT_SERVERS : servers
		);
	}

	_pickServer() {
		const toReturn = _.sample(this.getServers());
		if(_.isNil(toReturn)) {
			throw new Error(`No server picked: ${JSON.stringify(this.servers)}`);
		} else {
			return toReturn;
		}
	}

	lookup(hostname, familyOrOptions) {
		if(_.isNil(familyOrOptions)) {
			return this._lookupHostname(hostname);
		} else if(isFamily(familyOrOptions)) {
			return this._lookupHostnameFamily(hostname, familyOrOptions);
		} else {
			return this._lookupHostnameOptions(hostname, familyOrOptions);
		}
	}

	_lookupHostname(hostname) {
		return this._lookupHostnameFamily(hostname, 0);
	}

	_lookupHostnameFamily(hostname, family) {
		if(family === IP_FAMILY_4) {
			return this._lookup4(hostname);
		} else if(family === IP_FAMILY_6) {
			return this._lookup6(hostname);
		} else {
			return Promise.any([
				this._lookup4(hostname),
				this._lookup6(hostname),
			]);
		}
	}

	_lookup4(hostname) {
		return this.resolve4(hostname).then((result) => {
			log("Retrieved hostname via lookup4", hostname, result);
			if(_.isArray(result)) {
				return _.head(result);
			} else {
				return result;
			}
		}).then((result) => {
			if(_.isNil(result)) {
				throw new Error(`No result found when querying for 'A' record of '${hostname}'`);
			} else {
				return result;
			}
		}).then(toLookupAddress(IP_FAMILY_4, hostname));
	}

	_lookup6(hostname) {
		const mkLA = toLookupAddress(IP_FAMILY_6, hostname);
		return this.resolve6(hostname).then( (result) => {
			if(_.isArray(result)) {
				return _.sample(result);
			} else {
				return result;
			}
		}).then((result) => {
			if(_.isNil(result)) {
				throw new Error(`No result found when querying for 'AAAA' record of '${hostname}'`);
			} else {
				return result;
			}
		}).then(mkLA);
	}

	_lookupHostnameOptions(hostname, options) {
		// The 'verbatim' flag doesn't actually do anything because of the implementation.
		// The 'hint' flag isn't supported by DoH.
		const optionsFamily = _.get(options, 'family', IP_FAMILY_4);
		if(!isFamily(optionsFamily)) {
			throw new Error(`Could not determine desired address family (4, 6, or 0) from options: ${JSON.stringify(options)}`);
		}
		if(_.isNil(options.all) || !options.all) {
			return this._lookupHostnameFamily(hostname, optionsFamily);
		} else {
			const toLookupAddress4 = toLookupAddress(IP_FAMILY_4, hostname);
			const toLookupAddress6 = toLookupAddress(IP_FAMILY_6, hostname);
			if(optionsFamily === IP_FAMILY_4) {
				return this.resolve4(hostname).map(toLookupAddress4);
			} else if(optionsFamily === IP_FAMILY_6) {
				return this.resolve6(hostname).map(toLookupAddress6);
			} else if(optionsFamily === IP_FAMILY_ANY) {
				return Promise.join(
					this.resolve4(hostname).map(toLookupAddress4),
					this.resolve6(hostname).map(toLookupAddress6),
				).then(_.concat).then(_.flatten);
			}
		}
		throw new Error(`Unreachable code reached in '_lookupHostnameOptions(${JSON.stringify(hostname)},${JSON.stringify(options)})'`);
	}

	lookupService(/*address, port*/) {
		// TODO Find/create a web service exposing `getnameinfo` over HTTP
		return new NotImplementedError('lookupService');
	}

	async resolve(hostname, rrtype) {
		if(_.isEmpty(rrtype)) {
			return this.resolve4(hostname);
		} else {
			const methodRrType = _.upperFirst(_.toLower(rrtype));
			if(methodRrType === "A") {
				return this.resolve4(hostname);
			} else if(methodRrType === "Aaaa") {
				return this.resolve6(hostname);
			} else {
				const f = this[`resolve${methodRrType}`];
				if(_.isFunction(f)) {
					return f.call(this, hostname);
				} else {
					throw new NotImplementedError(`resolve(...,${JSON.stringify(rrtype)})`);
				}
			}
		}
	}

	resolve4(hostname, options) {
		const ttl = !!_.get(options, 'ttl', false);
		if(ttl) {
			return this._doResolve(hostname, "A", (res) => ({ address: res.data, ttl: res.ttl }));
		} else {
			return this._doResolveSimple(hostname, "A");
		}
	}


	resolve6(hostname, options){
		const ttl = !!_.get(options, 'ttl', false);
		if(ttl) {
			return this._doResolve(hostname, "AAAA", (res) => ({ address: res.data, ttl: res.ttl }));
		} else {
			return this._doResolveSimple(hostname, "AAAA");
		}
	}

	resolveAny(hostname) {
		const results = this._doResolve(
			hostname,
			"*",
			(initialResponse) => {
				const rrtype = lookupRrtype(initialResponse.type);
				return Promise.resolve(this.resolve(hostname, rrtype)).catch(
					NotImplementedError,
					() => {
						debug("Skipping lookup for unsupported rrtype", { rrtype, hostname })
						return [];
					}
				).map(
					(res) => {
						if(_.isEmpty(res)) {
							log("Saw an empty response", { hostname, rrtype, res });
							return null;
						} else if(_.isString(res)) {
							return { value:res, type:rrtype };
						} else {
							return { ...res, type:rrtype };
						}
					}
				);
			}
		);
		return _.compact(_.flatten(results));
	}

	resolveCname(hostname) { return this._doResolveSimple(hostname, "CNAME"); }

	resolveMx(hostname) {
		return this._doResolve(
			hostname,
			"MX",
			({data}) => {
				const [priority,exchange] = _.split(_.trim(data), /\s+/, 2);
				if(_.isEmpty(priority) || _.isEmpty(exchange)) {
					log("Discovered an MX record with empty priority or exchange", { hostname }, data);
					return [];
				} else {
					return { priority:_.toFinite(priority), exchange };
				}
			}
		).then(_.flatten);
	}

	resolveNaptr(hostname) {
		return this._doResolve(
			hostname, "NAPTR",
			({data}) => splitNaptr(data)
		);
	}

	resolveNs(hostname) { return this._doResolveSimple(hostname, "NS"); }

	resolvePtr(hostname) { return this._doResolveSimple(hostname, "PTR"); }

	resolveSoa(hostname) {
		return this._doResolve(hostname, "SOA", (ans) => {
			const { data } = ans;
			const [ nsname, hostmaster, serial, refresh, retry, expire, minttl ] = _.split(_.trim(data), /\s+/);
			return {
				...ans,
				nsname,
				hostmaster,
				serial: _.toFinite(serial),
				refresh: _.toFinite(refresh),
				retry: _.toFinite(retry),
				expire: _.toFinite(expire),
				minttl: _.toFinite(minttl),
			};
		}).then(_.head).then( (result) => {
			if(_.isNil(result)) {
				throw new Error(`No SOA record was able to be found for '${hostname}'`);
			} else {
				return result;
			}
		});
	}

	resolveTxt(hostname) { return this._doResolve(hostname, "TXT", ({data}) => [data]); }

	resolveSrv(hostname) {
		return this._doResolve(hostname, "SRV", (ans) => {
			const { data } = ans;
			const [ , , , , , priority, weight, port, name ] = _.split(_.trim(data), /s+/);
			return {
				...ans,
				priority: _.toFinite(priority),
				weight: _.toFinite(weight),
				port: _.toFinite(port),
				name: name,
			};
		});
	}

	async reverse(ip) {
		// TODO Find/create a web service that exposes reverse DNS lookups
		throw new NotImplementedError('reverse');
	}

}

const PROMISE_RESOLVER = new promises.Resolver(DEFAULT_SERVERS);
promoteMethods(PROMISE_RESOLVER, promises);


const Resolver = module.exports.Resolver = class Resolver {

	constructor(resolver=new promises.Resolver(DEFAULT_SERVERS)) {
		this.resolver = resolver;
	}

	getServers() {
			return this.resolver.getServers();
	}

	setServers(newServers) {
		this.resolver.setServers(newServers);
	}

	lookup(hostname, familyOptionsOrCallback, callback) {
		if(_.isFunction(familyOptionsOrCallback)) {
			this._lookupHostname(hostname, familyOptionsOrCallback);
		} else if(isFamily(familyOptionsOrCallback)) {
			this._lookupFamily(hostname, familyOptionsOrCallback, callback);
		} else if(isLookupAllOptions(familyOptionsOrCallback)) {
			this._lookupAll(hostname, familyOptionsOrCallback, callback);
		} else if(isLookupOneOptions(familyOptionsOrCallback)) {
			this._lookupOne(hostname, familyOptionsOrCallback, callback);
		} else {
			throw new Error(`Unknown lookup type based on args: ${JSON.stringify({ hostname, familyOptionsOrCallback, callback })}`);
		}
	}

	_lookupHostname(hostname, callback) {
		lookupCallback(this.resolver.lookup(hostname), callback);
	}

	_lookupFamily(hostname, family, callback) {
		lookupCallback(this.resolver.lookup(hostname, family), callback);
	}

	_lookupAll(hostname, options, callback) {
		callbackPromise1(this.resolver.lookup(hostname, options), callback);
	}

	_lookupOne(hostname, options, callback) {
		lookupCallback(this.resolver.lookup(hostname, options), callback);
	}

	lookupService(address, port, callback) {
		callbackPromise1(
			this.resolver.lookupService(address, port),
			(e, params) => {
				if(_.isNil(e)) {
					if(_.isNil(params)) {
						throw new Error(`No parameters nor error provided to the callback`);
					} else {
						const { hostname, service } = params;
						callback(null, hostname, service);
					}
				} else if(_.isError(e)) {
					callback(e);
				} else {
					throw new Error(`First argument is neither nil nor an error: ${e} (${typeof e})`);
				}
			}
		);
	}

	resolve(hostname, rrtypeOrCallback, callback) {
		if(_.isFunction(rrtypeOrCallback)) {
			callbackPromise1(this.resolver.resolve(hostname), rrtypeOrCallback);
		} else {
			const rrtype = _.upperFirst(_.toLower(rrtypeOrCallback));
			if(rrtype === "A") {
				this.resolve4(hostname, callback);
			} else if(rrtype === "Aaaa") {
				this.resolve6(hostname, callback);
			} else {
				const f = this[`resolve${rrtype}`];
				if(_.isFunction(f)) {
					f.call(this, hostname, callback);
				} else {
					callback(new NotImplementedError(`resolve(...,${JSON.stringify(rrtypeOrCallback)})`));
				}
			}
		}
	}

	resolve4(hostname, optionsOrCallback, callback) {
		if(_.isFunction(optionsOrCallback)) {
			this._resolve4Hostname(hostname, optionsOrCallback);
		} else if(isResolveWithTtlOptions(optionsOrCallback)) {
			this._resolve4Ttl(hostname, callback);
		} else {
			const cb = (err, recordsWithTtl) => callback(err, recordsWithTtl && _.map(recordsWithTtl, 'address'));
			this._resolve4Ttl(hostname, cb);
		}
	}

	_resolve4Hostname(hostname, callback) {
		callbackPromise1(this.resolver.resolve4(hostname), callback);
	}

	_resolve4Ttl(hostname, callback) {
		callbackPromise1(this.resolver.resolve4(hostname, { ttl: true }), callback);
	}

	resolve6(hostname, optionsOrCallback, callback) {
		if(_.isFunction(optionsOrCallback)) {
			this._resolve6Hostname(hostname, optionsOrCallback);
		} else if(isResolveWithTtlOptions(optionsOrCallback)) {
			this._resolve6Ttl(hostname, callback);
		} else {
			const cb = (err, recordsWithTtl) => callback(err, recordsWithTtl && _.map(recordsWithTtl, 'address'));
			this._resolve6Ttl(hostname, cb);
		}
	}

	_resolve6Hostname(hostname, callback) {
		callbackPromise1(this.resolver.resolve6(hostname), callback);
	}

	_resolve6Ttl(hostname, callback) {
		callbackPromise1(this.resolver.resolve6(hostname, { ttl: true }), callback);
	}

	resolveAny(hostname, callback) {
		callbackPromise1(this.resolver.resolveAny(hostname), callback);
	}

	resolveCname(hostname, callback) {
		callbackPromise1(this.resolver.resolveCname(hostname), callback);
	}

	resolveMx(hostname, callback) {
		callbackPromise1(this.resolver.resolveMx(hostname), callback);
	}

	resolveNaptr(hostname, callback) {
		callbackPromise1(this.resolver.resolveNaptr(hostname), callback);
	}

	resolveNs(hostname, callback) {
		callbackPromise1(this.resolver.resolveNs(hostname), callback);
	}

	resolvePtr(hostname, callback) {
		callbackPromise1(this.resolver.resolvePtr(hostname), callback);
	}

	resolveSoa(hostname, callback) {
		callbackPromise1(this.resolver.resolveSoa(hostname), callback);
	}

	resolveSrv(hostname, callback) {
		callbackPromise1(this.resolver.resolveSrv(hostname), callback);
	}

	resolveTxt(hostname, callback) {
		callbackPromise1(this.resolver.resolveTxt(hostname), callback);
	}

	reverse(ip, callback) {
		callbackPromise1(this.resolver.reverse(ip), callback);
	}

	cancel() {
		this.resolver.cancel().catch((e) => log("Error while cancelling", e));
	}
}

const CB_RESOLVER = new Resolver(PROMISE_RESOLVER);
promoteMethods(CB_RESOLVER, module.exports);

debug("export", module.exports);
