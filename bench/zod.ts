import * as z from 'zod';
import * as zm from 'zod/mini';

/**
 * The bench `User` schema, built with Zod.
 */
export function full() {
	return z.strictObject({
		uid: z.int(),
		name: z.string().min(1).max(64),
		email: z.email(),
		isActive: z.boolean(),
		avatar: z.optional(z.url()),
		achievements: z.tuple([z.number().min(0), z.enum(['novice', 'pro', 'expert', 'master'])]),
		interests: z.array(z.string().min(4).max(36)),
		address: z.strictObject({
			street: z.string(),
			city: z.string(),
			zip: z.string().regex(/^\d{5}$/),
		}),
		last_updated: z.int().min(0),
	});
}

/**
 * The bench `User` schema, built with Zod Mini.
 */
export function mini() {
	return zm.strictObject({
		uid: zm.int(),
		name: zm.string().check(zm.minLength(1), zm.maxLength(64)),
		email: zm.email(),
		isActive: zm.boolean(),
		avatar: zm.optional(zm.url()),
		achievements: zm.tuple([
			zm.number().check(zm.gte(0)),
			zm.enum(['novice', 'pro', 'expert', 'master']),
		]),
		interests: zm.array(zm.string().check(zm.minLength(4), zm.maxLength(36))),
		address: zm.strictObject({
			street: zm.string(),
			city: zm.string(),
			zip: zm.string().check(zm.regex(/^\d{5}$/)),
		}),
		last_updated: zm.int().check(zm.gte(0)),
	});
}
