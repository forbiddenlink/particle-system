import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      exclude: ['**/*.test.ts'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NovaParticles',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['three', /^three\//],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
    sourcemap: true,
    minify: false,
  },
});
