// `npm run env:docs` — перегенерирует ENV.md и .env*.example из env-схемы.
// Дрейф с закоммиченными файлами ловит envDocs.test.ts (красный CI).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnvDocs } from './envDocs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

for (const file of renderEnvDocs()) {
  writeFileSync(join(REPO_ROOT, file.path), file.content);
  console.error(`env:docs → ${file.path}`);
}
