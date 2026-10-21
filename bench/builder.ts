import { Type } from 'typebox';
import { bench, run, summary } from 'mitata';
import * as z4 from 'zod';
import * as zm from 'zod/mini';
import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as t from '../npm/index.mjs';

summary(() => {
	bench('tschema', () => {
		return t.object({
			uid: t.integer(),
			name: t.string({
				description: 'full name',
				examples: ['Alex Johnson'],
			}),
			isActive: t.boolean(),
			avatar: t.optional(t.string({ format: 'uri' })),
			achievements: t.tuple([
				t.number({ minimum: 0 }), // points
				t.enum(['novice', 'pro', 'expert', 'master']),
			]),
			interests: t.array(
				t.string({
					minLength: 4,
					maxLength: 36,
				}),
			),
			last_updated: t.integer({
				minimum: 0,
				examples: [1722642982],
				description: 'unix seconds',
			}),
		});
	});

	bench('typebox', () => {
		return Type.Object({
			uid: Type.Integer(),
			name: Type.String({
				description: 'full name',
				examples: ['Alex Johnson'],
			}),
			isActive: Type.Boolean(),
			avatar: Type.Optional(Type.String({ format: 'uri' })),
			achievements: Type.Tuple([
				Type.Number({ minimum: 0 }), // points
				// NOTE: different
				// Type.Enum({
				// 	NOVICE: 'novice',
				// 	PRO: 'pro',
				// 	EXPERT: 'expert',
				// 	MASTER: 'master',
				// }),

				// NOTE: equivalent output
				Type.Unsafe<string>({
					enum: ['novice', 'pro', 'expert', 'master'],
				}),
			]),
			interests: Type.Array(
				Type.String({
					minLength: 4,
					maxLength: 36,
				}),
			),
			last_updated: Type.Integer({
				minimum: 0,
				examples: [1722642982],
				description: 'unix seconds',
			}),
		});
	});

	bench('zod-to-json-schema', () => {
		let zod = z.object({
			uid: z.number().int(),
			name: z.string({
				description: 'full name',
			}),
			isActive: z.boolean(),
			avatar: z.optional(z.string().url()),
			achievements: z.tuple([
				z.number().min(0), // points
				z.enum(['novice', 'pro', 'expert', 'master']),
			]),
			interests: z.array(z.string().min(4).max(36)),
			last_updated: z
				.number({
					description: 'unix seconds',
				})
				.int()
				.min(0),
		});

		return zodToJsonSchema(zod);
	});

	bench('zod', () => {
		let zod = z4.object({
			uid: z4.int(),
			name: z4.string().describe('full name'),
			isActive: z4.boolean(),
			avatar: z4.optional(z4.url()),
			achievements: z4.tuple([
				z4.number().min(0), // points
				z4.enum(['novice', 'pro', 'expert', 'master']),
			]),
			interests: z4.array(z4.string().min(4).max(36)),
			last_updated: z4.int().min(0).describe('unix seconds'),
		});

		return z4.toJSONSchema(zod);
	});

	bench('zod/mini', () => {
		let zod = zm.object({
			uid: zm.int(),
			name: zm.string().check(zm.describe('full name')),
			isActive: zm.boolean(),
			avatar: zm.optional(zm.url()),
			achievements: zm.tuple([
				zm.number().check(zm.gte(0)), // points
				zm.enum(['novice', 'pro', 'expert', 'master']),
			]),
			interests: zm.array(zm.string().check(zm.minLength(4), zm.maxLength(36))),
			last_updated: zm.int().check(zm.gte(0), zm.describe('unix seconds')),
		});

		return zm.toJSONSchema(zod);
	});
});

await run();
