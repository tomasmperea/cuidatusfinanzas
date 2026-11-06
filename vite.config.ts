import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Sirve los fixtures (fuera del repo) SOLO en `vite dev`. No existe en el build.
function fixtures(): Plugin {
  const dir = resolve(import.meta.dirname, '../fixtures');
  return {
    name: 'ctf-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixtures', (req, res) => {
        const f = resolve(dir, (req.url || '').replace(/^\//, '').replace(/[^a-z_.]/g, ''));
        if (!f.startsWith(dir) || !existsSync(f)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(f));
      });
    },
  };
}

export default defineConfig({
  base: '/cuidatusfinanzas/',
  plugins: [fixtures()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts'] },
} as any);
