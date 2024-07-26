import { assert, assertEquals } from 'jsr:@std/assert';
import { describe, it } from 'jsr:@std/testing/bdd';
import * as t from './mod.ts';

// TODO: remove [OPTIONAL] key (making it `?: true` breaks Object property infer)

describe('Null', () => {
	it('should be a function', () => {
		assert(typeof t.Null === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/null
	it('should be JSON schema', () => {
		assertEquals(t.Null(), {
			type: 'null',
		});
	});

	it('should allow annotations', () => {
		let output = t.Null({
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'null',
			deprecated: true,
			description: 'hello',
		});
	});

	it('should force "type" property', () => {
		let output = t.Null({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'null',
		});
	});
});

describe('Boolean', () => {
	it('should be a function', () => {
		assert(typeof t.Boolean === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/boolean
	it('should be JSON schema', () => {
		assertEquals(t.Boolean(), {
			type: 'boolean',
		});
	});

	it('should allow annotations', () => {
		let output = t.Boolean({
			default: false,
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'boolean',
			deprecated: true,
			description: 'hello',
			default: false,
		});
	});

	it('should force "type" property', () => {
		let output = t.Boolean({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'boolean',
		});
	});
});

describe('String', () => {
	it('should be a function', () => {
		assert(typeof t.String === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/string
	it('should be JSON schema', () => {
		assertEquals(t.String(), {
			type: 'string',
		});
	});

	it('should allow annotations', () => {
		let output = t.String({
			default: 'foobar',
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'string',
			deprecated: true,
			description: 'hello',
			default: 'foobar',
		});
	});

	it('should force "type" property', () => {
		let output = t.String({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'string',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.String({
			enum: ['foo', 'bar', 'baz'],
			default: 'baz',
		});

		assertEquals(output, {
			type: 'string',
			enum: ['foo', 'bar', 'baz'],
			default: 'baz',
		});
	});
});

describe('Integer', () => {
	it('should be a function', () => {
		assert(typeof t.Integer === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		assertEquals(t.Integer(), {
			type: 'integer',
		});
	});

	it('should allow annotations', () => {
		let output = t.Integer({
			default: 123,
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'integer',
			deprecated: true,
			description: 'hello',
			default: 123,
		});
	});

	it('should force "type" property', () => {
		let output = t.Integer({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'integer',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.Integer({
			enum: [1, 2, 3],
			default: 2,
		});

		assertEquals(output, {
			type: 'integer',
			enum: [1, 2, 3],
			default: 2,
		});
	});
});

describe('Number', () => {
	it('should be a function', () => {
		assert(typeof t.Number === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		assertEquals(t.Number(), {
			type: 'number',
		});
	});

	it('should allow annotations', () => {
		let output = t.Number({
			default: 123,
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'number',
			deprecated: true,
			description: 'hello',
			default: 123,
		});
	});

	it('should force "type" property', () => {
		let output = t.Number({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'number',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.Number({
			enum: [1, 2, 3],
			default: 2,
		});

		assertEquals(output, {
			type: 'number',
			enum: [1, 2, 3],
			default: 2,
		});
	});
});

describe('Enum', () => {
	it('should be a function', () => {
		assert(typeof t.Enum === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/enum
	it('should be JSON schema', () => {
		assertEquals(t.Enum([]), {
			enum: [],
		});
	});

	it('should allow annotations', () => {
		let output = t.Enum(['foo', 123], {
			deprecated: true,
			description: 'hello',
			default: 'foo',
		});

		assertEquals(output, {
			enum: ['foo', 123],
			description: 'hello',
			deprecated: true,
			default: 'foo',
		});
	});
});

describe('Array', () => {
	it('should be a function', () => {
		assert(typeof t.Array === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/array
	it('should be JSON schema', () => {
		assertEquals(t.Array(), {
			type: 'array',
			items: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.Array(undefined, {
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'array',
			items: undefined,
			description: 'hello',
			deprecated: true,
		});
	});

	it('should build "items" property', () => {
		let output = t.Array(
			t.String({
				description: 'item',
			}),
			{
				minItems: 4,
				description: 'list',
				default: ['123'],
			},
		);

		assertEquals(output, {
			type: 'array',
			description: 'list',
			default: ['123'],
			minItems: 4,
			items: {
				type: 'string',
				description: 'item',
			},
		});
	});
});

describe('Tuple', () => {
	it('should be a function', () => {
		assert(typeof t.Tuple === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/array#tupleValidation
	it('should be JSON schema', () => {
		assertEquals(t.Tuple(), {
			type: 'array',
			prefixItems: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.Tuple([], {
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'array',
			prefixItems: [],
			description: 'hello',
			deprecated: true,
		});
	});

	it('should build "prefixItems" property', () => {
		let output = t.Tuple([
			t.String(),
			t.Boolean(),
		], {
			description: 'pair',
			default: ['foo', true],
		});

		assertEquals(output, {
			type: 'array',
			description: 'pair',
			default: ['foo', true],
			prefixItems: [
				{ type: 'string' },
				{ type: 'boolean' },
			],
		});
	});
});

describe('Object', () => {
	it('should be a function', () => {
		assert(typeof t.Object === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		assertEquals(t.Object(), {
			type: 'object',
		});
	});

	it('should allow annotations', () => {
		let output = t.Object(undefined, {
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			type: 'object',
			properties: undefined,
			description: 'hello',
			deprecated: true,
		});
	});

	it('should build "properties" property', () => {
		let output = t.Object({
			name: t.String(),
			age: t.Integer(),
		}, {
			description: 'person',
			additionalProperties: false,
			examples: [{
				name: 'lukeed',
				age: 123,
			}],
			default: {
				name: 'user',
				age: 18,
			},
		});

		assertEquals(output, {
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			additionalProperties: false,
			required: ['name', 'age'],
			description: 'person',
			examples: [{
				name: 'lukeed',
				age: 123,
			}],
			default: {
				name: 'user',
				age: 18,
			},
		});
	});

	it('should respect "required" if provided', () => {
		let output = t.Object({
			name: t.String(),
			age: t.Integer(),
		}, {
			required: ['name'],
		});

		assertEquals(output, {
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			required: ['name'], // <<
		});
	});

	it('should build "required" from non-Optionals', () => {
		let output = t.Object({
			name: t.String(),
			age: t.Optional(t.Integer()),
		});

		assertEquals(output, {
			type: 'object',
			properties: {
				name: { type: 'string' },
				// @ts-expect-error; wants OPTIONAL
				age: { type: 'integer' },
			},
			required: ['name'], // <<
		});
	});
});

// ---

describe('Readonly', () => {
	it('should be a function', () => {
		assert(typeof t.Readonly === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		let output = t.Readonly(
			t.String(),
		);

		assertEquals(output, {
			type: 'string',
			readOnly: true,
		});
	});
});
