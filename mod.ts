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
/**
 * Infer the TypeScript type(s) information from a {@link Field} definition.
 *
 * ```ts
 * let isPerson = t.object({
 *   name: t.string(),
 *   age: t.optional(
 *     t.integer({ min: 0 })
 *   )
 * })
 *
 * type Person = t.Infer<typeof isPerson>;
 * //-> {
 * //->   name: string;
 * //->   age?: number;
 * //-> }
 * ```
 */
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

/**
 * Common annotation keywords assignable to any field schema.
 * @see https://json-schema.org/understanding-json-schema/reference/annotations
 */
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

/**
 * The possible `tschema` field value types.
 *
 * NOTE: Does not include modifiers (eg, `t.readonly`).
 */
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

/**
 * Mark a field as optional.
 *
 * NOTE: Only has an effect within {@link object} definitions.
 */
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
}

/**
 * Mark a field as readonly.
 *
 * @example Readonly Object Properties
 * ```ts
 * let person = t.readonly(
 *   t.object({
 *     name: t.string(),
 *     age: t.integer(),
 *   }),
 * );
 *
 * type Person = t.Infer<typeof person>;
 * //-> {
 * //->   readonly name: string;
 * //->   readonly age: number;
 * //-> }
 * ```
 *
 * @example Readonly Array
 * ```ts
 * let items = t.readonly(
 *   t.array(t.string()),
 * );
 *
 * type Items = t.Infer<typeof items>;
 * //-> readonly string[]
 * ```
 */
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

/**
 * Defines a `null` type.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/null)
 */
type _null = Annotations<null> & {
	type: 'null';
};

function _null(options?: Omit<_null, 'type'>): _null {
	return { ...options, type: 'null' };
}

// ENUM
// ---

/**
 * Defines an `enum` type which accepts a list of possible values.
 *
 * Because no `type` attribute is defined, the enumerated values may include different data types.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/enum)
 *
 * ```ts
 * // Define possible literal values of different types:
 * let mixed = t.enum(['error', 'warning', false, 0, 1, 2]);
 *
 * // Define a string field with limited string-only values:
 * let limited = t.string({
 *   enum: ['error', 'warning', 'off']
 * });
 * ```
 */
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

/**
 * Defines a `boolean` type.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/boolean)
 */
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

/**
 * Defines a `string` type.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/string)
 *
 * When `enum` attribute is defined, then {@link Infer} narrows this type to only those values.
 *
 * ```ts
 * let x1 = t.string();
 * type X1 = t.Infer<typeof x1>;
 * //-> string
 *
 * let x2 = t.string({ enum: ['foo', 'bar'] });
 * type X2 = t.Infer<typeof x2>;
 * //-> "foo" | "bar"
 * ```
 */
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

/**
 * Defines a `number` type.
 *
 * NOTE: A {@link number} is used for integers **or** floating point numbers. See {@link integer} to exclude floats.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/numeric#number)
 *
 * When `enum` attribute is defined, then {@link Infer} narrows this type to only those values.
 *
 * ```ts
 * let x1 = t.number();
 * type X1 = t.Infer<typeof x1>;
 * //-> number
 *
 * let x2 = t.number({ enum: [0, 1, 12.8, 101.3] });
 * type X2 = t.Infer<typeof x2>;
 * //-> 0 | 1 | 12.8 | 101.3
 * ```
 */
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

/**
 * Defines an `integer` type.
 *
 * NOTE: An {@link integer} is used to **only** accept integer numbers. See {@link number} to accept any numeric.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/numeric#integer)
 *
 * When `enum` attribute is defined, then {@link Infer} narrows this type to only those values.
 *
 * ```ts
 * let x1 = t.integer();
 * type X1 = t.Infer<typeof x1>;
 * //-> number
 *
 * let x2 = t.integer({ enum: [0, 1, 2, 3] });
 * type X2 = t.Infer<typeof x2>;
 * //-> 0 | 1 | 2 | 3
 * ```
 */
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

/**
 * Define an `array` type.
 *
 * NOTE: The {@link array} is used to define a sequence of arbitrary length where each item matches the same schema.
 * Consider {@link tuple} to define a sequence of fixed length where each item may have a different schema.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/array)
 *
 * ```ts
 * let hobbies = t.array(t.string());
 * type Hobbies = t.Infer<typeof hobbies>;
 * //-> string[]
 * ```
 */
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

/**
 * Define a `tuple` type.
 *
 * NOTE: A {@link tuple} is used to define a sequence of fixed length where each item may have a different schema.
 * Consider {@link array} to define a sequence of arbitrary length where each item matches the same schema.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/array#tupleValidation)
 *
 * ```ts
 * let item = t.tuple([
 *   t.integer(), // quantity
 *   t.string(), // item name
 * ]);
 * type InvoiceItem = t.Infer<typeof item>;
 * //-> [number, string]
 * ```
 */
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

/**
 * Define an `object` type.
 *
 * @see [Reference](https://json-schema.org/understanding-json-schema/reference/object)
 *
 * NOTE: By default, all properties are marked as required.
 * Use {@link optional} to mark individual properties as optional, or supply
 * your own `required` attribute.
 *
 * @example Basic Usage
 * ```ts
 * let pet = t.object({
 *   name: t.string(),
 *   type: t.enum(['dog', 'cat', 'other']),
 *   age: t.optional(t.integer()),
 * });
 *
 * type Pet = t.Infer<typeof pet>;
 * //-> {
 * //->   name: string;
 * //->   type: "dog" | "cat" | "other";
 * //->   age?: number | undefined;
 * //-> }
 * ```
 *
 * @example Extra Annotations
 * ```ts
 * let pet = t.object({
 *   name: t.string(),
 *   age: t.integer(),
 * }, {
 *   additionalProperties: false,
 *   description: 'the Pet schema',
 *   // ...
 * });
 * ```
 */
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
	// literals
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
