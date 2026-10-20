import * as t from 'tschema';

export const User = t.object({
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

export const VALID = {
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

export const INVALID = {
	...VALID,
	name: '',
	email: 'nope',
	achievements: [-1, 'god'],
	address: { street: 1, city: 'Springfield', zip: 'abc' },
};
