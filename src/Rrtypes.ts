import data from "./Rrtypes.json";
import _ from "lodash";
import Debug from "debug";

const log = Debug("fetch-dns:rrtypes");
const debug = log.extend("debug");
if(debug.enabled) log.enabled = true;

const rrtypeMap = _.fromPairs(_.flatMap(
	data,
	(rrtype) => {
		debug("Processing RRTYPE map entry", rrtype);
		const { TYPE, Value } = rrtype || {};
		if(TYPE === "Unassigned" || TYPE === "Private use" || TYPE === "Reserved") {
			debug("Skipping unused RRTYPE allocation", TYPE, Value);
			return [];
		}
		const [ start, stop ] = _.map(_.split(Value, "-", 2), _.toFinite);
		if(_.includes(Value, "-")) {
			if(start === 0 || stop === 0) {
				log("Discovered an unbounded value", rrtype);
				return [];
			} else {
				return _.map(
					_.range(start, stop+1),
					(i) => [ _.toString(i), TYPE ]
				);
			}
		} else {
			return [ [ Value, TYPE ] ];
		}
	}
));

log(rrtypeMap);

export default function lookupRrtype(rrtype:number):string|false {
	const result = _.get(rrtypeMap, _.toString(rrtype), null);
	debug("Lookup up RRTYPE", { rrtype, result });
	if(_.isNil(result)) {
		return false;
	} else if(!_.isString(result)) {
		throw new Error(`INTERNAL ERROR: rrtype return was neither nil nor a string, but '${typeof result}' (${result})`);
	} else {
		return result;
	}
}
