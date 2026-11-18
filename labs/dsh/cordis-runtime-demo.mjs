import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { runCordisExercise } from './cordis-exercise.mjs'

const require = createRequire(import.meta.url)
// FiberState is a const enum omitted from the published JS bundle. Compile the
// installed package's shipped source, as the source-checkout exercise does.
const result = await build({
  entryPoints: [require.resolve('@deepseek-ai/cordis/src/index.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'silent',
})
const { Context, Service, FiberState } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
await runCordisExercise({ Context, Service, FiberState }, (message) => {
  console.log(JSON.stringify({ type: 'plugin_event', message }))
})
