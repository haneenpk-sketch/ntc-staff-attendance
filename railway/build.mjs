import { build } from 'esbuild';
import { resolve } from 'node:path';
const shared={bundle:true,minify:true,jsx:'automatic',nodePaths:[resolve('railway/node_modules'),resolve('node_modules')]};
await build({...shared,entryPoints:['railway/client.tsx'],outdir:'build',define:{'process.env.NODE_ENV':'"production"'}});
await build({...shared,entryPoints:['railway/server.mjs'],outfile:'build/server.mjs',platform:'node',format:'esm',target:'node24',alias:{'cloudflare:workers':resolve('railway/database.mjs')}});
