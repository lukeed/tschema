import { assert } from 'jsr:@std/assert@^1.0';
import { resolve } from 'jsr:@std/path@^1.0';

const version = Deno.args[0];
assert(version, 'Missing <version> value!');

let input = resolve('deno.json');
let content = await Deno.readTextFile(input);

let config = JSON.parse(content);
config.version = version;

type Options = Parameters<typeof Deno.run>[0];
async function run(label: string, options: Options) {
	// deno-lint-ignore no-deprecated-deno-api
	let p = await Deno.run(options).status();
	assert(p.code === 0, label);
}

content = JSON.stringify(config, null, 2);
await Deno.writeTextFile(input, content);

// prevent CI error
await run('deno fmt', {
	cmd: ['deno', 'fmt', input],
});

await run('git add', {
	cmd: ['git', 'add', input],
});

await run('git commit', {
	cmd: ['git', 'commit', '-m', `v${version}`],
});

await run('git tag', {
	cmd: ['git', 'tag', `v${version}`],
});

await run('git push', {
	cmd: ['git', 'push', 'origin', 'main', '--tags'],
});
