/**
 * @module
 */
import { compile, helpers } from './compile.ts';

import type { Infer, Type } from './mod.ts';

/**
 * A single validation error, in the JSON Schema "basic" output format.
 *
 * [Reference](https://json-schema.org/draft/2020-12/json-schema-core#name-basic)
 *
 * ```ts
 * let result = validate(User, { name: 123 });
 * //-> {
 * //->   ok: false,
 * //->   errors: [{
 * //->     instanceLocation: "/name",
 * //->     keywordLocation: "/properties/name/type",
 * //->     error: "must be string",
 * //->   }]
 * //-> }
 * ```
 */
export type Invalid = {
	/** The JSON Pointer to the invalid value. */
	instanceLocation: string;
	/** The JSON Pointer to the failed schema keyword. */
	keywordLocation: string;
	/** The error message. */
	error: string;
};

/**
 * The {@link validate} output.
 *
 * ```ts
 * let result = validate(User, input);
 * if (result.ok) {
 *   result.value; //-> User
 * } else {
 *   result.errors; //-> Invalid[]
 * }
 * ```
 */
export type Result<T extends Type> = Result.Ok<T> | Result.Err<T>;

export declare namespace Result {
	/** A valid input, typed as the schema's {@link Infer} type. */
	type Ok<T extends Type> = {
		ok: true;
		value: Infer<T>;
		errors?: never[];
	};

	/** An invalid input, with all of its {@link Invalid} errors. */
	type Err<T extends Type> = {
		ok: false;
		value?: never;
		errors: Invalid[];
	};
}

/**
 * The error thrown by {@link assert} for the first invalid value.
 *
 * ```ts
 * try {
 *   assert(User, { name: 123 });
 * } catch (err) {
 *   err instanceof ValidationError; //-> true
 *   err.message; //-> "/name must be string"
 *   err.instanceLocation; //-> "/name"
 *   err.keywordLocation; //-> "/properties/name/type"
 * }
 * ```
 */
export class ValidationError extends Error {
	/** The JSON Pointer to the invalid value. */
	instanceLocation: string;
	/** The JSON Pointer to the failed schema keyword. */
	keywordLocation: string;

	constructor(invalid: Invalid) {
		let at = invalid.instanceLocation;
		super(at ? `${at} ${invalid.error}` : invalid.error);
		this.name = 'ValidationError';
		this.instanceLocation = at;
		this.keywordLocation = invalid.keywordLocation;
	}
}

type Validator<T extends Type> = [
	validate: (input: unknown) => Result<T>,
	parse: (input: unknown) => Infer<T> | undefined,
	assert: (input: unknown) => void,
];

const cache = new WeakMap<Type, unknown>();
const instances = new Map<string, unknown>();

function helper(name: string): unknown {
	let value = instances.get(name);
	if (value === undefined) {
		let [factory, ...deps] = helpers[name];
		instances.set(name, value = Reflect.apply(factory, undefined, deps.map(helper)));
	}
	return value;
}

function load<T extends Type>(schema: T): Validator<T> {
	let fns = cache.get(schema) as Validator<T> | undefined;
	if (fns) return fns;

	let { code, deps } = compile(schema);
	let args = deps.map((name) => '$' + name);
	let output: Validator<T> = new Function(
		'ValidationError',
		...args,
		`${code}return[validate,parse,assert]`,
	)(
		ValidationError,
		...deps.map(helper),
	);

	cache.set(schema, output);
	return output;
}

/**
 * Validate an `input` against a `schema`, collecting all errors.
 *
 * ```ts
 * let result = validate(User, input);
 * if (result.ok) {
 *   console.log(result.value.name);
 * } else {
 *   console.log(result.errors);
 * }
 * ```
 */
export function validate<T extends Type>(schema: T, input: unknown): Result<T> {
	return load(schema)[0](input);
}

/**
 * Return the `input` if it is valid, otherwise `undefined`.
 *
 * > [!NOTE]
 * > Stops at the first error.
 *
 * ```ts
 * let user = parse(User, input);
 * if (user) console.log(user.name);
 * ```
 */
export function parse<T extends Type>(schema: T, input: unknown): Infer<T> | undefined {
	return load(schema)[1](input);
}

/**
 * Throw a {@link ValidationError} if the `input` is invalid.
 *
 * > [!NOTE]
 * > Stops at the first error.
 *
 * ```ts
 * assert(User, input);
 * console.log(input.name);
 * ```
 */
export function assert<T extends Type>(schema: T, input: unknown): asserts input is Infer<T> {
	load(schema)[2](input);
}
