import type { Annotations } from './core.ts';

export type Null = Annotations<null> & {
	type: 'null';
};

export function Null(options?: Omit<Null, 'type'>): Null {
	return { ...options, type: 'null' };
}
