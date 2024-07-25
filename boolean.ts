import type { Annotations } from './core.ts';

export type Boolean = Annotations<boolean> & {
	type: 'boolean';
};

export function Boolean(options?: Omit<Boolean, 'type'>): Boolean {
	return { ...options, type: 'boolean' };
}
