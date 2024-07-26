import type { Field } from './core.ts';

export const OPTIONAL = Symbol.for('optional');

export type Optional<T extends Field> = T & {
	[OPTIONAL]: true;
};

export function Optional<
	F extends Field,
>(field: F): Optional<F> {
	return {
		...field,
		[OPTIONAL]: true,
	};
}
