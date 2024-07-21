import type { Annotations } from './core.ts';

export type Boolean = Annotations<boolean> & {
	type: 'boolean';
};

export declare function Boolean<
	F extends Boolean,
>(options?: Omit<F, 'type'>): F;
