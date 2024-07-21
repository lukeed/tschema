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

export declare function Array<
	I extends Field,
	F extends Array<I>,
>(
	items?: I,
	options?: Omit<F, 'type' | 'items'>,
): F;

export declare function Tuple<
	const M extends Field[],
	F extends Tuple<M>,
>(
	members?: M,
	options?: Omit<F, 'type' | 'prefixItems'>,
): F;
