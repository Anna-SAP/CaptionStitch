import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build inlines all JS and CSS into dist/index.html, so the whole app is
// one self-contained file that works from any static host or from file://.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  build: { target: 'es2022', assetsInlineLimit: 100_000_000 },
  server: { host: true },
});
