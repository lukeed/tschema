/**
 * @module
 */
import { validate } from './validate';

import type { Infer, Type } from './mod';
import type { Invalid } from './validate';

/**
 * A schema in the [Standard Schema](https://standardschema.dev) and Standard JSON Schema formats,
 * for libraries that accept either one.
 *
 * ```ts
 * let User = std.schema(t.object({ name: t.string() }));
 *
 * User['~standard'].validate({ name: 'Alex' });
 * //-> { value: { name: 'Alex' } }
 *
 * User['~standard'].jsonSchema.input({ target: 'draft-2020-12' });
 * //-> { type: 'object', properties: { name: { type: 'string' } }, ... }
 * ```
 */
export type Standard<T> = {
	readonly '~standard': Standard.Props<T>;
};

export declare namespace Standard {
	/** The `~standard` properties. */
	type Props<T> = {
		readonly version: 1;
		readonly vendor: 'tschema';
		readonly validate: (value: unknown) => Result<T>;
		readonly jsonSchema: Converter;
		/** The inferred types. Not defined at runtime. */
		readonly types?: Types<T>;
	};

	/** The input and output types, which are always the same. */
	type Types<T> = {
		readonly input: T;
		readonly output: T;
	};

	/** The {@link Props.validate} output. */
	type Result<T> = Success<T> | Failure;

	/** A valid input, typed as the schema's {@link Infer} type. */
	type Success<T> = {
		readonly value: T;
		readonly issues?: undefined;
	};

	/** An invalid input, with all of its {@link Issue} items. */
	type Failure = {
		readonly issues: readonly Issue[];
	};

	/**
	 * A single validation error.
	 *
	 * ```ts
	 * //-> { message: 'must be string', path: ['tags', '2'] }
	 * ```
	 */
	type Issue = {
		readonly message: string;
		/** The keys from the input root to the invalid value. */
		readonly path: readonly string[];
	};

	/** Returns the JSON schema. Only the `draft-2020-12` target is supported. */
	type Converter = {
		readonly input: (options: Options) => Record<string, unknown>;
		readonly output: (options: Options) => Record<string, unknown>;
	};

	/** The {@link Converter} options. */
	type Options = {
		readonly target: string;
		readonly libraryOptions?: Record<string, unknown>;
	};
}

/**
 * @internal
 * A validator, as created by `tschema/validate` or the `tschema/plugins` compiler.
 */
type Check<T> = (value: unknown) => { ok: true; value: T } | { ok: false; errors: Invalid[] };

function snapshot<T>(input: T): T {
	let copy = structuredClone(input);
	let todo: unknown[] = [copy];
	for (let x of todo) {
		if (typeof x !== 'object' || x === null) continue;
		todo.push(...Object.values(x));
		Object.freeze(x);
	}
	return copy;
}

function issue(invalid: Invalid): Standard.Issue {
	let at = invalid.instanceLocation;
	return {
		message: invalid.error,
		path: at
			? at
					.slice(1)
					.split('/')
					.map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'))
			: [],
	};
}

function build<T>(json: Type, check: Check<T>): Standard<T> {
	let convert = (options: Standard.Options): Record<string, unknown> => {
		if (options.target === 'draft-2020-12') return json;
		throw new Error(`Unsupported JSON Schema target: "${options.target}"`);
	};
	return {
		'~standard': {
			version: 1,
			vendor: 'tschema',
			validate(value) {
				let result = check(value);
				return result.ok ? { value: result.value } : { issues: result.errors.map(issue) };
			},
			jsonSchema: { input: convert, output: convert },
		},
	};
}

/**
 * Create a {@link Standard} schema from a `tschema` schema.
 *
 * The result holds a frozen copy of the schema, so later changes to `input` do not affect it.
 * Its validator compiles on first use, unless the `tschema/plugins` compiler already compiled it.
 *
 * ```ts
 * import * as t from 'tschema';
 * import * as std from 'tschema/standard';
 *
 * let User = std.schema(t.object({ name: t.string() }));
 *
 * let result = User['~standard'].validate(input);
 * if (result.issues) console.log(result.issues);
 * else console.log(result.value.name);
 * ```
 */
export function schema<T extends Type>(input: T): Standard<Infer<T>> {
	let json = snapshot(input);
	return build(json, (value) => validate(json, value));
}

/**
 * @internal
 * Create a {@link Standard} schema with an ahead-of-time validator.
 * Only the modules that `tschema/plugins` generates call this.
 */
export function compiled<T>(input: Type, check: Check<T>): Standard<T> {
	return build(snapshot(input), check);
}
