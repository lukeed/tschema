type OmitNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

// deno-fmt-ignore
type __Optionals<T> = OmitNever<{
	[K in keyof T]: T[K] extends Optional<infer X> ? Infer<X> : never;
}>;

type Prettify<T> =
	& {
		[K in keyof T]: Prettify<T[K]>;
	}
	// deno-lint-ignore ban-types
	& {};

type RequiredProperties<T> = {
	[K in keyof T as T[K] extends Optional<infer _> ? never : K]: Infer<T[K]>;
};

type OptionalProperties<T, M = __Optionals<T>> = {
	[K in keyof M]?: M[K];
};

// type InferProperties<T, M = RequiredProperties<T> & OptionalProperties<T>> = {
// 	[K in keyof T]: M[K];
// };

type READ<T> = {
	readonly [K in keyof T]: T[K];
};

// deno-fmt-ignore
export type Infer<T> =
	T extends Readonly<infer X>
		? READ<Infer<X>>
	: T extends Null
		? null
	: T extends Boolean
		? boolean
	: T extends String<infer E>
		? E
	: T extends Number<infer E> | Integer<infer E>
		? E
	: T extends Object<infer P>
		? Prettify<
				& RequiredProperties<P>
				& OptionalProperties<P>
			>
	: T extends Tuple<infer I>
		? Infer<I>
	: T extends Array<infer I>
		? Infer<I>[]
	: T extends Enum<infer E>
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
	| Array<unknown>
	| Boolean
	| Enum<unknown>
	| Integer
	| Null
	| Number
	| Object<Properties>
	| String
	| Tuple<unknown>;

// MODIFIERS
// ---

const OPTIONAL: unique symbol = Symbol.for('optional');

export type Optional<T extends Field> = T & {
	[OPTIONAL]: true;
};

export function Optional<
	F extends Field,
>(field: F): Optional<F> {
	return {
		...field,
		[OPTIONAL]: true,
	};
}

export type Readonly<T extends Field> = T & {
	readOnly: true;
};

export function Readonly<T extends Field>(field: T): Readonly<T> {
	return {
		...field,
		readOnly: true,
	};
}

// NULL
// ---

export type Null = Annotations<null> & {
	type: 'null';
};

export function Null(options?: Omit<Null, 'type'>): Null {
	return { ...options, type: 'null' };
}

// ENUM
// ---

export type Enum<T> = Annotations<T> & {
	enum: T[];
};

export function Enum<
	const V extends (boolean | null | number | string),
>(
	choices: V[],
	options?: Omit<Enum<V>, 'enum'>,
): Enum<V> {
	return {
		enum: choices,
		...options,
	};
}

// BOOLEAN
// ---

export type Boolean = Annotations<boolean> & {
	type: 'boolean';
};

export function Boolean(options?: Omit<Boolean, 'type'>): Boolean {
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

export type String<E extends string = string> = Annotations<E> & {
	type: 'string';
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: Format;
	enum?: E[];
};

export function String<
	const V extends string,
	F extends String<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export function String<
	F extends String,
>(options?: Omit<F, 'type'>): F;

export function String(
	options?: Omit<String, 'type'>,
): String {
	return { ...options, type: 'string' };
}

// NUMERIC
// ---

export type Number<E extends number = number> = Annotations<E> & {
	type: 'number';
	enum?: E[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
};

export type Integer<E extends number = number> = Omit<Number<E>, 'type'> & {
	type: 'integer';
};

export function Integer<
	const V extends number,
	F extends Integer<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export function Integer<
	F extends Integer,
>(options?: Omit<F, 'type'>): F;

export function Integer(
	options?: Omit<Integer, 'type'>,
): Integer {
	return { ...options, type: 'integer' };
}

export function Number<
	const V extends number,
	F extends Number<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export function Number<
	F extends Number,
>(options?: Omit<F, 'type'>): F;

export function Number(
	options?: Omit<Number, 'type'>,
): Number {
	return { ...options, type: 'number' };
}

// LISTS
// ---

export type Array<T> = Annotations<T[]> & {
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

export type Tuple<T> = Annotations<T> & {
	__type: 'tuple';
	type: 'array';
	prefixItems?: T;
	items?: false | Field;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	contains?: Field;
	minContains?: number;
	maxContains?: number;
};

export function Array<
	const I extends Field,
	F extends Array<I>,
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

export function Tuple<
	const M extends Field[],
>(
	members?: M,
	options?: Omit<Tuple<M>, 'type' | 'prefixItems'>,
): Tuple<M> {
	return {
		...options,
		type: 'array',
		prefixItems: members,
	} as Tuple<M>;
}

// OBJECT
// ---

type Properties = {
	[name: string]: Field & {
		[OPTIONAL]?: true;
	};
};

export type Object<T extends Properties> = Annotations<T> & {
	type: 'object';
	properties?: {
		[K in keyof T]: T[K];
	};
	required?: (keyof T)[];
	patternProperties?: Field;
	additionalProperties?: Field | boolean;
	propertyNames?: Partial<String>;
	minProperties?: number;
	maxProperties?: number;
};

export function Object<
	P extends Properties,
	F extends Object<P>,
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
