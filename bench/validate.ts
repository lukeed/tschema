import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { bench, group, run, summary } from 'mitata';
import * as t from '../npm/index.mjs';
import * as v from '../npm/validate.mjs';

const User = t.object({
	uid: t.integer(),
	name: t.string({ minLength: 1, maxLength: 64 }),
	email: t.string({ format: 'email' }),
	isActive: t.boolean(),
	avatar: t.optional(t.string({ format: 'uri' })),
	achievements: t.tuple([t.number({ minimum: 0 }), t.enum(['novice', 'pro', 'expert', 'master'])]),
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

const ajv = new Ajv2020({ allErrors: true });
const ajvFirst = new Ajv2020();
addFormats(ajv);
addFormats(ajvFirst);

const all = ajv.compile(User);
const first = ajvFirst.compile(User);

for (let i = 0; i < 1e5; i++) {
	for (let input of [VALID, INVALID]) {
		v.validate(User, input);
		v.parse(User, input);
		all(input);
		first(input);
	}
}

for (let [label, input] of [
	['valid', VALID],
	['invalid', INVALID],
] as const) {
	group(`all errors (${label})`, () => {
		summary(() => {
			bench('tschema/validate', () => v.validate(User, input)).baseline();
			bench('ajv (allErrors)', () => all(input));
		});
	});

	group(`first error (${label})`, () => {
		summary(() => {
			bench('tschema/parse', () => v.parse(User, input)).baseline();
			bench('ajv', () => first(input));
		});
	});
}

group('compile', () => {
	summary(() => {
		bench('tschema/validate', () => v.validate({ ...User }, VALID)).baseline();
		bench('ajv', () =>
			new Ajv2020().compile({
				...User,
				properties: { ...User.properties, email: { type: 'string' }, avatar: { type: 'string' } },
			}));
	});
});

await run();
