// Генерация ENV.md и .env*.example из env-схемы (контракт env-schema.md:
// «оба артефакта производятся из схемы, не пишутся руками»).
// Запуск: `npm run env:docs` (envDocsCli.ts); дрейф пинится envDocs.test.ts.

import type { EnvVarSpec } from './env';
import { ENV_SPECS } from './env';

export interface RenderedFile {
  /** repo-относительный путь */
  path: string;
  content: string;
}

const GENERATED_NOTE = 'Файл сгенерирован из apps/server/src/env.ts — не править руками, запусти `npm run env:docs`.';
const SECRET_COMMENT = '# secret — значение в SOPS/age-контуре, см. b2c-ops-hardening item 3';

const byName = new Map(ENV_SPECS.map((s) => [s.name, s]));

function specOrThrow(name: string): EnvVarSpec {
  const s = byName.get(name);
  if (!s) throw new Error(`env:docs: переменная ${name} не объявлена в ENV_SPECS`);
  return s;
}

interface ExampleVarOptions {
  /** не подставлять дефолт (например, когда дефолт даёт compose/другой контур) */
  omitDefault?: boolean;
  /** дополнительная строка-комментарий после описания */
  note?: string;
}

function renderExampleVar(spec: EnvVarSpec, opts: ExampleVarOptions = {}): string {
  const lines: string[] = [`# ${spec.description}`];
  if (spec.type === 'enum' && spec.enum_values) lines.push(`# Допустимо: ${spec.enum_values.join(' | ')}`);
  if (opts.note) lines.push(`# ${opts.note}`);
  if (spec.secret) {
    lines.push(SECRET_COMMENT);
    lines.push(`${spec.name}=`);
  } else if (spec.default !== null && !opts.omitDefault) {
    lines.push(`${spec.name}=${spec.default}`);
  } else if (spec.required) {
    lines.push(`${spec.name}=`);
  } else {
    lines.push(`# ${spec.name}=`);
  }
  return lines.join('\n');
}

function renderExampleFile(header: string[], entries: Array<[string, ExampleVarOptions?]>): string {
  const blocks = entries.map(([name, opts]) => renderExampleVar(specOrThrow(name), opts));
  return `${header.map((h) => `# ${h}`).join('\n')}\n\n${blocks.join('\n\n')}\n`;
}

function renderEnvMd(): string {
  const rows = [...ENV_SPECS]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((s) => {
      const def = s.default === null ? '—' : `\`${s.default}\``;
      const type = s.type === 'enum' && s.enum_values ? `enum(${s.enum_values.join(' \\| ')})` : s.type;
      const marks = [s.secret ? 'secret' : '', s.flag ? 'flag' : ''].filter(Boolean).join(', ') || '—';
      return `| \`${s.name}\` | ${type} | ${s.required ? 'да' : 'нет'} | ${def} | ${marks} | \`${s.owner_unit}\` | ${s.description} |`;
    });
  return [
    '# ENV — переменные окружения trading-office',
    '',
    `> ${GENERATED_NOTE}`,
    '>',
    '> Источник правды — реестр в \`apps/server/src/env.ts\` (контракт \`env-schema.1\`,',
    '> control-center \`docs/architecture/contracts/env-schema.md\`). Машинный экспорт:',
    '> \`npm run -s env:schema\` (детерминированный JSON в stdout).',
    '',
    '- Серверные переменные (`office-server`) читаются ровно в одной точке — `apps/server/src/env.ts`;',
    '  сервер валидирует env на старте fail-fast и перечисляет все невалидные переменные разом.',
    '- `VITE_*` (`office-web`) читаются на билд-тайме через `import.meta.env` (vite) — объявлены здесь,',
    '  но серверный парсер их не трогает.',
    '- Fail-closed (SEC-O1, #32): в connected-режиме (`OFFICE_CONNECTOR_MODE=trading-lab` и/или',
    '  `OFFICE_PLATFORM_ENABLED=true`) сервер отказывается стартовать без непустого',
    '  `OFFICE_OPERATOR_PASSWORD`. Схема описывает форму переменной; авторитетный гейт живёт в',
    '  `apps/server/src/config.ts`.',
    '- Значения секретов (`secret`) не появляются ни здесь, ни в `.env*.example` — только имя и форма.',
    '',
    '| Имя | Тип | Required | Default | Метки | Owner unit | Описание |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function renderEnvDocs(): RenderedFile[] {
  const serverVars = ENV_SPECS.filter((s) => s.owner_unit === 'office-server').map(
    (s) => [s.name] as [string, ExampleVarOptions?],
  );
  const webVars = ENV_SPECS.filter((s) => s.owner_unit === 'office-web').map(
    (s) => [s.name] as [string, ExampleVarOptions?],
  );

  return [
    { path: 'ENV.md', content: renderEnvMd() },
    {
      path: 'apps/server/.env.example',
      content: renderExampleFile(
        [
          'Скопируй в apps/server/.env — сервер сам подхватит файл на старте (process.loadEnvFile).',
          'Ambient env / `docker run -e ...` всегда важнее файла.',
          GENERATED_NOTE,
        ],
        serverVars,
      ),
    },
    {
      path: 'apps/web/.env.example',
      content: renderExampleFile(
        [
          'Build-time переменные веб-офиса (vite, import.meta.env). Скопируй в apps/web/.env.',
          'Для connected-режима см. закоммиченный apps/web/.env.connected (vite --mode connected).',
          GENERATED_NOTE,
        ],
        webVars,
      ),
    },
    {
      path: 'deploy/.env.example',
      content: renderExampleFile(
        [
          'Скопируй в deploy/.env — docker compose подхватит его сам. deploy/.env не коммитить.',
          GENERATED_NOTE,
        ],
        [
          ['OFFICE_OPERATOR_PASSWORD', { note: 'ОБЯЗАТЕЛЕН для compose-демо: включает auth оператора, compose не стартует без него.' }],
          ['OFFICE_IMAGE_TAG'],
          ['OFFICE_CORS_ORIGIN', { omitDefault: true, note: 'compose по умолчанию подставляет http://localhost:8080 (origin office-web).' }],
        ],
      ),
    },
  ];
}
