import { runCordisExercise } from './cordis-exercise.mjs'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'

// An isolated Cordis mechanism experiment; no DSH application or model is launched.
const checkout = process.argv[2]
assert.ok(checkout, 'Usage: node cordis-demo.mjs /path/to/pinned/deepseek-harness')
const sourceRoot = resolve(checkout)
const revision = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.equal(revision, '38a6a5c965aa99ab525161efb7cc5cf1fe62fced', 'Use the pinned DSH checkout')
execFileSync('git', ['-C', sourceRoot, 'diff', '--quiet', 'HEAD', '--', 'vendor/cordis', 'vendor/cosmokit'])
const bundle = await build({
  entryPoints: [resolve(sourceRoot, 'vendor/cordis/src/index.ts')],
  alias: {
    '@deepseek-ai/cosmokit': resolve(sourceRoot, 'vendor/cosmokit/src/index.ts'),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
})
const { Context, Service, FiberState } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)
await runCordisExercise({ Context, Service, FiberState })
