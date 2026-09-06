import tailwindcss from '@tailwindcss/postcss';
import { nitro } from 'nitro/vite';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  environments: {
    rsc: { resolve: { noExternal: true } },
    ssr: { resolve: { noExternal: true } },
  },
  plugins: [
    vinext(),
    nitro({ preset: 'netlify', output: { publicDir: '.netlify/static' } }),
    {
      name: 'sbuddy:netlify-bundle',
      nitro: {
        setup(nitro) {
          // Server packages are bundled above; do not ship Vinext's optional
          // framework-wide dependency list (including Windows-only binaries).
          nitro.options.traceDeps = [];
        },
      },
    },
  ],
});
