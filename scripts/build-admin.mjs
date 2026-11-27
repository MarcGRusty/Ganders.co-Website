import { build, context } from 'esbuild';
const opts = {
  entryPoints: ['admin/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outfile: 'public/admin/app.js',
  logLevel: 'info',
};
if (process.argv.includes('--watch')) (await context(opts)).watch();
else await build(opts);
