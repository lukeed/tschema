import { describe, expect, it } from 'bun:test';
import * as t from './mod';
import { assert, parse, validate, ValidationError } from './validate';
import * as suite from './scripts/suite';

const User = t.object({
	name: t.string({ minLength: 2 }),
	age: t.optional(t.integer({ minimum: 0 })),
	tags: t.array(t.string(), { uniqueItems: true }),
	role: t.enum(['admin', 'user']),
});

describe('validate', () => {
	it('should return the input when valid', () => {
		let input = { name: 'lukeed', tags: ['a'], role: 'admin' as const };
		let result = validate(User, input);
		expect(result).toStrictEqual({ ok: true, value: input });
		expect(result.ok && result.value === input).toBe(true);
	});

	it('should return all errors', () => {
		let result = validate(User, { name: 'x', age: -1, tags: ['a', 'a', 1], extra: true });
		expect(result).toStrictEqual({
			ok: false,
			errors: [
				{
					instanceLocation: '/name',
					keywordLocation: '/properties/name/minLength',
					error: 'must NOT have fewer than 2 characters',
				},
				{
					instanceLocation: '/age',
					keywordLocation: '/properties/age/minimum',
					error: 'must be >= 0',
				},
				{
					instanceLocation: '/tags/2',
					keywordLocation: '/properties/tags/items/type',
					error: 'must be string',
				},
				{
					instanceLocation: '/tags',
					keywordLocation: '/properties/tags/uniqueItems',
					error: 'must NOT have duplicate items',
				},
				{
					instanceLocation: '',
					keywordLocation: '/required',
					error: 'must have required property "role"',
				},
				{
					instanceLocation: '/extra',
					keywordLocation: '/additionalProperties',
					error: 'is not allowed',
				},
			],
		});
	});

	it('should report the type error only', () => {
		expect(validate(User, [])).toStrictEqual({
			ok: false,
			errors: [
				{
					instanceLocation: '',
					keywordLocation: '/type',
					error: 'must be object',
				},
			],
		});
	});

	it('should escape instance locations', () => {
		let schema = t.dict(t.integer());
		let result = validate(schema, { 'a/b~c': 1.5 });
		expect(result.ok ? [] : result.errors.map((e) => e.instanceLocation)).toStrictEqual([
			'/a~1b~0c',
		]);
	});

	it('should resolve recursive schemas', () => {
		let Tree = t.recursive('Tree', (self) =>
			t.object({
				value: t.string(),
				children: t.array(self),
			}),
		);

		let tree = { value: 'a', children: [{ value: 'b', children: [{ value: 'c', children: [] }] }] };
		expect(validate(Tree, tree).ok).toStrictEqual(true);

		let result = validate(Tree, {
			value: 'a',
			children: [{ value: 'b', children: [{ value: 3, children: [] }] }],
		});
		expect(result).toStrictEqual({
			ok: false,
			errors: [
				{
					instanceLocation: '/children/0/children/0/value',
					keywordLocation:
						'/properties/children/items/$ref/properties/children/items/$ref/properties/value/type',
					error: 'must be string',
				},
			],
		});
	});

	it('should resolve embedded recursive schemas', () => {
		let Tree = t.recursive('Tree', (self) => t.object({ children: t.array(self) }));
		let Forest = t.object({ a: Tree, b: t.array(Tree) });
		expect(
			validate(Forest, { a: { children: [] }, b: [{ children: [{ children: [] }] }] }).ok,
		).toStrictEqual(true);
		expect(validate(Forest, { a: { children: [] }, b: [{ children: [{}] }] }).ok).toStrictEqual(
			false,
		);
	});

	it('should validate compositions', () => {
		let schema = t.object({
			id: t.any(t.string({ format: 'uuid' }), t.integer({ minimum: 1 })),
			kind: t.one(t.constant('a'), t.constant('b')),
			not: t.not(t.null()),
		});

		expect(validate(schema, { id: 1, kind: 'a', not: 0 }).ok).toStrictEqual(true);
		expect(
			validate(schema, { id: '00000000-0000-0000-0000-000000000000', kind: 'b', not: '' }).ok,
		).toStrictEqual(true);

		let result = validate(schema, { id: 'x', kind: 'c', not: null });
		expect(result.ok ? [] : result.errors.map((e) => e.keywordLocation)).toStrictEqual([
			'/properties/id/anyOf',
			'/properties/kind/oneOf',
			'/properties/not/not',
		]);
	});

	it('should treat inherited keys as missing', () => {
		let schema = t.object({ toString: t.string() });
		expect(validate(schema, {}).ok).toStrictEqual(false);
		expect(validate(schema, { toString: 'x' }).ok).toStrictEqual(true);
	});

	it('should throw on unresolved references', () => {
		expect(() => validate({ $ref: '#/$defs/missing' } as t.Type, 1)).toThrow('Unresolved $ref');
	});
});

describe('parse', () => {
	it('should return the input when valid', () => {
		let input = { name: 'lukeed', tags: [], role: 'user' as const };
		expect(parse(User, input)).toStrictEqual(input);
	});

	it('should return undefined when invalid', () => {
		expect(parse(User, { name: 'lukeed', tags: [], role: 'other' })).toStrictEqual(undefined);
		expect(parse(User, null)).toStrictEqual(undefined);
	});
});

describe('assert', () => {
	it('should not throw when valid', () => {
		let input: unknown = { name: 'lukeed', tags: [], role: 'user' };
		assert(User, input);
		expect(input.name).toStrictEqual('lukeed');
	});

	it('should throw the first error', () => {
		let err: unknown;
		try {
			assert(User, { name: 1, tags: 2 });
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ValidationError);
		expect(err).toMatchObject({
			name: 'ValidationError',
			message: '/name must be string',
			instanceLocation: '/name',
			keywordLocation: '/properties/name/type',
		});
	});

	it('should throw for the root value', () => {
		expect(() => assert(User, 'x')).toThrow('must be object');
	});
});

for (let [file, groups] of await suite.load()) {
	describe(file, () => {
		for (let group of groups) {
			for (let test of group.tests) {
				it(`${group.description} :: ${test.description}`, () => {
					let result = validate(group.schema, test.data);
					expect(result.ok).toStrictEqual(test.valid);
					expect(result.ok || result.errors.length > 0).toStrictEqual(true);
					expect(
						parse(group.schema, test.data) !== undefined || test.data === undefined,
					).toStrictEqual(test.valid);
				});
			}
		}
	});
}
