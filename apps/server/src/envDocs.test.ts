import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnvDocs } from './envDocs';

// Гейт «Генерация» (контракт env-schema.md): ENV.md и .env*.example производятся
// из схемы, не пишутся руками. Тест сравнивает рендер с закоммиченными файлами —
// разошлись ⇒ красный CI ⇒ `npm run env:docs` и закоммитить.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('генерация ENV.md и .env*.example', () => {
  const files = renderEnvDocs();

  it('генерирует ENV.md + все example-файлы', () => {
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      'ENV.md',
      'apps/server/.env.example',
      'apps/web/.env.example',
      'deploy/.env.example',
    ]);
  });

  it('рендер детерминирован', () => {
    expect(renderEnvDocs()).toEqual(renderEnvDocs());
  });

  it('секрет рендерится как NAME= с SOPS-комментарием, значение секрета не появляется', () => {
    const server = files.find((f) => f.path === 'apps/server/.env.example')!.content;
    expect(server).toMatch(/# secret — значение в SOPS\/age-контуре, см\. b2c-ops-hardening item 3\nOFFICE_OPERATOR_PASSWORD=\n/);
    expect(server).toMatch(/\nTRADING_LAB_READ_TOKEN=\n/);
  });

  it('переменная с дефолтом рендерится как NAME=default', () => {
    const server = files.find((f) => f.path === 'apps/server/.env.example')!.content;
    expect(server).toContain('\nOFFICE_SERVER_PORT=8787\n');
    expect(server).toContain('\nOFFICE_CORS_ORIGIN=http://localhost:5174\n');
  });

  it('web-example содержит только VITE_* переменные', () => {
    const web = files.find((f) => f.path === 'apps/web/.env.example')!.content;
    const names = [...web.matchAll(/^#? ?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? '');
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.startsWith('VITE_'), n).toBe(true);
  });

  it('ENV.md содержит таблицу со всеми переменными схемы', () => {
    const envMd = files.find((f) => f.path === 'ENV.md')!.content;
    for (const name of ['OFFICE_SERVER_PORT', 'OFFICE_OPERATOR_PASSWORD', 'VITE_OFFICE_MODE', 'ULPC_DIR', 'OFFICE_IMAGE_TAG']) {
      expect(envMd).toContain(name);
    }
    expect(envMd).toMatch(/сгенерирован/i); // маркер «не править руками»
  });

  it('закоммиченные артефакты совпадают с рендером (дрейф-гейт)', () => {
    for (const f of renderEnvDocs()) {
      const onDisk = readFileSync(join(REPO_ROOT, f.path), 'utf8');
      expect(onDisk, `${f.path} разошёлся со схемой — запусти npm run env:docs`).toBe(f.content);
    }
  });
});
