import type { Annotations } from './core.ts';

export type Number<E extends number = number> = Annotations<E> & {
	type: 'number';
	enum?: E[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
};

export type Integer<E extends number = number> = Omit<Number<E>, 'type'> & {
	type: 'integer';
};

export function Integer<
	const V extends number,
	F extends Integer<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export function Integer<
	F extends Integer,
>(options?: Omit<F, 'type'>): F;

export function Integer(
	options?: Omit<Integer, 'type'>,
): Integer {
	return { ...options, type: 'integer' };
}

export function Number<
	const V extends number,
	F extends Number<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export function Number<
	F extends Number,
>(options?: Omit<F, 'type'>): F;

export function Number(
	options?: Omit<Number, 'type'>,
): Number {
	return { ...options, type: 'number' };
}
