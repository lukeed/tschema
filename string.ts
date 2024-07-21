import type { Annotations } from './core.ts';

/**
 * https://json-schema.org/understanding-json-schema/reference/string#built-in-formats
 */
export type Format =
	| 'date-time'
	| 'time'
	| 'date'
	| 'duration'
	| 'email'
	| 'idn-email'
	| 'hostname'
	| 'idn-hostname'
	| 'ipv4'
	| 'ipv6'
	| 'uuid'
	| 'uri'
	| 'uri-reference'
	| 'iri'
	| 'iri-reference'
	| 'uri-template'
	| 'json-pointer'
	| 'relative-json-pointer'
	| 'regex';

export type String = Annotations<string> & {
	type: 'string';
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	enum?: string[];
	format?: Format;
};

export declare function String<
	F extends String,
>(options?: Omit<F, 'type'>): F;
