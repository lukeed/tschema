import type { Annotations } from './core.ts';

export type Number = Annotations<number> & {
	type: 'number';
	enum?: number[];
	multipleOf?: number;
	minimum?: number;
	exclusiveMinimum?: number;
	maximum?: number;
	exclusiveMaximum?: number;
};

export type Integer = Omit<Number, 'type'> & {
	type: 'integer';
};

export declare function Integer<
	F extends Integer,
>(options?: Omit<F, 'type'>): F;

export declare function Number<
	F extends Number,
>(options?: Omit<F, 'type'>): F;
