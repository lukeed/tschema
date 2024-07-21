import type { Annotations } from './core.ts';

export type Null = Annotations<null> & {
	type: 'null';
};

export declare function Null<
	F extends Null,
>(options?: Omit<F, 'type'>): F;
