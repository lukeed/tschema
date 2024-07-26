import type { Enum } from './enum.ts';
import type { Array, Tuple } from './array.ts';
import type { Integer, Number } from './number.ts';
import type { Object, Properties } from './object.ts';
import type { Readonly as R } from './readonly.ts';
import type { Optional } from './optional.ts';
import type { Boolean } from './boolean.ts';
import type { String } from './string.ts';
import type { Null } from './null.ts';

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

// deno-fmt-ignore
export type Infer<T> =
	T extends R<infer X>
		? Readonly<Infer<X>>
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
	examples?: T[];
	default?: T;
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
};
