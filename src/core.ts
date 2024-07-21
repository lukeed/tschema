import type { Enum } from './enum.ts';
import type { Object } from './object.ts';
import type { Array, Tuple } from './array.ts';
import type { Integer, Number } from './number.ts';
import type { Readonly as R } from './readonly.ts';
import type { Boolean } from './boolean.ts';
import type { String } from './string.ts';
import type { Null } from './null.ts';

type toEnum<V, F> = V extends unknown[] ? V[number] : F;

export type Field =
	| Array<unknown>
	| Boolean
	| Enum<unknown>
	| Integer
	| Null
	| Number
	| Object<object>
	| String
	| Tuple<unknown>;

// deno-fmt-ignore
export type Infer<T> =
	T extends R<infer X>
		? Readonly<Infer<X>>
	: T extends String
		? (T extends { enum: infer V } ? toEnum<V, string> : string)
	: T extends Number
		? (T extends { enum: infer V } ? toEnum<V, number> : number)
	: T extends Object<infer P>
		? { [K in keyof P]: Infer<P[K]> }
	: T extends Array<infer I>
		? Infer<I>[]
	: T extends Tuple<infer I>
		? { [K in keyof I]: number }
	: T extends Enum<infer V>
		? toEnum<V, never>
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
