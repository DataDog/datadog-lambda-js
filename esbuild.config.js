const esbuild = require('esbuild');

const buildESM = esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.esm.js',
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  minify: true,

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
  
}).catch((error) => {
  console.error('CJS build failed:', error);
  process.exit(1);
});

Promise.all([buildESM, buildCJS]).then(() => {
  console.log('Builds completed successfully.');
});
