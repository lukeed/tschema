import type { Annotations } from './core.ts';

export type Enum<T> = Annotations<T> & {
	enum: T;
};

export declare function Enum<
	const V extends (boolean | null | number | string),
	F extends Enum<V>,
>(
	choices: V[],
	options?: Omit<F, 'enum'>,
): F;
