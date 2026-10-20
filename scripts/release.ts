// bun run release <version>

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const version = process.argv[2];
if (!version) throw new Error('Missing <version> value!');

let input = resolve('package.json');
let content = await readFile(input, 'utf8');

let config = JSON.parse(content);
config.version = version;

async function run(label: string, args: string[]) {
	let c = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' });
	if ((await c.exited) !== 0) throw new Error(`Failed: ${label}`);
}

content = JSON.stringify(config, null, '\t') + '\n';
await writeFile(input, content);

// prevent CI error
await run('oxfmt', ['bunx', 'oxfmt', input]);

await run('git add', ['git', 'add', input]);

await run('git commit', ['git', 'commit', '-m', `v${version}`]);

await run('git tag', ['git', 'tag', `v${version}`]);

await run('git push', ['git', 'push', 'origin', 'main', '--tags']);
