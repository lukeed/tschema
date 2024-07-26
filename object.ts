import { OPTIONAL } from './optional.ts';

import type { Annotations, Field } from './core.ts';
import type { String } from './string.ts';

export type Properties = {
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
