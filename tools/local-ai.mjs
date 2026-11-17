import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const help = `Local BMW coding experiments (no cloud fallback, no automatic apply/push)

  node tools/local-ai.mjs status
  node tools/local-ai.mjs --files work/glb_export.py --task "Your change"
  node tools/local-ai.mjs --files file1.py,file2.js --task-file C:/path/task.txt

Requires ignored .local-ai/connection.json with absolute routerRoot and configPath.
The source repository must have a clean committed HEAD. Results stay in a separate worktree.`;

async function main() {
  throw Error('Local models are disabled for BMW at the owner\'s request.');
  if (!args.length || args.includes('--help')) { console.log(help); return; }
  const connection = JSON.parse(await fs.readFile(path.join(root, '.local-ai/connection.json'), 'utf8'));
  for (const key of ['routerRoot', 'configPath']) {
    if (!path.isAbsolute(connection[key] ?? '')) throw Error(`Missing absolute ${key} in local connection`);
  }
  const config = JSON.parse((await fs.readFile(connection.configPath, 'utf8')).replace(/^\uFEFF/, ''));
  const project = config.projects?.['bmw-driver'];
  if (!project || path.resolve(project.repo) !== root || project.cloud !== false) {
    throw Error('bmw-driver must point to this repository with cloud: false');
  }
  const entry = path.join(connection.routerRoot, 'dist/main.js');
  const childArgs = [entry];
  if (args.length === 1 && args[0] === 'status') {
    childArgs.push('status');
  } else {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--files', '--task', '--task-file'].includes(args[i]) || !args[i+1] || options[args[i]]) {
        throw Error('Invalid arguments. Use --help.');
      }
      options[args[i]] = args[i+1];
    }
    if (!options['--files'] || Boolean(options['--task']) === Boolean(options['--task-file'])) {
      throw Error('Provide --files and exactly one of --task / --task-file');
    }
    const task = options['--task'] ?? await fs.readFile(options['--task-file'], 'utf8');
    const files = options['--files'].split(',').map(f => f.trim());
    const request = {project:'bmw-driver', mode:'local', files, task};
    const requests = path.join(config.state, 'requests');
    if (path.relative(root, requests).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(root, requests))) {
      throw Error('Router state must be outside the source repository');
    }
    await fs.mkdir(requests, {recursive:true});
    const requestPath = path.join(requests, `${randomUUID()}.json`);
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2));
    childArgs.push('run', requestPath);
  }
  const child = spawn(process.execPath, childArgs, {
    cwd: connection.routerRoot, shell:false, windowsHide:true, stdio:'inherit',
    env:{...process.env, NODE_OPTIONS:'', HYBRID_ROUTER_CONFIG:connection.configPath},
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = code;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
