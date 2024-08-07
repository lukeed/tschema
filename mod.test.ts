import { assert, assertEquals } from 'jsr:@std/assert';
import { describe, it } from 'jsr:@std/testing/bdd';
import * as t from './mod.ts';

// TODO: remove [OPTIONAL] key (making it `?: true` breaks Object property infer)

describe('Null', () => {
	it('should be a function', () => {
		assert(typeof t.null === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/null
	it('should be JSON schema', () => {
		assertEquals(t.null(), {
			type: 'null',
		});
	});

	it('should allow annotations', () => {
		let output = t.null({
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
		let output = t.null({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'null',
		});
	});
});

describe('Constant', () => {
	it('should be a function', () => {
		assert(typeof t.constant === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/const
	it('should be JSON schema', () => {
		assertEquals(t.constant('hello'), {
			const: 'hello',
		});
	});

	it('should allow annotations', () => {
		let output = t.constant(123, {
			deprecated: true,
			description: 'hello',
		});

		assertEquals(output, {
			const: 123,
			deprecated: true,
			description: 'hello',
		});
	});
});

describe('Boolean', () => {
	it('should be a function', () => {
		assert(typeof t.boolean === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/boolean
	it('should be JSON schema', () => {
		assertEquals(t.boolean(), {
			type: 'boolean',
		});
	});

	it('should allow annotations', () => {
		let output = t.boolean({
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
		let output = t.boolean({
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
		assert(typeof t.string === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/string
	it('should be JSON schema', () => {
		assertEquals(t.string(), {
			type: 'string',
		});
	});

	it('should allow annotations', () => {
		let output = t.string({
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
		let output = t.string({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'string',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.string({
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
		assert(typeof t.integer === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		assertEquals(t.integer(), {
			type: 'integer',
		});
	});

	it('should allow annotations', () => {
		let output = t.integer({
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
		let output = t.integer({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'integer',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.integer({
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
		assert(typeof t.number === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		assertEquals(t.number(), {
			type: 'number',
		});
	});

	it('should allow annotations', () => {
		let output = t.number({
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
		let output = t.number({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		assertEquals(output, {
			type: 'number',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.number({
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
		assert(typeof t.enum === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/enum
	it('should be JSON schema', () => {
		assertEquals(t.enum([]), {
			enum: [],
		});
	});

	it('should allow annotations', () => {
		let output = t.enum(['foo', 123], {
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
		assert(typeof t.array === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/array
	it('should be JSON schema', () => {
		assertEquals(t.array(), {
			type: 'array',
			items: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.array(undefined, {
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
		let output = t.array(
			t.string({
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
		assert(typeof t.tuple === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/array#tupleValidation
	it('should be JSON schema', () => {
		assertEquals(t.tuple(), {
			type: 'array',
			prefixItems: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.tuple([], {
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
		let output = t.tuple([
			t.string(),
			t.boolean(),
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
		assert(typeof t.object === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		assertEquals(t.object(), {
			type: 'object',
			properties: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.object(undefined, {
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

	describe('additionalProperties', () => {
		it('should NOT be added for object w/o properties', () => {
			let output = t.object();

			assertEquals(output, {
				type: 'object',
				properties: undefined,
			});
		});

		it('should be added for object w/ defined properties', () => {
			let output = t.object({
				name: t.string(),
			});

			assertEquals(output, {
				type: 'object',
				additionalProperties: false, // <<
				required: ['name'],
				properties: {
					name: {
						type: 'string',
					},
				},
			});
		});

		it('should allow override via options', () => {
			let output = t.object({
				name: t.string(),
			}, {
				additionalProperties: true,
			});

			assertEquals(output, {
				type: 'object',
				additionalProperties: true, // <<
				required: ['name'],
				properties: {
					name: {
						type: 'string',
					},
				},
			});
		});
	});

	it('should build "properties" property', () => {
		let output = t.object({
			name: t.string(),
			age: t.integer(),
		}, {
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
		let output = t.object({
			name: t.string(),
			age: t.integer(),
		}, {
			required: ['name'],
		});

		assertEquals(output, {
			type: 'object',
			additionalProperties: false,
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			required: ['name'], // <<
		});
	});

	it('should build "required" from non-Optionals', () => {
		let output = t.object({
			name: t.string(),
			age: t.optional(t.integer()),
		});

		// NOTE: age has OPTIONAL symbol
		// This is dropped natively in JSON
		let copy = JSON.parse(
			JSON.stringify(output),
		);

		assertEquals(copy, {
			type: 'object',
			additionalProperties: false,
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			required: ['name'], // <<
		});
	});

	it('should default "additionalProperties" to false', () => {
		let output = t.object();
		type X = t.Infer<typeof output>;
	});
});

// ---

describe('Readonly', () => {
	it('should be a function', () => {
		assert(typeof t.readonly === 'function');
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		let output = t.readonly(
			t.string(),
		);

		assertEquals(output, {
			type: 'string',
			readOnly: true,
		});
	});
});

// ---

describe('t.not', () => {
	it('should be a function', () => {
		assert(typeof t.not === 'function');
	});

	it('should be JSON schema', () => {
		let output = t.not(
			t.string(),
		);

		assertEquals(output, {
			not: {
				type: 'string',
			},
		});
	});
});

describe('t.one', () => {
	it('should be a function', () => {
		assert(typeof t.one === 'function');
	});

	it('should be JSON schema', () => {
		let output = t.one(
			t.number({ multipleOf: 5 }),
			t.number({ multipleOf: 3 }),
		);

		assertEquals(output, {
			oneOf: [
				{
					type: 'number',
					multipleOf: 5,
				},
				{
					type: 'number',
					multipleOf: 3,
				},
			],
		});
	});
});

describe('t.any', () => {
	it('should be a function', () => {
		assert(typeof t.any === 'function');
	});

	it('should be JSON schema', () => {
		let output = t.any(
			t.string({ maxLength: 5 }),
			t.number({ minimum: 0 }),
		);

		assertEquals(output, {
			anyOf: [
				{
					type: 'string',
					maxLength: 5,
				},
				{
					type: 'number',
					minimum: 0,
				},
			],
		});
	});
});

describe('t.all', () => {
	it('should be a function', () => {
		assert(typeof t.all === 'function');
	});

	it('should be JSON schema', () => {
		let output = t.all(
			t.number({ maximum: 5 }),
			t.number({ minimum: 0 }),
		);

		assertEquals(output, {
			allOf: [
				{
					type: 'number',
					maximum: 5,
				},
				{
					type: 'number',
					minimum: 0,
				},
			],
		});
	});
});
