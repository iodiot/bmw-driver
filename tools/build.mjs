import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('vendor/', output), { recursive: true });
const application = await build({
  absWorkingDir: root,
  entryPoints: ['public/viewer.js'],
  bundle: true,
  external: ['three', 'three/addons/*'],
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  write: false,
});
const obfuscated = JavaScriptObfuscator.obfuscate(application.outputFiles[0].text, {
  target: 'browser',
  seed: 5317,
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  // Runtime Base64 decoding in numeric/rendering loops overwhelms frame time.
  // Keep renamed identifiers and string indirection without encoding helpers.
  stringArrayEncoding: [],
  stringArrayThreshold: 0.7,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  sourceMap: false,
}).getObfuscatedCode();
await writeFile(new URL('demo.js', output), obfuscated + '\n');

// Bundle public third-party modules separately so obfuscation does not penalize
// the rendering library's hot paths. No application sources or source maps ship.
await build({
  absWorkingDir: root,
  entryPoints: {
    three: 'node_modules/three/build/three.module.js',
    OrbitControls: 'node_modules/three/examples/jsm/controls/OrbitControls.js',
    GLTFLoader: 'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
  },
  bundle: true,
  external: ['three'],
  format: 'esm',
  splitting: true,
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  outdir: fileURLToPath(new URL('vendor/', output)),
});
await cp(new URL('../public/assets/', import.meta.url), new URL('assets/', output), {
  recursive: true,
});
await cp(new URL('../public/interface.css', import.meta.url), new URL('interface.css', output));
await cp(
  new URL('../node_modules/three/LICENSE', import.meta.url),
  new URL('THIRD-PARTY-LICENSES.txt', output)
);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const imports = {
  three: './vendor/three.js',
  'three/addons/controls/OrbitControls.js': './vendor/OrbitControls.js',
  'three/addons/loaders/GLTFLoader.js': './vendor/GLTFLoader.js',
};
html = html.replace(
  /<script type="importmap">[\s\S]*?<\/script>/,
  `<script type="importmap">${JSON.stringify({ imports })}</script>`
);
// The revision on the stylesheet and script, so a new page never pairs
// with the previous build's files from the browser's cache.
const version = revision.slice(0, 7);
html = html.replace('src="./viewer.js"', `src="./demo.js?v=${version}"`);
html = html.replace('href="./interface.css"', `href="./interface.css?v=${version}"`);
html = html.replace(
  /[ \t]*<\/body>/,
  `
  <a class="credits" href="./assets/ATTRIBUTION.md" target="_blank" rel="noopener"
     aria-label="Model credits and license" style="position:fixed;bottom:5px;right:10px;color:#9aa8b8;font:10px system-ui;opacity:.7">Model credits</a>
</body>`
);
await writeFile(new URL('index.html', output), html);
await writeFile(
  new URL('build.json', output),
  JSON.stringify({
    project: 'BMW M5 F10',
    sourceRevision: revision,
    applicationObfuscated: true,
    sourceMaps: false,
  }) + '\n'
);
console.log(
  'Static demo built in dist/ with obfuscated application code and local vendor modules.'
);
