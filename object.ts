import type { Annotations, Field } from './core.ts';
import type { String } from './string.ts';

export type Object<T> = Annotations<T> & {
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

	P extends Record<string, Field>,
export function Object<
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
