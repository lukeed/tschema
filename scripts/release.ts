// deno task release <version>

import { assert } from 'jsr:@std/assert@^1.0';
import { resolve } from 'jsr:@std/path@^1.0';

const version = Deno.args[0];
assert(version, 'Missing <version> value!');

let input = resolve('deno.json');
let content = await Deno.readTextFile(input);

let config = JSON.parse(content);
config.version = version;

async function run(label: string, options: Deno.CommandOptions) {
	let bin = (options.args || []).shift();
	let c = bin && await new Deno.Command(bin, options).output();
	if (c) assert(c.code === 0, label);
}

content = JSON.stringify(config, null, 2);
await Deno.writeTextFile(input, content);

// prevent CI error
await run('deno fmt', {
	args: ['deno', 'fmt', input],
});

await run('git add', {
	args: ['git', 'add', input],
});

await run('git commit', {
	args: ['git', 'commit', '-m', `v${version}`],
});

await run('git tag', {
	args: ['git', 'tag', `v${version}`],
});

await run('git push', {
	args: ['git', 'push', 'origin', 'main', '--tags'],
});
