import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import * as t from '../mod.ts';
import * as v from '../validate.ts';

const User = t.object({
	uid: t.integer(),
	name: t.string({ minLength: 1, maxLength: 64 }),
	email: t.string({ format: 'email' }),
	isActive: t.boolean(),
	avatar: t.optional(t.string({ format: 'uri' })),
	achievements: t.tuple([
		t.number({ minimum: 0 }),
		t.enum(['novice', 'pro', 'expert', 'master']),
	]),
	interests: t.array(t.string({ minLength: 4, maxLength: 36 })),
	address: t.object({
		street: t.string(),
		city: t.string(),
		zip: t.string({ pattern: '^\\d{5}$' }),
	}),
	last_updated: t.integer({ minimum: 0 }),
});

const VALID = {
	uid: 123,
	name: 'Alex Johnson',
	email: 'alex@example.com',
	isActive: true,
	avatar: 'https://example.com/a.png',
	achievements: [42, 'pro'],
	interests: ['music', 'hiking', 'coding'],
	address: { street: '1 Main St', city: 'Springfield', zip: '12345' },
	last_updated: 1722642982,
};

const INVALID = {
	...VALID,
	name: '',
	email: 'nope',
	achievements: [-1, 'god'],
	address: { street: 1, city: 'Springfield', zip: 'abc' },
};

const ajv = new Ajv({ allErrors: true });
const ajvFirst = new Ajv();
addFormats.default(ajv);
addFormats.default(ajvFirst);

const all = ajv.compile(User);
const first = ajvFirst.compile(User);

for (let [label, input] of [['valid', VALID], ['invalid', INVALID]] as const) {
	Deno.bench('tschema/validate', { group: `all errors (${label})`, baseline: true }, () => {
		v.validate(User, input);
	});

	Deno.bench('ajv (allErrors)', { group: `all errors (${label})` }, () => {
		all(input);
	});

	Deno.bench('tschema/parse', { group: `first error (${label})`, baseline: true }, () => {
		v.parse(User, input);
	});

	Deno.bench('ajv', { group: `first error (${label})` }, () => {
		first(input);
	});
}

Deno.bench('tschema/validate', { group: 'compile', baseline: true }, () => {
	v.validate({ ...User }, VALID);
});

Deno.bench('ajv', { group: 'compile' }, () => {
	new Ajv().compile({
		...User,
		properties: { ...User.properties, email: { type: 'string' }, avatar: { type: 'string' } },
	});
});
