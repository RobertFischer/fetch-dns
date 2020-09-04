/** @format */

import makeDebug from "debug";

const log = makeDebug("fetch-dns:Record");
const debug = log.extend("debug");
const error = log.extend("error");
if (debug.enabled) log.enabled = true;
if (log.enabled) error.enabled = true;

export type Hostname = string;
export type Address = string;
export type Family = 4 | 6 | 0;
export type Service = string;

export interface ResolveAnswer<T extends Record.recordtype.Any> {
	name: string;
	rrtype: T;
	ttl: number;
	data: string;
}

export namespace Record {
	export type Simple = string;

	export type MaybeTtl = Simple | WithTtl;

	export interface WithTtl {
		address: Address;
		ttl: number;
	}

	export interface Mx {
		priority: number;
		exchange: string;
	}

	export interface Naptr {
		order: number;
		preference: number;
		flags: string;
		service: string;
		regexp: string;
		replacement: string;
	}

	export type Txt = string[];

	export interface Soa {
		nsname: Hostname;
		hostmaster: Hostname;
		serial: number;
		refresh: number;
		retry: number;
		expire: number;
		minttl: number;
	}

	export interface Srv {
		priority: number;
		weight: number;
		port: number;
		name: Hostname;
	}

	export type Any = Txt | Srv | Soa | Naptr | Mx | Simple | WithTtl | MaybeTtl;

	export namespace recordtype {
		export type A = "A";
		export type AAAA = "AAAA";
		export type ANY = "ANY";
		export type CNAME = "CNAME";
		export type MX = "MX";
		export type NAPTR = "NAPTR";
		export type SOA = "SOA";
		export type SRV = "SRV";
		export type TXT = "TXT";
		export type PTR = "PTR";
		export type NS = "NS";

		export type ALike = A | AAAA;

		export type Any =
			| A
			| AAAA
			| ANY
			| CNAME
			| MX
			| NAPTR
			| SOA
			| SRV
			| TXT
			| PTR;

		export type Simple = ALike | CNAME | PTR | NS;
	}

	export type Typed<T extends recordtype.Any> = T extends recordtype.ALike
		? MaybeTtl
		: T extends recordtype.Simple
		? Simple
		: T extends recordtype.MX
		? Mx
		: T extends recordtype.NAPTR
		? Naptr
		: T extends recordtype.SOA
		? Soa
		: T extends recordtype.SRV
		? Srv
		: T extends recordtype.TXT
		? Txt
		: T extends recordtype.ANY
		? Any
		: never;
}
