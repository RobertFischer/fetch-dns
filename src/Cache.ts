import _ from "lodash";
import isFQDN from "validator/lib/isFQDN";
import { EventEmitter } from "events";
import { Record } from "./Record";

interface HasIsEmpty {
	isEmpty():boolean
}

interface IsNotEmpty {
	isEmpty():false
}

interface IsEmpty {
	isEmpty():true
}

type MightBeEmpty = IsNotEmpty|IsEmpty|HasIsEmpty|false|undefined|null

function itIsEmpty(it:MightBeEmpty):it is IsEmpty {
	if(!it || _.isNil(it)) return false;
	return it.isEmpty();
}

function itIsNotEmpty(it:MightBeEmpty):it is IsNotEmpty {
	if(!it || _.isNil(it)) return false;
	return !it.isEmpty();
}

interface RecordEntry<T extends Record.recordtype.Any> {
	record:Record.Typed<T>;
	ttl:number;
}

const CLEAN_PERIOD_MILLIS = 600 * 1000;
const MAX_ELEMENTS = 1000;

const counter = new (class Counter extends EventEmitter {
	private pit = Number.MIN_SAFE_INTEGER;
	private horizon = Number.MIN_SAFE_INTEGER;
	private lastCleaned:number = Date.now();

	private shouldFire() {
		return (this.lastUsedValue() % MAX_ELEMENTS === 0) || (this.lastCleaned + CLEAN_PERIOD_MILLIS < Date.now());
	}

	lastUsedValue() {
		return this.pit;
	}

	private runClean() {
		_.defer(
			this.emit.bind(this),
			"clean",
			Math.max(this.lastUsedValue() - MAX_ELEMENTS, this.horizon)
		);
	}

	nextValue() {
		if(this.lastUsedValue() === Number.MAX_SAFE_INTEGER) {
			// Congrats, you cycled over -- we're resetting everything.
			this.horizon = Number.MAX_SAFE_INTEGER;
			this.runClean();
			this.horizon = this.pit = Number.MIN_SAFE_INTEGER;
		} else if(this.shouldFire()) {
			this.runClean();
			this.horizon = this.lastUsedValue();
			this.lastCleaned = Date.now();
		}
		return this.pit++;
	}
})();
counter.setMaxListeners(4096);

function reverseHostname(hostname:string):string[] {
	if(!isFQDN(hostname)) throw new Error(`Hostname to cache is not a fully qualified domain name (FQDN): ${JSON.stringify(hostname)} (${typeof hostname})`);
	return _.reject(_.reverse(hostname.split('.')), _.isEmpty);
}

class RecordCache<T extends Record.recordtype.Any> implements HasIsEmpty {
	private readonly _records:RecordEntry<T>[];
	private readonly _setAt = Date.now();
	private readonly _setPit = counter.nextValue();
	private readonly _listenForClean = _.throttle(
		() => ( _.isEmpty(this._records) || counter.once("clean", this.clean.bind(this)) ),
		10 * 1000
	);

	constructor(records:RecordEntry<T>[]) {
		this._records = _.cloneDeep(records);
		this._listenForClean();
	}

	get records():RecordEntry<T>[] {
		const now = Date.now();
		return _.cloneDeep(_.filter(
			this._records, 
			(record) => {
				if(_.isEmpty(record) || _.isEmpty(record.record)) return false;
				const ttlSeconds = record.ttl;
				return ( (ttlSeconds*1000) + this._setAt ) >= now;
			}
		));
	}

	private clean(horizon:number=Number.MIN_SAFE_INTEGER):void {
		const { _setPit, _records } = this;
		if(_.isEmpty(_records)) {
			return;
		} else if(_setPit <= horizon) {
			_records.length = 0;
		} else {
			this._listenForClean();
		}
	}

	isEmpty() {
		this.clean();
		return _.isEmpty(this._records);
	}

}

type RecordMapping = {
	[ T in Record.recordtype.Any ]: RecordCache<T>
}

interface Subdomains {
	[key:string]: ResultCache
}

class ResultCache implements HasIsEmpty {
	private readonly _mapping = {} as RecordMapping;
	private readonly _subdomains = {} as Subdomains;
	private readonly _listenForClean = _.throttle(
		() => counter.once("clean", this.clean.bind(this)),
		10 * 1000
	);

	constructor() {
		this._listenForClean();
	}

	isEmpty():boolean {
		this.clean();
		return _.every(this._mapping, itIsEmpty) && _.every(this._subdomains, itIsEmpty);
	}

	private clean():void {
		_.forOwn(
			this._subdomains,
			(results, sub) => {
				if(itIsEmpty(results)) {
					_.unset(this._subdomains, sub);
				}
			}
		);
		_.forOwn(
			this._mapping,
			(records, rrtype) => {
				if(itIsEmpty(records)) {
					_.unset(this._mapping, rrtype);
				}
			}
		);
		this._listenForClean();
	}

	getRecordCache<T extends Record.recordtype.Any>(rrtype:T):(RecordCache<T>|false) {
		const cache = this._mapping[rrtype];
		if(itIsNotEmpty(cache)) {
			return cache as RecordCache<T>;
		} else {
			_.unset(this._mapping, rrtype);
			return false;
		}
	}

	getSubdomain(sub:string):ResultCache {
		const oldSub = this._subdomains[sub];
		if(!oldSub || _.isEmpty(oldSub)) { 
			return (this._subdomains[sub] = new ResultCache());
		} else {
			return oldSub;
		}
	}

	private setRecordCache<T extends Record.recordtype.Any>(rrtype:T, records:RecordEntry<T>[]):void {
		if(_.isEmpty(_.compact(records))) {
			_.unset(this._mapping, rrtype);
		} else {
			(this._mapping as any)[rrtype] = new RecordCache(records);
		}
	}

	setResult<T extends Record.recordtype.Any>(domainParts:string[], rrtype:T, records:RecordEntry<T>[]):void {
		if(_.isEmpty(domainParts)) {
			this.setRecordCache(rrtype, records);
		} else {
			const [ head, ...rest ] = domainParts;
			this.getSubdomain(head).setResult(rest, rrtype, records);
		}
	}

	getResult<T extends Record.recordtype.Any>(domainParts:string[], rrtype:T):(Record.Typed<T>[]|false) {
		if(_.isEmpty(domainParts)) {
			const result = this.getRecordCache(rrtype);
			if(result !== false && itIsNotEmpty(result)) {
				return _.map(result.records, 'record');
			} else {
				return false;
			}
		} else {
			const [ head, ...rest ] = domainParts;
			return this.getSubdomain(head).getResult(rest, rrtype);
		}
	}
}

export default new (class DnsCache {
	private readonly root = new ResultCache();

	put<T extends Record.recordtype.Any>(hostname:string, rrtype:T, records:RecordEntry<T>[]):void {
		records = _.compact(records);
		if(_.isEmpty(hostname) || _.isEmpty(records)) return;
		this.root.setResult(reverseHostname(hostname), rrtype, records);
	}

	check<T extends Record.recordtype.Any>(hostname:string, rrtype:T):(false|Record.Typed<T>[])  {
		if(_.isEmpty(hostname)) return false;
		const result = this.root.getResult(reverseHostname(hostname), rrtype);
		if(result && !_.isEmpty(result)) {
			return result;
		} else {
			return false;
		}
	}
});
