/**
 * @module
 */
type Prettify<T> =
	& {
		[K in keyof T]: Prettify<T[K]>;
	}
	// deno-lint-ignore ban-types
	& {};

// deno-fmt-ignore
/**
 * Infer the TypeScript type(s) information from a {@link Type} definition.
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
	T extends _null ? null
	: T extends _boolean ? boolean
	: T extends _string<infer E> ? E
	: T extends _number<infer E> | _integer<infer E> ? E
	: T extends _readonly<infer X> ? Readonly<Infer<X>>
	: T extends _constant<infer V> ? V
	: T extends _enum<infer E> ? E
	: T extends _tuple<infer I>  ? Infer<I>
	: T extends _array<infer I> ? Infer<I>[]
	: T extends _dict<infer I> ? Record<string, Infer<I>>
	// compositions
	: T extends _not<infer _> ? unknown
	: T extends _any<infer A> | _one<infer A> ? Infer<A>
	: T extends _all<infer A> ? Infer<A>
	// read out values
	: T extends [infer A, ...infer B]
		? [Infer<A>, ...Infer<B>]
	: T extends Record<string, Type>
		? { [K in keyof T]: Infer<T[K]> }
	: T extends _object<infer P> ?
		Prettify<
			& { [K in keyof P as P[K] extends _optional<infer _> ? K : never]?: Infer<P[K]> }
			& { [K in keyof P as P[K] extends _optional<infer _> ? never : K]: Infer<P[K]> }
		>
	: T extends _unknown ? unknown
	: T;

/**
 * Common annotation keywords assignable to any field schema.
 * @see https://json-schema.org/understanding-json-schema/reference/annotations
 */
export type Annotations = {
	$schema?: string;
	$id?: string;
	title?: string;
	description?: string;
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
};

/**
 * @internal
 * JSON literal value types
 */
type Value = string | number | boolean | null;

/**
 * The possible `tschema` field value types.
 *
 * > [!NOTE]
 * > Does not include modifiers (eg, `t.readonly`).
 */
export type Type =
	| _array<unknown>
	| _boolean
	| _constant<Value>
	| _enum<Value>
	| _integer
	| _null
	| _number
	| _object
	| _string
	| _tuple<unknown>
	| _unknown
	| _all<unknown>
	| _any<unknown>
	| _one<unknown>
	| _not<unknown>;

const OPTIONAL: unique symbol = Symbol.for('optional');

/**
 * @internal
 * Marks an object property as optional.
 */
type _optional<T extends Type> = T & {
	[OPTIONAL]: true;
};

/**
 * Mark an object property field as optional.
 *
 * > [!NOTE]
 * > Only has an effect within {@link object} definitions.
 */
function _optional<T extends Type>(field: T): _optional<T> {
	return {
		...field,
		[OPTIONAL]: true,
	};
}

/**
 * @internal
 * Marks an {@link object}, {@link array}, or {@link tuple} field as readonly.
 */
type _readonly<T extends Type> = T & {
	readOnly: true;
};

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
function _readonly<T extends Type>(field: T): _readonly<T> {
	return {
		...field,
		readOnly: true,
	};
}

/**
 * Marks all properties within an {@link object} as optional.
 *
 * The `input` schema is not modified.
 *
 * > [!IMPORTANT]
 * > Only accepts an {@link object} schema!
 *
 * @example
 * ```ts
 * let person = t.partial(
 *   t.object({
 *     name: t.string(),
 *     age: t.integer(),
 *   }),
 * );
 *
 * type Person = t.Infer<typeof person>;
 * //-> {
 * //->   name?: string;
 * //->   age?: number;
 * //-> }
 * ```
 */
// @ts-expect-error; object needs distinct/definitive type else array overlap
function _partial<P extends Properties>(input: _object<P>): _object<Partial<P>> {
	// deno-lint-ignore no-unused-vars
	let { required, ...schema } = input;
	return schema;
}

/**
 * The `null` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/null)
 */
type _null = Annotations & {
	type: 'null';
	default?: null;
	examples?: null[];
};

/**
 * Defines a `null` type.
 */
function _null(options?: Omit<_null, 'type'>): _null {
	return { ...options, type: 'null' };
}

/**
 * An unknown type.
 *
 * > [!IMPORTANT]
 * > Equivalent to `unknown` in TypeScript, which allows any value.
 */
type _unknown = Annotations & {
	default?: unknown;
	examples?: unknown[];
};

/**
 * Defines a schema of unknown type.
 *
 * > [!IMPORTANT]
 * > Equivalent to `unknown` in TypeScript, which allows any value.
 */
function _unknown(options?: _unknown): _unknown {
	return options || {};
}

/**
* A constant literal value.

* [Reference](https://json-schema.org/understanding-json-schema/reference/const)
*/
type _constant<V extends Value> = Annotations & {
	const: V;
	default?: V;
	examples?: V[];
};

/**
 * Define a constant to restrict a value to a single value.
 *
 * ```ts
 * const country = t.constant('USA', {
 *   description: 'We only ship to the United States.',
 * });
 * ```
 */
function _constant<
	const V extends Value,
>(
	value: V,
	options?: Omit<_constant<V>, 'const'>,
): _constant<V> {
	return { ...options, const: value };
}

/**
 * The `enum` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/enum)
 */
type _enum<V extends Value> = Annotations & {
	enum: V[];
	default?: V;
	examples?: V[];
};

/**
 * Defines an `enum` type to accept a list of possible values.
 *
 * > [!NOTE]
 * > Because no `type` attribute is defined, the enumerated values may include different data types.
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
function _enum<
	const V extends Value,
>(
	choices: V[],
	options?: Omit<_enum<V>, 'enum'>,
): _enum<V> {
	return {
		enum: choices,
		...options,
	};
}

/**
 * The `boolean` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/boolean)
 */
type _boolean = Annotations & {
	type: 'boolean';
	default?: boolean;
	examples?: boolean[];
};

/**
 * Defines a `boolean` type.
 */
function _boolean(options?: Omit<_boolean, 'type'>): _boolean {
	return { ...options, type: 'boolean' };
}

/**
 * A `string` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/string)
 */
type _string<E extends string = string> = Annotations & {
	type: 'string';
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	enum?: E[];
	default?: E;
	examples?: E[];
	/** https://json-schema.org/understanding-json-schema/reference/string#built-in-formats */
	format?:
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
};

/**
 * Defines a `string` type.
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

/**
 * A `number` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/numeric#number)
 */
type _number<E extends number = number> = Annotations & {
	type: 'number';
	enum?: E[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
	default?: E;
	examples?: E[];
};

/**
 * Defines a `number` type.
 *
 * > [!NOTE]
 * > A {@link number} is used for integers **or** floating point numbers. See {@link integer} to exclude floats.
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
 * The `integer` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/numeric#integer)
 */
type _integer<E extends number = number> = Omit<_number<E>, 'type'> & {
	type: 'integer';
};

/**
 * Defines an `integer` type.
 *
 * > [!NOTE]
 * > An {@link integer} is used to **only** accept integer numbers.
 * > See {@link number} to accept any numeric.
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

/**
 * The `array` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/array)
 */
type _array<T> = Annotations & {
	type: 'array';
	items?: T;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	contains?: Type;
	minContains?: number;
	maxContains?: number;
	prefixItems?: Type[];
	default?: Infer<T>[];
	examples?: Array<Infer<T>[]>;
};

/**
 * Define an `array` type.
 *
 * > [!NOTE]
 * > The {@link array} is used to define a sequence of arbitrary length where each item matches the same schema.
 * > Consider {@link tuple} to define a sequence of fixed length where each item may have a different schema.
 *
 * ```ts
 * let hobbies = t.array(t.string());
 * type Hobbies = t.Infer<typeof hobbies>;
 * //-> string[]
 * ```
 */
function _array<
	const I extends Type,
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
 * The `tuple` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/array#tupleValidation)
 */
type _tuple<T> = Annotations & {
	type: 'array';
	prefixItems?: T;
	additionalItems?: Type;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	contains?: Type;
	minContains?: number;
	maxContains?: number;
	default?: Infer<T>;
	examples?: Array<Infer<T>>;
};

/**
 * Define a `tuple` type.
 *
 * > [!NOTE]
 * > A {@link tuple} is used to define a sequence of fixed length where each item may have a different schema.
 * > Consider {@link array} to define a sequence of arbitrary length where each item matches the same schema.
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
function _tuple<
	const M extends Type[],
>(
	members?: M,
	options?: Omit<_tuple<M>, 'type' | 'prefixItems'>,
): _tuple<M> {
	let len = members ? members.length : 0;
	return {
		maxItems: len,
		minItems: len,
		...options,
		type: 'array',
		prefixItems: members,
	} as _tuple<M>;
}

/**
 * A dictionary is an `object` of values but unknown property names.
 */
type _dict<T extends Type> = Annotations & {
	type: 'object';
	patternProperties?: Type;
	additionalProperties: T;
	propertyNames?: Partial<_string>;
	minProperties?: number;
	maxProperties?: number;
	default?: Infer<T>;
	examples?: Array<Infer<T>>;
};

/**
 * Define an `object` dictionary of values.
 *
 * > [!NOTE]
 * > A {@link dict} is used to define an object of unknown/any property *keys* but all values must be of a certain type.
 * > Consider {@link object} to define an object with specified/known keys.
 *
 * ```ts
 * let ages = t.dict(t.integer())
 * type Ages = t.Infer<typeof ages>;
 * //-> Record<string, number>
 * ```
 */
function _dict<
	const I extends Type,
	F extends _dict<I>,
>(
	value: I,
	options?: Omit<F, 'type' | 'additionalProperties'>,
): F {
	return {
		...options,
		type: 'object',
		additionalProperties: value,
	} as F;
}

/**
 * The {@link _object} property definitions.
 *
 * > [!NOTE]
 * > You probably don't want this type, unless you are extending/building your own types.
 */
type Properties = {
	[name: string]: Type & {
		[OPTIONAL]?: true;
	};
};

/**
 * The `object` type.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/object)
 */
type _object<T extends Properties = Properties> = Annotations & {
	type: 'object';
	properties?: T;
	required?: (keyof T)[];
	patternProperties?: Type;
	additionalProperties?: Type | boolean;
	propertyNames?: Partial<_string>;
	minProperties?: number;
	maxProperties?: number;
	default?: Infer<T>;
	examples?: Array<Infer<T>>;
};

/**
 * Define an `object` type.
 *
 * > [!IMPORTANT]
 * > By default, all properties are marked as required.
 * > Use {@link optional} to mark individual properties as optional, or supply
 * > your own `required` attribute.
 *
 * > [!IMPORTANT]
 * > By default, `additionalProperties: false` is added when `properties` are defined.
 * > This restricts the object's definition to **only** accept the property fields you've defined.
 * > Otherwise, when no `properties` are defined — for example, `t.object()` — then
 * > `additionalProperties: false` **is not** added, which allows for extra
 * > properties. You may explicitly control this setting via
 * > `options.additionalProperties` at any time.
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
 *   description: 'the Pet schema',
 *   // ...
 * });
 * ```
 *
 * @example Additional Properties
 * ```ts
 * // Accept any object
 * // AKA: any object w/ any properties
 * let a = t.object();
 * //-> { type: "object" }
 *
 * // Accept a specific object
 * // AKA: only specified properites
 * let b = t.object({
 *   name: t.string(),
 * });
 * //-> {
 * //->   type: "object",
 * //->   additionalProperties: false,
 * //->   required: ["name"],
 * //->   properties: {
 * //->     name: { type: "string" }
 * //->   }
 * //-> }
 *
 * // Accept a specific object
 * // ... but allow extra properties
 * let c = t.object({
 *   name: t.string(),
 * }, {
 *   additionalProperties: true,
 * });
 * //-> {
 * //->   type: "object",
 * //->   additionalProperties: true,
 * //->   required: ["name"],
 * //->   properties: {
 * //->     name: { type: "string" }
 * //->   }
 * //-> }
 */
function _object<
	P extends Properties,
	T extends _object<P>,
>(
	properties?: P,
	options?: Omit<T, 'type' | 'properties'>,
): T {
	let o = {
		...options,
		type: 'object',
		properties,
	} as T;

	if (properties) {
		o.additionalProperties ||= false;

		if (!o.required) {
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
	}

	return o;
}

// compositions

/**
 * An `anyOf` (OR) composition.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/combining#anyOf)
 */
type _any<T> = {
	anyOf: T[];
};

/**
 * Defines an `anyOf` (OR) composition.
 *
 * Declares that the field may be valid against *any* of the subschemas.
 *
 * > [!IMPORTANT]
 * > This is NOT the TypeScript `any` keyword!
 *
 * ```ts
 * let _ = t.any(
 *   t.string({ maxLength: 5 }),
 *   t.number({ minimum: 0 }),
 * );
 * //-> PASS: `"short"` or `12`
 * //-> FAIL: `"too long"` or `-5`
 * ```
 */
function _any<T extends Type[]>(...anyOf: T): _any<T[number]> {
	return { anyOf };
}

/**
 * An `oneOf` (XOR) composition.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/combining#oneOf)
 */
type _one<T> = {
	oneOf: T[];
};

/**
 * Defines an `oneOf` composition.
 *
 * Declares that a field must be valid against *exactly one* of the subschemas.
 *
 * ```ts
 * let _ = t.one(
 *   t.number({ multipleOf: 5 }),
 *   t.number({ multipleOf: 3 }),
 * );
 * //-> PASS: `10` or `9`
 * //-> FAIL: `15` or `2`
 * ```
 */
function _one<T extends Type[]>(...oneOf: T): _one<T[number]> {
	return { oneOf };
}

/**
 * A `not` composition.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/combining#not)
 */
type _not<T> = {
	not: T;
};

/**
 * Defines a `not` composition (NOT).
 *
 * Declares that a field must *not* be valid against the schema.
 */
function _not<T extends Type>(not: T): _not<T> {
	return { not };
}

/**
 * An `allOf` (AND) composition.
 *
 * [Reference](https://json-schema.org/understanding-json-schema/reference/combining#allOf)
 */
type _all<T> = {
	allOf: T[];
};

/**
 * Defines an `allOf` composition (AND).
 *
 * Declares that a field must be valid against **all** of the subschemas.
 */
function _all<T extends Type>(...allOf: T[]): _all<T> {
	return { allOf };
}

// deno-fmt-ignore
export {
	// composites
	_all as all,
	_any as any,
	_one as one,
	_not as not,
	// modifiers
	_optional as optional,
	_readonly as readonly,
	_partial as partial,
	// literals
	_null as null,
	_constant as constant,
	_enum as enum,
	// types
	_array as array,
	_boolean as boolean,
	_integer as integer,
	_number as number,
	_object as object,
	_string as string,
	_tuple as tuple,
	_unknown as unknown,
	_dict as dict,
}
