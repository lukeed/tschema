import * as t from '../mod.ts';
import { Type } from 'npm:@sinclair/typebox';
import { zodToJsonSchema } from 'npm:zod-to-json-schema';
import { z } from 'npm:zod';
import * as v from 'npm:valibot'

Deno.bench('tschema', { group: 'builder' }, () => {
	let _ = t.object({
		uid: t.integer(),
		name: t.string({
			description: 'full name',
			examples: ['Alex Johnson'],
		}),
		isActive: t.boolean(),
		avatar: t.optional(
			t.string({ format: 'uri' }),
		),
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

Deno.bench('sinclair/typebox', { group: 'builder' }, () => {
	let _ = Type.Object({
		uid: Type.Integer(),
		name: Type.String({
			description: 'full name',
			examples: ['Alex Johnson'],
		}),
		isActive: Type.Boolean(),
		avatar: Type.Optional(
			Type.String({ format: 'uri' }),
		),
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

Deno.bench('zod-to-json-schema', { group: 'builder' }, () => {
	let zod = z.object({
		uid: z.number().int(),
		name: z.string({
			description: 'full name',
		}),
		isActive: z.boolean(),
		avatar: z.optional(
			z.string().url(),
		),
		achievements: z.tuple([
			z.number().min(0), // points
			z.enum(['novice', 'pro', 'expert', 'master']),
		]),
		interests: z.array(
			z.string().min(4).max(36),
		),
		last_updated: z.number({
			description: 'unix seconds',
		}).int().min(0),
	});

	let _ = zodToJsonSchema(zod);
});

Deno.bench('valibot', { group: 'builder' }, () => {
	v.object({
		uid: v.pipe(v.number(), v.integer()),
		name: v.string('full name'),
		isActive: v.boolean(),
		avatar: v.optional(
			v.pipe(v.string(), v.url()),
		),
		achievements: v.tuple([
			v.pipe(v.number(), v.minValue(0)), // points
			v.picklist(['novice', 'pro', 'expert', 'master'] as const),
		]),
		interests: v.array(
			v.pipe(v.string(), v.minLength(4), v.maxLength(36)),
		),
		last_updated: v.pipe(v.number('unix seconds'), v.integer(), v.minValue(0)),
	})
});