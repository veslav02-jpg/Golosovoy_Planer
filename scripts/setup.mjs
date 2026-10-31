// Автоустановка планера на свой аккаунт Cloudflare:
//   npx wrangler login   (один раз, откроет браузер)
//   npm run setup
// Скрипт: находит/создаёт базу D1, вписывает её ID в wrangler.toml,
// спрашивает BOT_TOKEN и кладёт секреты, собирает и деплоит.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';

const shell = process.platform === 'win32';
const tomlPath = path.join(process.cwd(), 'wrangler.toml');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function run(cmd, args, { capture = false, input } = {}) {
  const r = spawnSync(cmd, args, {
    shell,
    encoding: 'utf8',
    ...(capture
      ? { stdio: ['ignore', 'pipe', 'pipe'] }
      : input !== undefined
        ? { input, stdio: ['pipe', 'inherit', 'inherit'] }
        : {}),
  });
  return { ok: r.status === 0, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

function extractJsonArray(text) {
  const a = text.indexOf('[');
  const b = text.lastIndexOf(']');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

async function main() {
  console.log('\n=== Установка планера на ваш Cloudflare ===\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // 1. Авторизация wrangler
  const who = run('npx', ['wrangler', 'whoami'], { capture: true });
  if (!who.ok || !/logged in/i.test(`${who.stdout}${who.stderr}`)) {
    console.log('Wrangler ещё не авторизован. Выполните:\n\n  npx wrangler login\n\n(откроется браузер), затем снова запустите:  npm run setup\n');
    process.exit(1);
  }
  console.log('✓ Wrangler авторизован\n');

  // 2. База D1: берём существующую planner или создаём новую
  let toml = readFileSync(tomlPath, 'utf8');
  const listed = run('npx', ['wrangler', 'd1', 'list', '--json'], { capture: true });
  const dbs = extractJsonArray(listed.stdout) || [];
  let db = dbs.find((d) => d.name === 'planner');

  if (db) {
    console.log(`✓ База D1 «planner» уже существует (${db.uuid})\n`);
  } else {
    console.log('Создаю базу D1 «planner»…');
    const created = run('npx', ['wrangler', 'd1', 'create', 'planner'], { capture: true });
    const id = UUID.exec(`${created.stdout}\n${created.stderr}`)?.[0];
    if (!id) {
      console.error('Не удалось создать базу или найти в ответе database_id:\n' + created.stdout + created.stderr);
      process.exit(1);
    }
    db = { uuid: id };
    console.log(`✓ База создана: ${id}\n`);
  }

  // Вписываем ID в wrangler.toml (если отличается)
  const current = /database_id\s*=\s*"([^"]*)"/.exec(toml)?.[1];
  if (current !== db.uuid) {
    toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${db.uuid}"`);
    writeFileSync(tomlPath, toml);
    console.log(`✓ database_id вписан в wrangler.toml${existsSync(path.join(process.cwd(), '.git')) ? ' (закоммитьте изменение и запушьте, если деплоите через Workers Builds)' : ''}\n`);
  }

  // 3. Секреты
  const token = (await rl.question('BOT_TOKEN от @BotFather (Enter — пропустить): ')).trim();
  if (token) {
    const r = run('npx', ['wrangler', 'secret', 'put', 'BOT_TOKEN'], { input: `${token}\n` });
    console.log(r.ok ? '✓ BOT_TOKEN сохранён как Secret\n' : '⚠ Не получилось сохранить BOT_TOKEN — добавьте вручную в дашборде\n');
  } else {
    console.log('— BOT_TOKEN пропущен (бот работать не будет, добавите позже)\n');
  }

  const wantService = (await rl.question('Сгенерировать SERVICE_KEY для внешних автоматизаций? (y/N): ')).trim().toLowerCase();
  if (wantService === 'y' || wantService === 'д') {
    const key = randomBytes(24).toString('base64url');
    const r = run('npx', ['wrangler', 'secret', 'put', 'SERVICE_KEY'], { input: `${key}\n` });
    if (r.ok) {
      console.log(`✓ SERVICE_KEY сохранён. Сохраните его себе — он больше не показывается:\n\n  ${key}\n`);
    } else {
      console.log('⚠ Не получилось сохранить SERVICE_KEY — добавьте вручную\n');
    }
  }

  // 4. Сборка и деплой
  console.log('Собираю фронтенд…');
  const build = run('npm', ['run', 'build']);
  if (!build.ok) {
    console.error('Сборка не удалась — проверьте вывод выше.');
    process.exit(1);
  }
  console.log('Деплою Worker…\n');
  const deploy = run('npx', ['wrangler', 'deploy']);
  if (!deploy.ok) {
    console.error('Деплой не удался — проверьте вывод выше.');
    process.exit(1);
  }

  console.log('\n=== Готово! ===');
  console.log('1. Откройте адрес Worker (напечатан выше) /api/health → должно быть {"ok":true}');
  console.log('2. Откройте планер из чата с ботом в Telegram (кнопка меню) — он сам вас авторизует');
  console.log('3. Настройки → Telegram-бот → «Подключить бота к планеру» (вебхук и кнопка меню)');
  console.log('4. Notion (по желанию): Настройки → Notion → секрет интеграции и ссылка на страницу\n');
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
