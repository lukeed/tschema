import type { Annotations, Field } from './core.ts';
import type { String } from './string.ts';

export type Object<T> = Annotations<T> & {
	type: 'object';
	properties?: {
		[K in keyof T]: T[K];
	};
	patternProperties?: Field;
	additionalProperties?: Field | boolean;
	propertyNames?: Partial<String>;
	minProperties?: number;
	maxProperties?: number;
};

export declare function Object<
	P extends Record<string, Field>,
	F extends Object<P>,
>(
	properties?: P,
	options?: Omit<F, 'type' | 'properties'>,
): F;
