import { describe, expect, it } from 'bun:test';
import * as t from './mod';

// TODO: remove [OPTIONAL] key (making it `?: true` breaks Object property infer)

describe('Null', () => {
	it('should be a function', () => {
		expect(typeof t.null === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/null
	it('should be JSON schema', () => {
		expect(t.null()).toStrictEqual({
			type: 'null',
		});
	});

	it('should allow annotations', () => {
		let output = t.null({
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
			type: 'null',
		});
	});
});

describe('Unknown', () => {
	it('should be a function', () => {
		expect(typeof t.unknown === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/null
	it('should be JSON schema', () => {
		expect(t.unknown()).toStrictEqual({
			// empty
		});
	});

	it('should allow annotations', () => {
		let output = t.unknown({
			deprecated: true,
			description: 'foobar',
		});

		expect(output).toStrictEqual({
			deprecated: true,
			description: 'foobar',
		});
	});

	it('should force "type" property', () => {
		let output = t.null({
			// @ts-expect-error; not in options definition
			type: 'other',
		});

		expect(output).toStrictEqual({
			type: 'null',
		});
	});
});

describe('Constant', () => {
	it('should be a function', () => {
		expect(typeof t.constant === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/const
	it('should be JSON schema', () => {
		expect(t.constant('hello')).toStrictEqual({
			const: 'hello',
		});
	});

	it('should allow annotations', () => {
		let output = t.constant(123, {
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
			const: 123,
			deprecated: true,
			description: 'hello',
		});
	});
});

describe('Boolean', () => {
	it('should be a function', () => {
		expect(typeof t.boolean === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/boolean
	it('should be JSON schema', () => {
		expect(t.boolean()).toStrictEqual({
			type: 'boolean',
		});
	});

	it('should allow annotations', () => {
		let output = t.boolean({
			default: false,
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
			type: 'boolean',
		});
	});
});

describe('String', () => {
	it('should be a function', () => {
		expect(typeof t.string === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/string
	it('should be JSON schema', () => {
		expect(t.string()).toStrictEqual({
			type: 'string',
		});
	});

	it('should allow annotations', () => {
		let output = t.string({
			default: 'foobar',
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
			type: 'string',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.string({
			enum: ['foo', 'bar', 'baz'],
			default: 'baz',
		});

		expect(output).toStrictEqual({
			type: 'string',
			enum: ['foo', 'bar', 'baz'],
			default: 'baz',
		});
	});
});

describe('Integer', () => {
	it('should be a function', () => {
		expect(typeof t.integer === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		expect(t.integer()).toStrictEqual({
			type: 'integer',
		});
	});

	it('should allow annotations', () => {
		let output = t.integer({
			default: 123,
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
			type: 'integer',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.integer({
			enum: [1, 2, 3],
			default: 2,
		});

		expect(output).toStrictEqual({
			type: 'integer',
			enum: [1, 2, 3],
			default: 2,
		});
	});
});

describe('Number', () => {
	it('should be a function', () => {
		expect(typeof t.number === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/numeric
	it('should be JSON schema', () => {
		expect(t.number()).toStrictEqual({
			type: 'number',
		});
	});

	it('should allow annotations', () => {
		let output = t.number({
			default: 123,
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
			type: 'number',
		});
	});

	it('should allow "enum" values', () => {
		let output = t.number({
			enum: [1, 2, 3],
			default: 2,
		});

		expect(output).toStrictEqual({
			type: 'number',
			enum: [1, 2, 3],
			default: 2,
		});
	});
});

describe('Enum', () => {
	it('should be a function', () => {
		expect(typeof t.enum === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/enum
	it('should be JSON schema', () => {
		expect(t.enum([])).toStrictEqual({
			enum: [],
		});
	});

	it('should allow annotations', () => {
		let output = t.enum(['foo', 123], {
			deprecated: true,
			description: 'hello',
			default: 'foo',
		});

		expect(output).toStrictEqual({
			enum: ['foo', 123],
			description: 'hello',
			deprecated: true,
			default: 'foo',
		});
	});
});

describe('Array', () => {
	it('should be a function', () => {
		expect(typeof t.array === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/array
	it('should be JSON schema', () => {
		expect(t.array()).toStrictEqual({
			type: 'array',
			items: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.array(undefined, {
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
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

		expect(output).toStrictEqual({
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
		expect(typeof t.tuple === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/array#tupleValidation
	it('should be JSON schema', () => {
		expect(t.tuple()).toStrictEqual({
			type: 'array',
			prefixItems: undefined,
			minItems: 0,
			maxItems: 0,
		});
	});

	it('should allow annotations', () => {
		let output = t.tuple([], {
			deprecated: true,
			description: 'hello',
			minItems: 0,
			maxItems: 0,
		});

		expect(output).toStrictEqual({
			type: 'array',
			prefixItems: [],
			description: 'hello',
			deprecated: true,
			minItems: 0,
			maxItems: 0,
		});
	});

	it('should build "prefixItems" property', () => {
		let output = t.tuple([t.string(), t.boolean()], {
			description: 'pair',
			default: ['foo', true],
		});

		expect(output).toStrictEqual({
			type: 'array',
			description: 'pair',
			default: ['foo', true],
			prefixItems: [{ type: 'string' }, { type: 'boolean' }],
			minItems: 2,
			maxItems: 2,
		});
	});

	it('should allow `minItems` and `maxItems` override', () => {
		let output = t.tuple([t.string(), t.boolean()], {
			minItems: 1,
			maxItems: 5,
			additionalItems: t.number(),
		});

		expect(output).toStrictEqual({
			type: 'array',
			prefixItems: [{ type: 'string' }, { type: 'boolean' }],
			minItems: 1,
			maxItems: 5,
			additionalItems: {
				type: 'number',
			},
		});
	});
});

describe('Dict', () => {
	it('should be a function', () => {
		expect(typeof t.dict === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		expect(t.dict(t.string())).toStrictEqual({
			type: 'object',
			additionalProperties: {
				type: 'string',
			},
		});
	});

	it('should allow annotations', () => {
		let output = t.dict(t.number(), {
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
			type: 'object',
			deprecated: true,
			description: 'hello',
			additionalProperties: {
				type: 'number',
			},
		});
	});
});

describe('Object', () => {
	it('should be a function', () => {
		expect(typeof t.object === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		expect(t.object()).toStrictEqual({
			type: 'object',
			properties: undefined,
		});
	});

	it('should allow annotations', () => {
		let output = t.object(undefined, {
			deprecated: true,
			description: 'hello',
		});

		expect(output).toStrictEqual({
			type: 'object',
			properties: undefined,
			description: 'hello',
			deprecated: true,
		});
	});

	describe('additionalProperties', () => {
		it('should NOT be added for object w/o properties', () => {
			let output = t.object();

			expect(output).toStrictEqual({
				type: 'object',
				properties: undefined,
			});
		});

		it('should be added for object w/ defined properties', () => {
			let output = t.object({
				name: t.string(),
			});

			expect(output).toStrictEqual({
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
			let output = t.object(
				{
					name: t.string(),
				},
				{
					additionalProperties: true,
				},
			);

			expect(output).toStrictEqual({
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
		let output = t.object(
			{
				name: t.string(),
				age: t.integer(),
			},
			{
				description: 'person',
				examples: [
					{
						name: 'lukeed',
						age: 123,
					},
				],
				default: {
					name: 'user',
					age: 18,
				},
			},
		);

		expect(output).toStrictEqual({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			additionalProperties: false,
			required: ['name', 'age'],
			description: 'person',
			examples: [
				{
					name: 'lukeed',
					age: 123,
				},
			],
			default: {
				name: 'user',
				age: 18,
			},
		});
	});

	it('should respect "required" if provided', () => {
		let output = t.object(
			{
				name: t.string(),
				age: t.integer(),
			},
			{
				required: ['name'],
			},
		);

		expect(output).toStrictEqual({
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
		let copy = JSON.parse(JSON.stringify(output));

		expect(copy).toStrictEqual({
			type: 'object',
			additionalProperties: false,
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			required: ['name'], // <<
		});
	});
});

// ---

describe('Readonly', () => {
	it('should be a function', () => {
		expect(typeof t.readonly === 'function').toBe(true);
	});

	// https://json-schema.org/understanding-json-schema/reference/object
	it('should be JSON schema', () => {
		let output = t.readonly(t.string());

		expect(output).toStrictEqual({
			type: 'string',
			readOnly: true,
		});
	});
});

describe('Partial', () => {
	it('should be a function', () => {
		expect(typeof t.partial === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.partial(
			t.object({
				name: t.string(),
			}),
		);

		expect<unknown>(output).toStrictEqual({
			type: 'object',
			additionalProperties: false,
			properties: {
				name: {
					type: 'string',
				},
			},
		});
	});

	it('should not mutate input', () => {
		let original = t.object({
			name: t.string(),
		});

		expect(original).toStrictEqual({
			type: 'object',
			required: ['name'],
			additionalProperties: false,
			properties: {
				name: {
					type: 'string',
				},
			},
		});

		let _ = t.partial(original);

		expect(original).toStrictEqual({
			type: 'object',
			required: ['name'],
			additionalProperties: false,
			properties: {
				name: {
					type: 'string',
				},
			},
		});
	});
});

// ---

describe('t.not', () => {
	it('should be a function', () => {
		expect(typeof t.not === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.not(t.string());

		expect(output).toStrictEqual({
			not: {
				type: 'string',
			},
		});
	});
});

describe('t.one', () => {
	it('should be a function', () => {
		expect(typeof t.one === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.one(t.number({ multipleOf: 5 }), t.number({ multipleOf: 3 }));

		expect(output).toStrictEqual({
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
		expect(typeof t.any === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.any(t.string({ maxLength: 5 }), t.number({ minimum: 0 }));

		expect(output).toStrictEqual({
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
	it('should accept mixed types', () => {
		let output = t.all(
			t.object({ a: t.string() }, { additionalProperties: true }),
			t.object({ b: t.number() }, { additionalProperties: true }),
		);

		expect(output.allOf.length).toStrictEqual(2);
	});

	it('should be a function', () => {
		expect(typeof t.all === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.all(t.number({ maximum: 5 }), t.number({ minimum: 0 }));

		expect(output).toStrictEqual({
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

describe('t.recursive', () => {
	it('should be a function', () => {
		expect(typeof t.recursive === 'function').toBe(true);
	});

	it('should be JSON schema', () => {
		let output = t.recursive('Tree', (self) =>
			t.object({
				value: t.string(),
				children: t.array(self),
			}),
		);

		expect(output).toStrictEqual({
			$id: 'Tree',
			type: 'object',
			additionalProperties: false,
			required: ['value', 'children'],
			properties: {
				value: { type: 'string' },
				children: {
					type: 'array',
					items: { $ref: 'Tree' },
				},
			},
		});
	});
});
