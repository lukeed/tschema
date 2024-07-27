type OmitNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

// deno-fmt-ignore
type __Optionals<T> = OmitNever<{
	[K in keyof T]: T[K] extends optional<infer X> ? Infer<X> : never;
}>;

type Prettify<T> =
	& {
		[K in keyof T]: Prettify<T[K]>;
	}
	// deno-lint-ignore ban-types
	& {};

type RequiredProperties<T> = {
	[K in keyof T as T[K] extends optional<infer _> ? never : K]: Infer<T[K]>;
};

type OptionalProperties<T, M = __Optionals<T>> = {
	[K in keyof M]?: M[K];
};

// type InferProperties<T, M = RequiredProperties<T> & OptionalProperties<T>> = {
// 	[K in keyof T]: M[K];
// };

// deno-fmt-ignore
export type Infer<T> =
	T extends _readonly<infer X>
		? Readonly<Infer<X>>
	: T extends _null
		? null
	: T extends _bool
		? boolean
	: T extends _string<infer E>
		? E
	: T extends _num<infer E> | _int<infer E>
		? E
	: T extends _object<infer P>
		? Prettify<
				& RequiredProperties<P>
				& OptionalProperties<P>
			>
	: T extends tuple<infer I>
		? Infer<I>
	: T extends array<infer I>
		? Infer<I>[]
	: T extends _enum<infer E>
		? E
	: {
			[K in keyof T]: Infer<T[K]>
		};

// https://json-schema.org/understanding-json-schema/reference/annotations
export type Annotations<T> = {
	$schema?: string;
	$id?: string;
	title?: string;
	description?: string;
	examples?: Infer<T>[];
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
	default?: Infer<T>;
};

export type Field =
	| array<unknown>
	| _bool
	| _enum<unknown>
	| _int
	| _null
	| _num
	| _object<Properties>
	| _string
	| tuple<unknown>;

// MODIFIERS
// ---

const OPTIONAL: unique symbol = Symbol.for('optional');

export type optional<T extends Field> = T & {
	[OPTIONAL]: true;
};

export function optional<
	F extends Field,
>(field: F): optional<F> {
	return {
		...field,
		[OPTIONAL]: true,
	};
	// return Object.defineProperty(field, OPTIONAL, {
	// 	value: true,
	// 	enumerable: false,
	// 	writable: true,
	// }) as Optional<F>;
}

type _readonly<T extends Field> = T & {
	readOnly: true;
};

function _readonly<T extends Field>(field: T): _readonly<T> {
	return {
		...field,
		readOnly: true,
	};
}

export { _readonly as readonly };

// NULL
// ---

type _null = Annotations<null> & {
	type: 'null';
};

function _null(options?: Omit<_null, 'type'>): _null {
	return { ...options, type: 'null' };
}

export { _null as null };

// ENUM
// ---

type _enum<T> = Annotations<T> & {
	enum: T[];
};

function _enum<
	const V extends (boolean | null | number | string),
>(
	choices: V[],
	options?: Omit<_enum<V>, 'enum'>,
): _enum<V> {
	return {
		enum: choices,
		...options,
	};
}

export { _enum as enum };

// BOOLEAN
// ---

type _bool = Annotations<boolean> & {
	type: 'boolean';
};

function _bool(options?: Omit<_bool, 'type'>): _bool {
	return { ...options, type: 'boolean' };
}

export { _bool as boolean };

// STRING
// ---

/**
 * https://json-schema.org/understanding-json-schema/reference/string#built-in-formats
 */
type Format =
	| 'date-time'
	| 'time'
	| 'date'
	| 'duration'
	| 'email'
	| 'idn-email'
	| 'hostname'
	| 'idn-hostname'
	| 'ipv4'
	| 'ipv6'
	| 'uuid'
	| 'uri'
	| 'uri-reference'
	| 'iri'
	| 'iri-reference'
	| 'uri-template'
	| 'json-pointer'
	| 'relative-json-pointer'
	| 'regex';

type _string<E extends string = string> = Annotations<E> & {
	type: 'string';
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: Format;
	enum?: E[];
};

function _string<
	const V extends string,
	F extends _string<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

function _string<
	F extends _string,
>(options?: Omit<F, 'type'>): F;

function _string(
	options?: Omit<_string, 'type'>,
): _string {
	return { ...options, type: 'string' };
}

export { _string as string };

// NUMERIC
// ---

type _num<E extends number = number> = Annotations<E> & {
	type: 'number';
	enum?: E[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
};

function _num<
	const V extends number,
	F extends _num<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

function _num<
	F extends _num,
>(options?: Omit<F, 'type'>): F;

function _num(
	options?: Omit<_num, 'type'>,
): _num {
	return { ...options, type: 'number' };
}

export { _num as number };

type _int<E extends number = number> = Omit<_num<E>, 'type'> & {
	type: 'integer';
};

function _int<
	const V extends number,
	F extends _int<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

function _int<
	F extends _int,
>(options?: Omit<F, 'type'>): F;

function _int(
	options?: Omit<_int, 'type'>,
): _int {
	return { ...options, type: 'integer' };
}

export { _int as integer };

// LISTS
// ---

export type array<T> = Annotations<T[]> & {
	type: 'array';
	items?: T;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	contains?: Field;
	minContains?: number;
	maxContains?: number;
	prefixItems?: Field[];
};

export function array<
	const I extends Field,
	F extends array<I>,
>(
	items?: I,
	options?: Omit<F, 'type' | 'items'>,
): F {
	return {
		...options,
		type: 'array',
		items,
	} as F;
}

export type tuple<T> = Annotations<T> & {
	type: 'array';
	prefixItems?: T;
	items?: false; // T[]
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	contains?: Field;
	minContains?: number;
	maxContains?: number;
};

export function tuple<
	const M extends Field[],
>(
	members?: M,
	options?: Omit<tuple<M>, 'type' | 'prefixItems'>,
): tuple<M> {
	return {
		...options,
		type: 'array',
		prefixItems: members,
	} as tuple<M>;
}

// OBJECT
// ---

type Properties = {
	[name: string]: Field & {
		[OPTIONAL]?: true;
	};
};

type _object<T extends Properties> = Annotations<T> & {
	type: 'object';
	properties?: {
		[K in keyof T]: T[K];
	};
	required?: (keyof T)[];
	patternProperties?: Field;
	additionalProperties?: Field | boolean;
	propertyNames?: Partial<_string>;
	minProperties?: number;
	maxProperties?: number;
};

function _object<
	P extends Properties,
	F extends _object<P>,
>(
	properties?: P,
	options?: Omit<F, 'type' | 'properties'>,
): F {
	let o = {
		...options,
		type: 'object',
		properties,
	} as F;

	if (properties && !o.required) {
		let k: keyof P;
		let arr: (keyof P)[] = [];
		for (k in properties) {
			if (properties[k][OPTIONAL]) {
				// NOTE: delete = deopt
				properties[k][OPTIONAL] = undefined;
			} else {
				arr.push(k);
			}
		}
		if (arr.length > 0) {
			o.required = arr;
		}
	}

	return o;
}

export { _object as object };
