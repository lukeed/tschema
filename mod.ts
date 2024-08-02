type OmitNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

// deno-fmt-ignore
type __Optionals<T> = OmitNever<{
	[K in keyof T]: T[K] extends _optional<infer X> ? Infer<X> : never;
}>;

type OptionalProperties<T, M = __Optionals<T>> = {
	[K in keyof M]?: M[K];
};

type RequiredProperties<T> = {
	[K in keyof T as T[K] extends _optional<infer _> ? never : K]: Infer<T[K]>;
};

type Prettify<T> =
	& {
		[K in keyof T]: Prettify<T[K]>;
	}
	// deno-lint-ignore ban-types
	& {};

// type InferProperties<T, M = RequiredProperties<T> & OptionalProperties<T>> = {
// 	[K in keyof T]: M[K];
// };

// deno-fmt-ignore
export type Infer<T> =
	T extends _readonly<infer X>
		? Readonly<Infer<X>>
	: T extends _null
		? null
	: T extends _boolean
		? boolean
	: T extends _string<infer E>
		? E
	: T extends _number<infer E> | _integer<infer E>
		? E
	: T extends _object<infer P>
		? Prettify<
				& RequiredProperties<P>
				& OptionalProperties<P>
			>
	: T extends _tuple<infer I>
		? Infer<I>
	: T extends _array<infer I>
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
	| _array<unknown>
	| _boolean
	| _enum<unknown>
	| _integer
	| _null
	| _number
	| _object<Properties>
	| _string
	| _tuple<unknown>;

// MODIFIERS
// ---

const OPTIONAL: unique symbol = Symbol.for('optional');

type _optional<T extends Field> = T & {
	[OPTIONAL]: true;
};

function _optional<
	F extends Field,
>(field: F): _optional<F> {
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

// NULL
// ---

type _null = Annotations<null> & {
	type: 'null';
};

function _null(options?: Omit<_null, 'type'>): _null {
	return { ...options, type: 'null' };
}

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

// BOOLEAN
// ---

type _boolean = Annotations<boolean> & {
	type: 'boolean';
};

function _boolean(options?: Omit<_boolean, 'type'>): _boolean {
	return { ...options, type: 'boolean' };
}

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

// NUMERIC
// ---

type _number<E extends number = number> = Annotations<E> & {
	type: 'number';
	enum?: E[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
};

function _number<
	const V extends number,
	F extends _number<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

function _number<
	F extends _number,
>(options?: Omit<F, 'type'>): F;

function _number(
	options?: Omit<_number, 'type'>,
): _number {
	return { ...options, type: 'number' };
}

type _integer<E extends number = number> = Omit<_number<E>, 'type'> & {
	type: 'integer';
};

function _integer<
	const V extends number,
	F extends _integer<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

function _integer<
	F extends _integer,
>(options?: Omit<F, 'type'>): F;

function _integer(
	options?: Omit<_integer, 'type'>,
): _integer {
	return { ...options, type: 'integer' };
}

// LISTS
// ---

type _array<T> = Annotations<T[]> & {
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

function _array<
	const I extends Field,
	F extends _array<I>,
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

type _tuple<T> = Annotations<T> & {
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

function _tuple<
	const M extends Field[],
>(
	members?: M,
	options?: Omit<_tuple<M>, 'type' | 'prefixItems'>,
): _tuple<M> {
	return {
		...options,
		type: 'array',
		prefixItems: members,
	} as _tuple<M>;
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

// deno-fmt-ignore
export {
	// modifiers
	_optional as optional,
	_readonly as readonly,
	// constants
	_null as null,
	_enum as enum,
	// types
	_array as array,
	_boolean as boolean,
	_integer as integer,
	_number as number,
	_object as object,
	_string as string,
	_tuple as tuple,
}
