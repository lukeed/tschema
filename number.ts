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

export declare function Integer<
	const V extends number,
	F extends Integer<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export declare function Integer<
	F extends Integer,
>(options?: Omit<F, 'type'>): F;

export declare function Number<
	const V extends number,
	F extends Number<V>,
>(options?: Omit<F, 'type'> & { enum: V[] }): F;

export declare function Number<
	F extends Number,
>(options?: Omit<F, 'type'>): F;
