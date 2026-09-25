import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/          (static site, relative paths, host anywhere)
// `npm run build:single` -> dist-single/   (one self-contained index.html)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: single ? 100000000 : 4096,
    },
    server: { host: true },
    preview: { host: true },
  };
});
