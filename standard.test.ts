import { describe, expect, it } from 'bun:test';
import * as t from './mod';
import * as std from './standard';

import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

const User = t.object({
	name: t.string({ minLength: 2 }),
	tags: t.array(t.string()),
	meta: t.optional(t.dict(t.integer())),
});

describe('schema', () => {
	it('should implement the Standard Schema and Standard JSON Schema types', () => {
		let user = std.schema(User);
		let schema: StandardSchemaV1<t.Infer<typeof User>> = user;
		let json: StandardJSONSchemaV1<t.Infer<typeof User>> = user;
		let output: StandardSchemaV1.InferOutput<typeof user> = { name: 'lukeed', tags: [] };
		expect(schema['~standard'].version).toBe(1);
		expect(json['~standard'].vendor).toBe('tschema');
		expect(output.name).toBe('lukeed');
	});

	it('should return the value when valid', () => {
		let input = { name: 'lukeed', tags: ['a'] };
		let result = std.schema(User)['~standard'].validate(input);
		expect(result).toStrictEqual({ value: input });
	});

	it('should return all issues with their paths', () => {
		let result = std.schema(User)['~standard'].validate({ name: 'x', tags: ['a', 1] });
		expect(result).toStrictEqual({
			issues: [
				{ message: 'must NOT have fewer than 2 characters', path: ['name'] },
				{ message: 'must be string', path: ['tags', '1'] },
			],
		});
	});

	it('should return an empty path for the root', () => {
		let result = std.schema(User)['~standard'].validate('x');
		expect(result).toStrictEqual({ issues: [{ message: 'must be object', path: [] }] });
	});

	it('should decode escaped keys in paths', () => {
		let schema = std.schema(t.object({ 'a/b~c': t.integer() }));
		let result = schema['~standard'].validate({ 'a/b~c': 'x' });
		expect(result).toStrictEqual({ issues: [{ message: 'must be integer', path: ['a/b~c'] }] });
	});

	it('should convert to the draft-2020-12 schema', () => {
		let { jsonSchema } = std.schema(User)['~standard'];
		let json = JSON.parse(JSON.stringify(User));
		expect(jsonSchema.input({ target: 'draft-2020-12' })).toStrictEqual(json);
		expect(jsonSchema.output({ target: 'draft-2020-12' })).toStrictEqual(json);
	});

	it('should throw for other targets', () => {
		let { jsonSchema } = std.schema(User)['~standard'];
		expect(() => jsonSchema.input({ target: 'draft-07' })).toThrow(
			'Unsupported JSON Schema target: "draft-07"',
		);
		expect(() => jsonSchema.output({ target: 'openapi-3.0' })).toThrow(
			'Unsupported JSON Schema target: "openapi-3.0"',
		);
	});

	it('should hold a frozen copy of the schema', () => {
		let name = t.string();
		let input = t.object({ name });
		let schema = std.schema(input);
		let json = schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' });
		expect(json).not.toBe(input);
		expect(Object.isFrozen(json)).toBe(true);
		expect(Object.isFrozen(json.properties)).toBe(true);
		expect(Object.isFrozen(input)).toBe(false);
		name.minLength = 5;
		expect(schema['~standard'].validate({ name: 'x' })).toStrictEqual({ value: { name: 'x' } });
	});
});

describe('compiled', () => {
	it('should use the given validator', () => {
		let calls: unknown[] = [];
		let schema = std.compiled<string>(t.string(), (value) => {
			calls.push(value);
			return value === 'ok'
				? { ok: true, value }
				: { ok: false, errors: [{ instanceLocation: '', keywordLocation: '', error: 'nope' }] };
		});
		expect(schema['~standard'].validate('ok')).toStrictEqual({ value: 'ok' });
		expect(schema['~standard'].validate('x')).toStrictEqual({
			issues: [{ message: 'nope', path: [] }],
		});
		expect(calls).toStrictEqual(['ok', 'x']);
	});
});
