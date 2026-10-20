/**
 * @module
 * @internal
 */

/**
 * @internal
 * A JSON schema, as accepted by {@link compile}.
 */
export type Schema = boolean | Node;

/**
 * @internal
 * The JSON schema keywords understood by {@link compile}.
 */
export type Node = {
	$id?: string;
	$ref?: string;
	$anchor?: string;
	$dynamicAnchor?: string;
	$defs?: Record<string, Schema>;
	definitions?: Record<string, Schema>;
	type?: string | string[];
	const?: unknown;
	enum?: unknown[];
	allOf?: Schema[];
	anyOf?: Schema[];
	oneOf?: Schema[];
	not?: Schema;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number | boolean;
	exclusiveMaximum?: number | boolean;
	multipleOf?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: string;
	items?: Schema | Schema[];
	prefixItems?: Schema[];
	additionalItems?: Schema;
	contains?: Schema;
	minContains?: number;
	maxContains?: number;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	properties?: Record<string, Schema>;
	patternProperties?: Record<string, Schema>;
	additionalProperties?: Schema;
	propertyNames?: Schema;
	required?: string[];
	minProperties?: number;
	maxProperties?: number;
};

/**
 * @internal
 * The generated source for a {@link Schema}.
 */
export type Output = {
	/** The constant and function declarations. */
	code: string;
	/** The {@link helpers} used by `code`, in dependency order. */
	deps: string[];
};

/**
 * @internal
 * A single validation error, as created by generated code.
 */
type Invalid = {
	instanceLocation: string;
	keywordLocation: string;
	error: string;
};

type Factory = (...deps: never[]) => unknown;

/**
 * @internal
 * A helper factory and the names of the helpers it depends on.
 */
type Helper = [Factory, ...string[]];

function isNode(x: unknown): x is Node {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

/**
 * @internal
 * Deep equality for JSON values.
 */
function equal(): (a: unknown, b: unknown) => boolean {
	let isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
	let eq = (a: unknown, b: unknown): boolean => {
		if (a === b) return true;
		if (!isRecord(a) || !isRecord(b)) return false;
		if (Array.isArray(a) !== Array.isArray(b)) return false;
		let keys = Object.keys(a);
		if (keys.length !== Object.keys(b).length) return false;
		for (let k of keys) {
			if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false;
		}
		return true;
	};
	return eq;
}

/**
 * @internal
 * The runtime helpers available to generated code, referenced as `$<name>`.
 *
 * Each factory must be self-contained, since its source is copied into compiled modules.
 */
export const helpers: Record<string, Helper> = {
	err: [() => (i: string, k: string, m: string): Invalid => ({
		instanceLocation: i,
		keywordLocation: k,
		error: m,
	})],
	e: [
		(err: (i: string, k: string, m: string) => Invalid) =>
		(E: Invalid[] | undefined, i: string, k: string, m: string) => {
			E = E || [];
			E.push(err(i, k, m));
			return E;
		},
		'err',
	],
	m: [() => (E: Invalid[] | undefined, r: Invalid[], i: string, k: string) => {
		for (let e of r) {
			e.instanceLocation = i + e.instanceLocation;
			e.keywordLocation = k + e.keywordLocation;
		}
		return E ? E.concat(r) : r;
	}],
	p: [() => (r: Invalid, i: string, k: string) => {
		r.instanceLocation = i + r.instanceLocation;
		r.keywordLocation = k + r.keywordLocation;
		return r;
	}],
	ptr: [() => (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1')],
	has: [() => (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)],
	len: [() => (s: string) => {
		let n = 0;
		for (let i = 0; i < s.length; i++) {
			if ((s.charCodeAt(i) & 0xfc00) !== 0xdc00) n++;
		}
		return n;
	}],
	mul: [() => (x: number, m: number) => {
		let q = x / m;
		return isFinite(q) ? Math.abs(q - Math.round(q)) < 1e-8 : x % m === 0;
	}],
	eq: [equal],
	in: [
		(eq: (a: unknown, b: unknown) => boolean) => (x: unknown, list: unknown[]) => {
			for (let v of list) if (eq(x, v)) return true;
			return false;
		},
		'eq',
	],
	dup: [
		(eq: (a: unknown, b: unknown) => boolean) => (list: unknown[]) => {
			let i = 0, j = 0, n = list.length;
			let seen = new Set<unknown>();
			for (; i < n; i++) {
				let v = list[i];
				if (typeof v === 'object' && v !== null) break;
				if (seen.has(v)) return true;
				seen.add(v);
			}
			if (i === n) return false;
			for (i = 0; i < n; i++) {
				for (j = i + 1; j < n; j++) {
					if (eq(list[i], list[j])) return true;
				}
			}
			return false;
		},
		'eq',
	],
	date: [() => {
		let R = /^(\d{4})-(\d\d)-(\d\d)$/;
		return (s: string) => {
			let m = R.exec(s);
			if (!m) return false;
			let y = +m[1], mo = +m[2], d = +m[3];
			let max = mo === 2
				? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28)
				: 30 + ((mo + (mo >> 3)) & 1);
			return mo >= 1 && mo <= 12 && d >= 1 && d <= max;
		};
	}],
	time: [() => {
		let R = /^(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:z|([+-])(\d\d):(\d\d))$/i;
		return (s: string) => {
			let m = R.exec(s);
			if (!m) return false;
			let h = +m[1], mi = +m[2], sec = +m[3];
			let oh = m[4] ? +m[5] : 0, om = m[4] ? +m[6] : 0;
			if (h > 23 || mi > 59 || sec > 60 || oh > 23 || om > 59) return false;
			if (sec < 60) return true;
			let utc = h * 60 + mi - (m[4] === '-' ? -1 : 1) * (oh * 60 + om);
			return (utc % 1440 + 1440) % 1440 === 1439;
		};
	}],
	dt: [
		(date: (s: string) => boolean, time: (s: string) => boolean) => (s: string) => {
			let p = s.split(/t/i);
			return p.length === 2 && date(p[0]) && time(p[1]);
		},
		'date',
		'time',
	],
	ipv4: [() => {
		let R = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
		return (s: string) => R.test(s);
	}],
	ipv6: [
		(ipv4: (s: string) => boolean) => {
			let R = /^[\da-f]{1,4}$/i;
			return (s: string) => {
				let parts = s.split('::');
				if (parts.length > 2) return false;
				let head = parts[0] ? parts[0].split(':') : [];
				let tail = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
				let all = head.concat(tail);
				let n = all.length;
				let last = all[n - 1];
				if (last && last.includes('.')) {
					if (parts.length > 1 && !tail.length) return false;
					if (!ipv4(last)) return false;
					all.pop();
					n++;
				}
				for (let g of all) if (!R.test(g)) return false;
				return parts.length > 1 ? n < 8 : n === 8;
			};
		},
		'ipv4',
	],
	puny: [() => {
		let adapt = (delta: number, size: number, first: boolean) => {
			let k = 0;
			delta = first ? Math.floor(delta / 700) : delta >> 1;
			delta += Math.floor(delta / size);
			for (; delta > 455; k += 36) delta = Math.floor(delta / 35);
			return Math.floor(k + 36 * delta / (delta + 38));
		};
		let threshold = (k: number, bias: number) => k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
		let decode = (s: string) => {
			let n = 128, i = 0, bias = 72, at = s.lastIndexOf('-');
			let out: number[] = [];
			for (let j = 0; j < at; j++) out.push(s.charCodeAt(j));
			for (let idx = at > 0 ? at + 1 : 0; idx < s.length;) {
				let prev = i, w = 1, k = 36;
				for (;; k += 36) {
					if (idx >= s.length) return;
					let c = s.charCodeAt(idx++) | 32;
					let d = c - 48 < 10 ? c - 22 : c - 97 < 26 ? c - 97 : 36;
					if (d > 35) return;
					i += d * w;
					let t = threshold(k, bias);
					if (d < t) break;
					w *= 36 - t;
				}
				let size = out.length + 1;
				bias = adapt(i - prev, size, prev === 0);
				n += Math.floor(i / size);
				i %= size;
				if (n > 0x10ffff) return;
				out.splice(i++, 0, n);
			}
			return String.fromCodePoint(...out);
		};
		let encode = (s: string) => {
			let cps = Array.from(s, (c) => c.codePointAt(0)!);
			let out = String.fromCodePoint(...cps.filter((c) => c < 128));
			let n = 128, delta = 0, bias = 72, h = out.length, b = h;
			if (b) out += '-';
			while (h < cps.length) {
				let m = Math.min(...cps.filter((c) => c >= n));
				delta += (m - n) * (h + 1);
				n = m;
				for (let c of cps) {
					if (c < n) delta++;
					if (c === n) {
						let q = delta, k = 36;
						for (;; k += 36) {
							let t = threshold(k, bias);
							if (q < t) break;
							let d = t + (q - t) % (36 - t);
							out += String.fromCharCode(d + 22 + (d < 26 ? 75 : 0));
							q = Math.floor((q - t) / (36 - t));
						}
						out += String.fromCharCode(q + 22 + (q < 26 ? 75 : 0));
						bias = adapt(delta, h + 1, h === b);
						delta = 0;
						h++;
					}
				}
				delta++;
				n++;
			}
			return out;
		};
		return [decode, encode] as const;
	}],
	host: [
		(puny: readonly [(s: string) => string | undefined, (s: string) => string]) => {
			let [decode, encode] = puny;
			let LDH = /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i;
			let FAST =
				/^(?=.{1,253}$)[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;
			let VALID =
				/^[\p{Ll}\p{Lo}\p{Lm}\p{Mn}\p{Mc}\p{Nd}\u00b7\u00df\u0375\u03c2\u05f3\u05f4\u06fd\u06fe\u0f0b\u200c\u200d\u3007\u30fb-]+$/u;
			let INVALID = /[\u0640\u07fa\u302e\u302f\u3031-\u3035\u303b]|^\p{M}|^-|-$|^..--/u;
			let VIRAMA =
				/[\u094d\u09cd\u0a4d\u0acd\u0b4d\u0bcd\u0c4d\u0ccd\u0d3b\u0d3c\u0d4d\u0dca\u0e3a\u0eba\u0f84\u1039\u103a\u1714\u1715\u1734\u17d2\u1a60\u1b44\u1baa\u1bab\u1bf2\u1bf3\u2d7f\ua806\ua82c\ua8c4\ua953\ua9c0\uaaf6\uabed\u{10a3f}\u{11046}\u{11070}\u{1107f}\u{110b9}\u{11133}\u{11134}\u{111c0}\u{11235}\u{112ea}\u{1134d}\u{11442}\u{114c2}\u{115bf}\u{1163f}\u{116b6}\u{1172b}\u{11839}\u{1193d}\u{1193e}\u{119e0}\u{11a34}\u{11a47}\u{11a99}\u{11c3f}\u{11d44}\u{11d45}\u{11d97}]/u;
			let RTL =
				/[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
			let JOIN =
				/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Mongolian}]/u;
			let kind = (c: string) =>
				/[\u0660-\u0669\u066b\u066c]/.test(c)
					? 'AN'
					: /[\d\u06f0-\u06f9]/.test(c)
					? 'EN'
					: /[\p{Mn}\p{Me}\u200c\u200d]/u.test(c)
					? 'NSM'
					: c === '-'
					? 'ES'
					: RTL.test(c)
					? 'R'
					: 'L';
			let context = (cps: string[]) => {
				let label = cps.join('');
				if (/[\u0660-\u0669]/.test(label) && /[\u06f0-\u06f9]/.test(label)) return false;
				for (let i = 0; i < cps.length; i++) {
					let c = cps[i], prev = cps[i - 1] || '', next = cps[i + 1] || '';
					if (c === '\u00b7' && (prev !== 'l' || next !== 'l')) return false;
					if (c === '\u0375' && !/\p{Script=Greek}/u.test(next)) return false;
					if ((c === '\u05f3' || c === '\u05f4') && !/\p{Script=Hebrew}/u.test(prev)) return false;
					if (
						c === '\u30fb' &&
						!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(
							label.replace(/\u30fb/g, ''),
						)
					) return false;
					if (c === '\u200d' && !VIRAMA.test(prev)) return false;
					if (c === '\u200c' && !VIRAMA.test(prev)) {
						let j = i - 1, k = i + 1;
						while (/\p{Mn}/u.test(cps[j] || '')) j--;
						while (/\p{Mn}/u.test(cps[k] || '')) k++;
						if (!JOIN.test(cps[j] || '') || !JOIN.test(cps[k] || '')) return false;
					}
				}
				return true;
			};
			let bidi = (cps: string[]) => {
				let kinds = cps.map(kind);
				let first = kinds[0];
				let last = kinds.filter((k) => k !== 'NSM').pop();
				if (first === 'R') {
					return !kinds.includes('L') && (last === 'R' || last === 'EN' || last === 'AN') &&
						!(kinds.includes('EN') && kinds.includes('AN'));
				}
				return first === 'L' && !kinds.includes('R') && !kinds.includes('AN') &&
					(last === 'L' || last === 'EN');
			};
			return (s: string, idn?: 1) => {
				if (!s.includes('--') && /^[\0-\x7f]*$/.test(s)) return FAST.test(s);
				if (idn) {
					s = s.normalize('NFKC').replace(
						/[\u00ad\u034f\u180b-\u180d\u200b\u2060\ufe00-\ufe0f\ufeff]/g,
						'',
					)
						.replace(/[\u3002\uff0e\uff61]/g, '.').toLowerCase();
				}
				let labels = s.split('.');
				let total = labels.length - 1, rtl = false;
				let ulabels: string[][] = [];
				for (let l of labels) {
					let u: string | undefined = l;
					if (/^xn--/i.test(l)) {
						u = decode(l.slice(4));
						if (!u || !/[^\0-\x7f]/.test(u) || 'xn--' + encode(u) !== l.toLowerCase()) return false;
					} else if (/[^\0-\x7f]/.test(l)) {
						if (!idn) return false;
						l = 'xn--' + encode(l);
					} else if (!LDH.test(l) || /^..--/.test(l)) {
						return false;
					}
					if (l.length > 63) return false;
					total += l.length;
					if (u !== l) {
						let cps = Array.from(u);
						if (!VALID.test(u) || INVALID.test(u) || !context(cps)) return false;
						if (cps.some((c) => /^(R|AN)$/.test(kind(c)))) rtl = true;
						ulabels.push(cps);
					} else {
						ulabels.push(Array.from(l));
					}
				}
				return total <= 253 && (!rtl || ulabels.every(bidi));
			};
		},
		'puny',
	],
	email: [
		(
			host: (s: string, idn?: 1) => boolean,
			ipv4: (s: string) => boolean,
			ipv6: (s: string) => boolean,
		) => {
			let A =
				/^(?:[\w!#$%&'*+/=?^`{|}~-]+(?:\.[\w!#$%&'*+/=?^`{|}~-]+)*|"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*")$/;
			let U =
				/^(?:[\w!#$%&'*+/=?^`{|}~\u0080-\uffff-]+(?:\.[\w!#$%&'*+/=?^`{|}~\u0080-\uffff-]+)*|"(?:[\x20\x21\x23-\x5b\x5d-\x7e\u0080-\uffff]|\\[\x20-\x7e\u0080-\uffff])*")$/;
			let FAST =
				/^[\w!#$%&'*+/=?^`{|}~-]+(?:\.[\w!#$%&'*+/=?^`{|}~-]+)*@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;
			return (s: string, idn?: 1) => {
				if (FAST.test(s) && !s.includes('--') && s.length - s.lastIndexOf('@') < 255) return true;
				let i = s.lastIndexOf('@');
				if (i < 1 || !(idn ? U : A).test(s.slice(0, i))) return false;
				let d = s.slice(i + 1);
				if (d[0] !== '[') return host(d, idn);
				if (d[d.length - 1] !== ']') return false;
				d = d.slice(1, -1);
				return /^ipv6:/i.test(d) ? ipv6(d.slice(5)) : ipv4(d);
			};
		},
		'host',
		'ipv4',
		'ipv6',
	],
	uri: [
		(ipv6: (s: string) => boolean) => {
			let make = (u: string, p: string) => {
				let x = (c: string) =>
					`[\\w.~!$&'()*+,;=${u}${c}-]*(?:%[\\da-f]{2}[\\w.~!$&'()*+,;=${u}${c}-]*)*`;
				return new RegExp(
					`^(?:([a-z][a-z\\d+.-]*):)?(?:(//)(?:${
						x(':')
					}@)?(?:\\[(?:v[\\da-f]+\\.[\\w.~!$&'()*+,;=:-]+|([^\\]]*))\\]|${x('')})(?::\\d*)?)?(${
						x(':@/')
					})(?:\\?${x(':@/?' + p)})?(?:#${x(':@/?')})?$`,
					u ? 'iu' : 'i',
				);
			};
			let R = [
				make('', ''),
				make(
					'\\u{a0}-\\u{d7ff}\\u{f900}-\\u{fdcf}\\u{fdf0}-\\u{ffef}\\u{10000}-\\u{efffd}',
					'\\u{e000}-\\u{f8ff}\\u{f0000}-\\u{ffffd}\\u{100000}-\\u{10fffd}',
				),
			];
			let FAST = /^[a-z][a-z\d+.-]*:\/\/[\w.~-]+(?::\d+)?(?:\/[\w.~!$&'()*+,;=:@/-]*)?$/i;
			return (s: string, ref?: 0 | 1, iri?: 1) => {
				if (FAST.test(s)) return true;
				let m = R[iri || 0].exec(s);
				if (!m) return false;
				if (!m[1] && (!ref || (!m[2] && /^[^/]*:/.test(m[4])))) return false;
				if (m[2] && m[4] && m[4][0] !== '/') return false;
				return m[3] === undefined || ipv6(m[3]);
			};
		},
		'ipv6',
	],
	re: [() => (s: string) => {
		try {
			return !!new RegExp(s, 'u');
		} catch {
			return false;
		}
	}],
};

/**
 * @internal
 * The `format` validators, as either a {@link helpers} call or a RegExp literal.
 */
const FORMATS: Record<string, string> = {
	date: '$date(#)',
	time: '$time(#)',
	'date-time': '$dt(#)',
	duration:
		'/^P(?:(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S)|\\d+W)$/',
	email: '$email(#)',
	'idn-email': '$email(#,1)',
	hostname: '$host(#)',
	'idn-hostname': '$host(#,1)',
	ipv4: '$ipv4(#)',
	ipv6: '$ipv6(#)',
	uuid: '/^[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}$/i',
	uri: '$uri(#)',
	'uri-reference': '$uri(#,1)',
	iri: '$uri(#,0,1)',
	'iri-reference': '$uri(#,1,1)',
	'uri-template':
		'/^(?:[^\\x00-\\x20\\x7f"%<>\\\\^`{|}]|%[\\da-f]{2}|\\{[+#./;?&=,!@|]?(?:\\w|%[\\da-f]{2})(?:\\.?(?:\\w|%[\\da-f]{2}))*(?::[1-9]\\d{0,3}|\\*)?(?:,(?:\\w|%[\\da-f]{2})(?:\\.?(?:\\w|%[\\da-f]{2}))*(?::[1-9]\\d{0,3}|\\*)?)*\\})*$/i',
	'json-pointer': '/^(?:\\/(?:[^~/]|~[01])*)*$/',
	'relative-json-pointer':
		'/^(?:0|[1-9]\\d*)(?:[+-](?:0|[1-9]\\d*))?(?:#|(?:\\/(?:[^~/]|~[01])*)*)$/',
	regex: '$re(#)',
};

const BASE = 'tschema:///';

const ALL = 0;
const FIRST = 1;
const TEST = 2;

type Mode = typeof ALL | typeof FIRST | typeof TEST;

/**
 * @internal
 * A location segment: an escaped static key, or a variable holding an index or a key.
 */
type Segment = string | [name: string, key: boolean];

type Context = {
	n: number;
	code: string;
	deps: Set<string>;
	consts: Map<string, string>;
	fns: Map<Schema, string[]>;
	ids: Map<string, Schema>;
	bases: Map<Node, string>;
	eq: (a: unknown, b: unknown) => boolean;
};

function use(c: Context, name: string): string {
	if (!c.deps.has(name)) {
		let [, ...deps] = helpers[name];
		for (let d of deps) use(c, d);
		c.deps.add(name);
	}
	return '$' + name;
}

function hoist(c: Context, expr: string): string {
	let id = c.consts.get(expr);
	if (!id) {
		c.consts.set(expr, id = 'c' + ++c.n);
		c.code += `const ${id}=${expr};`;
	}
	return id;
}

function escape(key: string): string {
	return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function location(c: Context, path: Segment[]): string {
	let s = '', out: string[] = [];
	for (let x of path) {
		if (typeof x === 'string') {
			s += '/' + x;
		} else {
			out.push(JSON.stringify(s + '/'), x[1] ? `${use(c, 'ptr')}(${x[0]})` : x[0]);
			s = '';
		}
	}
	if (s || !out.length) out.push(JSON.stringify(s));
	return out.join('+');
}

function fail(c: Context, m: Mode, ip: Segment[], kp: Segment[], msg: string): string {
	if (m === TEST) return 'return false;';
	let args = `${location(c, ip)},${location(c, kp)},${JSON.stringify(msg)}`;
	return m === ALL ? `E=${use(c, 'e')}(E,${args});` : `return ${use(c, 'err')}(${args});`;
}

function call(c: Context, s: Schema, x: string, ip: Segment[], kp: Segment[], m: Mode): string {
	let name = fn(c, s, m);
	if (m === TEST) return `if(!${name}(${x}))return false;`;
	let args = `r,${location(c, ip)},${location(c, kp)}`;
	return m === ALL
		? `if(r=${name}(${x}))E=${use(c, 'm')}(E,${args});`
		: `if(r=${name}(${x}))return ${use(c, 'p')}(${args});`;
}

function fn(c: Context, s: Schema, m: Mode): string {
	let names = c.fns.get(s);
	if (!names) c.fns.set(s, names = []);
	if (names[m]) return names[m];
	let name = names[m] = 'aft'[m] + ++c.n;
	let body = gen(c, s, 'x', [], [], m);
	c.code += m === ALL
		? `function ${name}(x){var E,r;${body}return E}`
		: m === FIRST
		? `function ${name}(x){var r;${body}}`
		: `function ${name}(x){${body}return true}`;
	return name;
}

function check(type: string, x: string): string {
	switch (type) {
		case 'null':
			return `${x}===null`;
		case 'integer':
			return `Number.isInteger(${x})`;
		case 'number':
			return `(typeof ${x}=="number"&&isFinite(${x}))`;
		case 'array':
			return `Array.isArray(${x})`;
		case 'object':
			return `(typeof ${x}=="object"&&${x}!==null&&!Array.isArray(${x}))`;
		case 'string':
		case 'boolean':
			return `typeof ${x}=="${type}"`;
	}
	return 'false';
}

function differs(c: Context, x: string, list: unknown[]): string {
	let simple = list.every((v) => typeof v !== 'object' || v === null);
	if (simple && list.length < 9) {
		return list.length ? list.map((v) => `${x}!==${JSON.stringify(v)}`).join('&&') : 'true';
	}
	if (simple) return `!${hoist(c, `new Set(${JSON.stringify(list)})`)}.has(${x})`;
	return `!${use(c, 'in')}(${x},${hoist(c, JSON.stringify(list))})`;
}

function regex(c: Context, pattern: string): string {
	try {
		new RegExp(pattern, 'u');
		return hoist(c, `new RegExp(${JSON.stringify(pattern)},"u")`);
	} catch {
		return hoist(c, `new RegExp(${JSON.stringify(pattern)})`);
	}
}

function property(c: Context, x: string, key: string): string {
	let k = JSON.stringify(key);
	return key in Object.prototype ? `(${use(c, 'has')}(${x},${k})?${x}[${k}]:void 0)` : `${x}[${k}]`;
}

function resolve(c: Context, s: Node, ref: string): Schema {
	let url = new URL(ref, c.bases.get(s) || BASE);
	let frag = decodeURIComponent(url.hash.slice(1));
	url.hash = '';
	let target: unknown = c.ids.get(frag && frag[0] !== '/' ? url.href + '#' + frag : url.href);
	if (target !== undefined && frag[0] === '/') {
		for (let tok of frag.slice(1).split('/')) {
			tok = tok.replace(/~1/g, '/').replace(/~0/g, '~');
			target = isRecord(target) ? target[tok] : undefined;
		}
	}
	if (typeof target === 'boolean' || isNode(target)) return target;
	throw new Error(`Unresolved $ref: "${ref}"`);
}

function register(c: Context, key: string, s: Schema) {
	let prev = c.ids.get(key);
	if (prev === undefined) c.ids.set(key, s);
	else if (prev !== s && !c.eq(prev, s)) throw new Error(`Duplicate schema identifier: "${key}"`);
}

function scan(c: Context, s: unknown, base: string) {
	if (!isNode(s) || c.bases.has(s)) return;
	if (typeof s.$id === 'string') {
		let url = new URL(s.$id, base);
		let anchor = url.hash.slice(1);
		url.hash = '';
		register(c, base = url.href, s);
		if (anchor) register(c, base + '#' + anchor, s);
	}
	c.bases.set(s, base);
	if (typeof s.$anchor === 'string') register(c, base + '#' + s.$anchor, s);
	if (typeof s.$dynamicAnchor === 'string') register(c, base + '#' + s.$dynamicAnchor, s);

	let k: keyof Node, v: unknown;
	for (
		k of [
			'not',
			'items',
			'additionalItems',
			'contains',
			'additionalProperties',
			'propertyNames',
		] as const
	) {
		v = s[k];
		if (Array.isArray(v)) { for (v of v) scan(c, v, base); }
		else scan(c, v, base);
	}
	for (k of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) {
		v = s[k];
		if (Array.isArray(v)) { for (v of v) scan(c, v, base); }
	}
	for (k of ['properties', 'patternProperties', '$defs', 'definitions'] as const) {
		v = s[k];
		if (isRecord(v)) { for (let key in v) scan(c, v[key], base); }
	}
}

/**
 * @internal
 * The numeric limit keywords: the failing comparison and the error message.
 */
const LIMITS: [keyword: keyof Node, op: string, msg: string][] = [
	['minimum', '<', 'must be >= '],
	['maximum', '>', 'must be <= '],
	['exclusiveMinimum', '<=', 'must be > '],
	['exclusiveMaximum', '>=', 'must be < '],
];

/**
 * @internal
 * The size limit keywords: the measured expression, the failing comparison, and the unit.
 */
const SIZES: [keyword: keyof Node, size: string, op: string, unit: string][] = [
	['minItems', '#.length', '<', 'items'],
	['maxItems', '#.length', '>', 'items'],
	['minProperties', 'Object.keys(#).length', '<', 'properties'],
	['maxProperties', 'Object.keys(#).length', '>', 'properties'],
];

function gen(c: Context, s: Schema, x: string, ip: Segment[], kp: Segment[], m: Mode): string {
	if (s === true) return '';
	if (s === false) return fail(c, m, ip, kp, 'is not allowed');

	let rule = (cond: string, keyword: string, msg: string) =>
		`if(${cond})${fail(c, m, ip, [...kp, keyword], msg)}`;
	let test = (list: Schema[]) => list.map((sub) => `${fn(c, sub, TEST)}(${x})`);

	let y: string, i: string, k: string, sub: string, v: unknown;
	let any = '', num = '', str = '', arr = '', obj = '';

	if (typeof s.$ref === 'string') {
		any += call(c, resolve(c, s, s.$ref), x, ip, [...kp, '$ref'], m);
	}

	if (s.const !== undefined) {
		any += rule(differs(c, x, [s.const]), 'const', 'must be equal to constant');
	}

	if (s.enum) {
		any += rule(differs(c, x, s.enum), 'enum', 'must be equal to one of the allowed values');
	}

	if (s.allOf) {
		s.allOf.forEach((x2, idx) => {
			any += gen(c, x2, x, ip, [...kp, 'allOf', '' + idx], m);
		});
	}

	if (s.anyOf) {
		any += rule(`!(${test(s.anyOf).join('||')})`, 'anyOf', 'must match a schema in anyOf');
	}

	if (s.oneOf) {
		any += rule(
			`${test(s.oneOf).map((call) => `(${call}?1:0)`).join('+')}!==1`,
			'oneOf',
			'must match exactly one schema in oneOf',
		);
	}

	if (s.not !== undefined) {
		any += rule(test([s.not])[0], 'not', 'must NOT be valid');
	}

	// numbers

	for (let [keyword, op, msg] of LIMITS) {
		if (typeof (v = s[keyword]) === 'number') num += rule(`${x}${op}${v}`, keyword, msg + v);
	}

	if (typeof (v = s.multipleOf) === 'number') {
		num += rule(
			Number.isInteger(v) ? `${x}%${v}!==0` : `!${use(c, 'mul')}(${x},${v})`,
			'multipleOf',
			`must be multiple of ${v}`,
		);
	}

	// strings

	if (typeof (v = s.minLength) === 'number' && v > 0) {
		str += rule(
			`${x}.length<${v * 2}&&${use(c, 'len')}(${x})<${v}`,
			'minLength',
			`must NOT have fewer than ${v} characters`,
		);
	}

	if (typeof (v = s.maxLength) === 'number') {
		str += rule(
			`${x}.length>${v}&&${use(c, 'len')}(${x})>${v}`,
			'maxLength',
			`must NOT have more than ${v} characters`,
		);
	}

	if (typeof (v = s.pattern) === 'string') {
		str += rule(`!${regex(c, v)}.test(${x})`, 'pattern', `must match pattern "${v}"`);
	}

	if (typeof (v = s.format) === 'string' && (sub = FORMATS[v])) {
		sub = sub[0] === '/'
			? `${hoist(c, sub)}.test(${x})`
			: sub.replace(/\$(\w+)/, (_, h) => use(c, h)).replace('#', x);
		str += rule('!' + sub, 'format', `must match format "${v}"`);
	}

	// sizes

	for (let [keyword, size, op, unit] of SIZES) {
		if (typeof (v = s[keyword]) === 'number') {
			let code = rule(
				size.replace('#', x) + op + v,
				keyword,
				`must NOT have ${op === '<' ? 'fewer' : 'more'} than ${v} ${unit}`,
			);
			if (unit === 'items') arr += code;
			else obj += code;
		}
	}

	// arrays

	let items = s.items;
	let tuple = Array.isArray(items);
	let prefix = Array.isArray(items) ? items : s.prefixItems;
	let legacy = tuple || (items === undefined && prefix);
	let rest = Array.isArray(items) || legacy ? s.additionalItems : items;
	let keyword = legacy ? 'additionalItems' : 'items';
	let count = prefix ? prefix.length : 0;

	if (prefix) {
		prefix.forEach((x2, idx) => {
			y = 'y' + ++c.n;
			sub = gen(c, x2, y, [...ip, '' + idx], [...kp, tuple ? 'items' : 'prefixItems', '' + idx], m);
			if (sub) arr += `if(${x}.length>${idx}){const ${y}=${x}[${idx}];${sub}}`;
		});
	}

	if (rest === false) {
		arr += rule(`${x}.length>${count}`, keyword, `must NOT have more than ${count} items`);
	} else if (rest !== undefined && rest !== true) {
		i = 'i' + ++c.n;
		y = 'y' + ++c.n;
		sub = gen(c, rest, y, [...ip, [i, false]], [...kp, keyword], m);
		if (sub) arr += `for(let ${i}=${count};${i}<${x}.length;${i}++){const ${y}=${x}[${i}];${sub}}`;
	}

	if (s.contains !== undefined) {
		let min = typeof s.minContains === 'number' ? s.minContains : 1;
		let n = 'n' + ++c.n;
		i = 'i' + ++c.n;
		arr += `let ${n}=0;for(let ${i}=0;${i}<${x}.length;${i}++)if(${
			fn(c, s.contains, TEST)
		}(${x}[${i}]))${n}++;`;
		if (min > 0) {
			arr += rule(
				`${n}<${min}`,
				s.minContains === undefined ? 'contains' : 'minContains',
				`must contain at least ${min} valid item(s)`,
			);
		}
		if (typeof (v = s.maxContains) === 'number') {
			arr += rule(`${n}>${v}`, 'maxContains', `must contain at most ${v} valid item(s)`);
		}
	}

	if (s.uniqueItems) {
		arr += rule(
			`${x}.length>1&&${use(c, 'dup')}(${x})`,
			'uniqueItems',
			'must NOT have duplicate items',
		);
	}

	// objects

	let props = s.properties || {};
	let required = new Set(s.required);

	for (k in props) {
		y = 'y' + ++c.n;
		sub = gen(c, props[k], y, [...ip, escape(k)], [...kp, 'properties', escape(k)], m);
		if (required.delete(k)) {
			obj += `const ${y}=${property(c, x, k)};` +
				rule(`${y}===undefined`, 'required', `must have required property "${k}"`) +
				(sub ? `else{${sub}}` : '');
		} else if (sub) {
			obj += `const ${y}=${property(c, x, k)};if(${y}!==undefined){${sub}}`;
		}
	}

	for (k of required) {
		obj += rule(
			`${property(c, x, k)}===undefined`,
			'required',
			`must have required property "${k}"`,
		);
	}

	let extra = s.additionalProperties === true ? undefined : s.additionalProperties;
	let names = s.propertyNames === true ? undefined : s.propertyNames;
	let patterns = s.patternProperties || {};
	let keys = Object.keys(patterns);

	if (extra !== undefined || names !== undefined || keys.length) {
		k = 'k' + ++c.n;
		y = 'y' + ++c.n;
		let hit = extra !== undefined && keys.length ? 'h' + ++c.n : '';
		let body = names === undefined ? '' : gen(c, names, k, ip, [...kp, 'propertyNames'], m);

		if (hit) body += `let ${hit}=0;`;

		for (let p of keys) {
			sub = gen(c, patterns[p], y, [...ip, [k, true]], [...kp, 'patternProperties', escape(p)], m);
			if (sub || hit) body += `if(${regex(c, p)}.test(${k})){${hit && hit + '=1;'}${sub}}`;
		}

		if (extra !== undefined) {
			let known = Object.keys(props);
			let cond = [
				known.length &&
				`!(${
					known.length < 9
						? known.map((key) => `${k}===${JSON.stringify(key)}`).join('||')
						: `${hoist(c, `new Set(${JSON.stringify(known)})`)}.has(${k})`
				})`,
				hit && '!' + hit,
			].filter(Boolean).join('&&');
			sub = gen(c, extra, y, [...ip, [k, true]], [...kp, 'additionalProperties'], m);
			if (sub) body += cond ? `if(${cond}){${sub}}` : sub;
		}

		if (body) obj += `for(const ${k} in ${x}){const ${y}=${x}[${k}];${body}}`;
	}

	// assemble

	let types = s.type === undefined ? undefined : Array.isArray(s.type) ? s.type : [s.type];
	let only = types && types.length === 1 ? types[0] : '';
	let out = any;

	for (let [type, code] of [['number', num], ['string', str], ['array', arr], ['object', obj]]) {
		if (code) {
			out += only === type || (type === 'number' && only === 'integer')
				? code
				: `if(${type === 'number' ? `typeof ${x}=="number"` : check(type, x)}){${code}}`;
		}
	}

	if (!types) return out;

	let guard = rule(
		`!(${types.map((t) => check(t, x)).join('||')})`,
		'type',
		`must be ${types.join(' or ')}`,
	);
	return out ? `${guard}else{${out}}` : guard;
}

/**
 * @internal
 * Generate the validator source for a {@link Schema}.
 *
 * The `code` declares `validate`, `parse`, and `assert` functions.
 * It expects a `ValidationError` class and each of its `deps` as `$<name>` in scope.
 *
 * ```ts
 * let { code, deps } = compile(schema);
 * ```
 */
export function compile(schema: unknown): Output {
	if (typeof schema !== 'boolean' && !isNode(schema)) {
		throw new TypeError('Invalid schema');
	}

	let c: Context = {
		n: 0,
		code: '',
		deps: new Set(),
		consts: new Map(),
		fns: new Map(),
		ids: new Map(),
		bases: new Map(),
		eq: equal(),
	};

	register(c, BASE, schema);
	scan(c, schema, BASE);

	let all = fn(c, schema, ALL);
	let first = fn(c, schema, FIRST);

	c.code += `function validate(x){var e=${all}(x);return e?{ok:false,errors:e}:{ok:true,value:x}}`;
	c.code += `function parse(x){return ${first}(x)?void 0:x}`;
	c.code += `function assert(x){var e=${first}(x);if(e)throw new ValidationError(e)}`;

	return {
		code: c.code,
		deps: [...c.deps],
	};
}
