import type { Field } from './core.ts';

export type Readonly<T extends Field> = T & {
	readOnly: true;
};

export function Readonly<
	F extends Field,
>(field: F): Readonly<F> {
	return {
		...field,
		readOnly: true,
	};
}
