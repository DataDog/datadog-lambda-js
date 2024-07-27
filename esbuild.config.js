const esbuild = require('esbuild');
const ddPlugin = require('dd-trace/esbuild')

const ddTraceExternals = [
  // esbuild cannot bundle native modules
  '@datadog/native-metrics',

  // required if you use profiling
  '@datadog/pprof',

  // required if you use Datadog security features
  '@datadog/native-appsec',
  '@datadog/native-iast-taint-tracking',
  '@datadog/native-iast-rewriter',

  // required if you encounter graphql errors during the build step
  'graphql/language/visitor',
  'graphql/language/printer',
  'graphql/utilities'
];

const buildESM = esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.esm.js',
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  minify: true,
  plugins: [ddPlugin],
  external: ddTraceExternals,
}).catch((error) => {
  console.error('ESM build failed:', error);
  process.exit(1);
});

const buildCJS = esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs.js',
  format: 'cjs',
  platform: 'node',
  target: 'esnext',
  minify: true,
  plugins: [ddPlugin],
  external: ddTraceExternals,
}).catch((error) => {
  console.error('CJS build failed:', error);
  process.exit(1);
});

Promise.all([buildESM, buildCJS]).then(() => {
  console.log('Builds completed successfully.');
});
