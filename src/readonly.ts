import type { Field } from './core.ts';

export type Readonly<T extends Field> = T & {
	readOnly: true;
};

export declare function Readonly<
	F extends Field,
>(field: F): Readonly<F>;
