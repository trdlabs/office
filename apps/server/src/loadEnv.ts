// Side-effect module: load a local `.env` (relative to the server's working dir,
// i.e. apps/server/.env) into process.env BEFORE any config is read. Imported
// first in index.ts so it runs ahead of loadConfig().
//
// Uses Node's built-in env-file loader (Node >= 20.12) — no dependency. It is a
// no-op when the file is absent (Docker / CI), and it does NOT overwrite
// variables already present in the environment, so an ambient value or a
// `docker run -e ...` always wins over the file.
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env present, or an unsupported runtime — rely on the ambient environment */
}
