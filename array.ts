import type { Annotations, Field } from './core.ts';

export type Array<T> = Annotations<T> & {
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
