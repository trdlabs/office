// `npm run env:schema` — печатает документ env-schema.1 в stdout (контракт:
// JSON, 2 пробела, variables по name, завершающий перевод строки; файл в репо
// не коммитится). Агрегатору control-center: вызывать с `npm run -s`.
import { renderEnvSchemaJson } from './env';

process.stdout.write(renderEnvSchemaJson());
