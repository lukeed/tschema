# tschema [![CI](https://github.com/lukeed/tschema/workflows/CI/badge.svg)](https://github.com/lukeed/tschema/actions?query=workflow%3ACI) [![licenses](https://licenses.dev/b/npm/tschema)](https://licenses.dev/npm/tschema)

> A tiny (500b) utility to build and validate [JSON schema](https://json-schema.org/understanding-json-schema/reference) types.

## Install

This package is compatible with all JavaScript runtimes and is available on multiple registries:

- **npm** &mdash; available as [`tschema`](https://www.npmjs.com/package/tschema)
- **JSR** &mdash; available as [`@lukeed/tschema`](https://jsr.io/@lukeed/tschema)

## Usage

```ts
import * as t from 'tschema';

// Define JSON object schema
let User = t.object({
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
}, {
  description: 'a User record',
});

// Infer its TypeScript definition:
// NOTE: names do not have to match~!
type User = t.Infer<typeof User>;
//-> {
//->   uid: number;
//->   name: string;
//->   isActive: boolean;
//->   avatar?: string | undefined;
//->   achievements: [number, "novice" | "pro" | "expert" | "master"];
//->   interests: string[];
//->   last_updated: number;
//-> }

console.log(User);
//-> {
//->   type: "object",
//->   description: "a User record",
//->   additionalProperties: false,
//->   properties: {
//->     uid: {
//->       type: "integer"
//->     },
//->     name: {
//->       type: "string",
//->       description: "full name",
//->       examples: ["Alex Johnson"]
//->     },
//->     isActive: {
//->       type: "boolean"
//->     },
//->     avatar: {
//->       type: "string",
//->       format: "uri"
//->     },
//->     achievements: {
//->       type: "array",
//->       prefixItems: [{
//->         type: "number",
//->         minimum: 0
//->       }, {
//->         enum: ["novice", "pro", "expert", "master"]
//->       }],
//->       minItems: 2,
//->       maxItems: 2
//->     },
//->     interests: {
//->       type: "array",
//->       items: {
//->         type: "string",
//->         minLength: 4,
//->         maxLength: 36
//->       }
//->     },
//->     last_updated: {
//->       type: "integer",
//->       minimum: 0,
//->       examples: [1722642982],
//->       description: "unix seconds"
//->     }
//->   },
//->   required: [
//->     "uid",
//->     "name",
//->     "isActive",
//->     "achievements",
//->     "interests",
//->     "last_updated"
//->   ]
//-> }
```

## Validation

The `tschema/validate` module compiles a schema into a validator function on first use. The validator is cached for each schema object.

```ts
import * as t from 'tschema';
import { assert, parse, validate } from 'tschema/validate';

let User = t.object({
  name: t.string({ minLength: 2 }),
  email: t.string({ format: 'email' }),
  age: t.optional(t.integer({ minimum: 0 })),
});

// Collect all errors
let result = validate(User, input);
if (result.ok) {
  result.value; //-> User
} else {
  result.errors;
  //-> [{
  //->   instanceLocation: "/email",
  //->   keywordLocation: "/properties/email/format",
  //->   error: 'must match format "email"',
  //-> }]
}

// Return the input or `undefined`
// NOTE: Stops at the first error
let user = parse(User, input);

// Throw a `ValidationError` if invalid
// NOTE: Stops at the first error
assert(User, input);
input.name; //-> string
```

Errors use the JSON Schema ["basic" output format](https://json-schema.org/draft/2020-12/json-schema-core#name-basic).

The validator supports these JSON Schema (draft 2020-12) keywords:

- **Any:** `type`, `const`, `enum`, `allOf`, `anyOf`, `oneOf`, `not`, `$ref`, `$defs`, `$id`, `$anchor`
- **Numbers:** `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- **Strings:** `minLength`, `maxLength`, `pattern`, `format`
- **Arrays:** `items`, `prefixItems`, `additionalItems`, `contains`, `minContains`, `maxContains`, `minItems`, `maxItems`, `uniqueItems`
- **Objects:** `properties`, `required`, `additionalProperties`, `patternProperties`, `propertyNames`, `minProperties`, `maxProperties`

All `format` values that `t.string` accepts are checked. Other keywords are ignored.

> [!NOTE]
> The validator uses `new Function` to compile schemas. Use the [compiler plugins](#compiler) if your environment does not allow `eval` (for example, with a strict Content-Security-Policy).

## Compiler

The `tschema/plugins` module has [Vite](https://vite.dev) (v8+) and [Rolldown](https://rolldown.rs) plugins. They compile `validate`, `parse`, and `assert` calls ahead of time, so your bundle does not include the runtime compiler.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { vite as tschema } from 'tschema/plugins';

export default defineConfig({
  plugins: [tschema()],
});
```

```ts
// rolldown.config.ts
import { defineConfig } from 'rolldown';
import { rolldown as tschema } from 'tschema/plugins';

export default defineConfig({
  input: 'src/index.ts',
  plugins: [tschema()],
});
```

The plugin replaces a call only when it knows the schema at build time. A schema is known when it uses only `tschema` builders and literal values. It can be a local `const`, an imported or re-exported `const`, or an inline expression. The plugin reads your code but does not run it.

```ts
import * as t from 'tschema';
import { validate } from 'tschema/validate';
import { User } from './schemas';

validate(User, input); // compiled
validate(t.array(t.string()), input); // compiled

let schema = await fetchSchema();
validate(schema, input); // runtime
```

> [!IMPORTANT]
> Do not change a schema object after you create it. The plugin compiles the schema as it is written.

## API

Please refer to the [generated API documentation](https://jsr.io/@lukeed/tschema/doc), as it's
always kept up-to-date.

> **Note:** The API is the same across all JavaScript runtimes, regardless of [installation](#install) source. Only the package's name changes.

## Benchmarks

Run with [mitata](https://github.com/evanwashere/mitata) on an AMD EPYC 9V45, using Bun 1.4.3 and Node.js 26.12.0. See the [`bench`](/bench) directory.

```sh
bun run bench
```

### Builders

| benchmark | bun | node |
| --- | --- | --- |
| tschema | 162.96 ns | 147.32 ns |
| typebox (1.4) | 1.89 µs | 3.67 µs |
| zod-to-json-schema (zod 3) | 17.41 µs | 20.00 µs |
| zod (4.6) | 36.31 µs | 61.35 µs |
| zod/mini (4.6) | 29.07 µs | 45.52 µs |

### Validation

The `(aot)` rows use the output of the [compiler plugin](#compiler). They run the same generated code, but skip the schema lookup and never compile at runtime.

TypeBox (1.4) compiles the same JSON schema with `typebox/schema`. Its `Check` method is compared with `parse`, and its `Errors` method with `validate`.

Zod (4.6) and Zod Mini use an equivalent schema with `z.strictObject`. Zod has no first-error mode, so its `safeParse` is in both the "all errors" and "first error" groups. Its "compile" row is schema construction plus the first `safeParse` call.

| benchmark | bun | node |
| --- | --- | --- |
| **all errors (valid)** | | |
| tschema/validate | 144.11 ns | 136.39 ns |
| tschema/validate (aot) | 141.66 ns | 137.33 ns |
| ajv (allErrors) | 187.32 ns | 244.93 ns |
| typebox (Errors) | 13.54 µs | 16.90 µs |
| zod (safeParse) | 1.13 µs | 1.20 µs |
| zod/mini (safeParse) | 1.62 µs | 1.86 µs |
| **first error (valid)** | | |
| tschema/parse | 143.86 ns | 142.53 ns |
| tschema/parse (aot) | 136.99 ns | 133.70 ns |
| ajv | 190.55 ns | 230.22 ns |
| typebox (Check) | 254.97 ns | 265.63 ns |
| zod (safeParse) | 1.13 µs | 1.21 µs |
| zod/mini (safeParse) | 1.62 µs | 1.85 µs |
| **all errors (invalid)** | | |
| tschema/validate | 151.26 ns | 125.89 ns |
| tschema/validate (aot) | 147.46 ns | 122.15 ns |
| ajv (allErrors) | 213.27 ns | 207.22 ns |
| typebox (Errors) | 11.12 µs | 16.45 µs |
| zod (safeParse) | 2.06 µs | 3.34 µs |
| zod/mini (safeParse) | 3.14 µs | 4.46 µs |
| **first error (invalid)** | | |
| tschema/parse | 9.38 ns | 7.82 ns |
| tschema/parse (aot) | 4.57 ns | 4.24 ns |
| ajv | 34.71 ns | 49.92 ns |
| typebox (Check) | 101.52 ns | 105.58 ns |
| zod (safeParse) | 2.14 µs | 3.37 µs |
| zod/mini (safeParse) | 3.00 µs | 4.46 µs |
| **compile** | | |
| tschema/validate | 47.54 µs | 36.40 µs |
| tschema/validate (aot) | – | – |
| typebox | 35.53 µs | 38.40 µs |
| zod | 128.73 µs | 105.44 µs |
| zod/mini | 26.36 µs | 47.66 µs |
| ajv | 6.13 ms | 5.58 ms |

The bundle for `bench/aot.ts` (schema, data, and validators, minified) is 4.8 kB gzip with the plugin and 7.9 kB without it.

## License

MIT © [Luke Edwards](https://lukeed.com)
