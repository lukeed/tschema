import type { Annotations } from './core.ts';

export type Enum<T> = Annotations<T> & {
	enum: T[];
};

export function Enum<
	const V extends (boolean | null | number | string),
>(
	choices: V[],
	options?: Omit<Enum<V>, 'enum'>,
): Enum<V> {
	return {
		enum: choices,
		...options,
	};
}
