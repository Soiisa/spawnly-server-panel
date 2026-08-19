// scripts/i18n-translate.js
//
// Translates missing keys in public/locales/{lang}/*.json against the English
// source files, using a local Ollama model — the same idea as
// scripts/kb-translate.js, but for the dashboard UI strings instead of
// Knowledge Base articles.
//
// DESIGNED TO BE STOPPED AND RESUMED FREELY, JUST LIKE kb-translate.js.
// Every run re-diffs each language's JSON files against the English source to
// find which keys are missing, translates only those, and writes the updated
// file back to disk immediately after each batch (not just at the end) — so a
// Ctrl+C mid-file only loses the batch in flight, not everything done so far.
// Re-run any time (e.g. after adding new strings to public/locales/en/*.json)
// and it'll only translate what's new.
//
// HOW IT WORKS
// For each target language and each *.json file, this flattens both the
// English and the target file into "dot.path.key" -> "string value" pairs,
// diffs them, and sends any missing keys to Ollama in batches (default 40
// keys per call — translating hundreds of keys one at a time would take
// hours; one huge prompt risks truncated/malformed responses, so batching is
// a middle ground). The model returns a JSON object with the same keys and
// translated values, which gets merged back into the target file's nested
// structure at the right paths, leaving every already-translated key alone.
//
// {{placeholders}} (i18next interpolation, e.g. "~€{{value}} value") are
// explicitly preserved untouched — the prompt tells the model not to
// translate or alter anything inside {{ }}.
//
// REQUIREMENTS
//   - Ollama running locally (default http://127.0.0.1:11434) with the model
//     below pulled: `ollama pull mistral-nemo:12b`
//   - Run from the project root
//
// USAGE
//   node scripts/i18n-translate.js                    # translate everything missing, all 4 languages
//   node scripts/i18n-translate.js --langs=pt,es       # only these languages
//   node scripts/i18n-translate.js --pilot             # translate one small batch from one file, print only, no file writes
//   node scripts/i18n-translate.js --model=qwen3.5:9b  # use a different installed Ollama model
//   node scripts/i18n-translate.js --batch-size=25     # smaller/larger batches per Ollama call (default 40)

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'public', 'locales');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, `i18n-translate-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
function log(msg = '') {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n');
}

const args = process.argv.slice(2);
const PILOT = args.includes('--pilot');
const modelArg = args.find(a => a.startsWith('--model='));
const MODEL = modelArg ? modelArg.split('=')[1] : 'mistral-nemo:12b';
const langsArg = args.find(a => a.startsWith('--langs='));
const ALL_LANGS = ['es', 'fr', 'de', 'pt'];
const TARGET_LANGS = langsArg ? langsArg.split('=')[1].split(',').map(s => s.trim()) : ALL_LANGS;
const batchArg = args.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 40;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000;

// Register/tone notes verified against the site's real translation files —
// FR uses formal "vous", the others use the informal register.
const LANG_INFO = {
  es: { name: 'Spanish (Spain)', register: 'informal "tú" register (not formal "usted")' },
  fr: { name: 'French (France)', register: 'formal "vous" register (not informal "tu")' },
  de: { name: 'German', register: 'informal "du" register (not formal "Sie")' },
  pt: { name: 'European Portuguese (Portugal, not Brazil)', register: 'informal "tu" register (not formal "você")' }
};

function flatten(obj, prefix = '') {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    const val = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof val === 'string') out[key] = val;
    else if (typeof val === 'object' && val !== null) Object.assign(out, flatten(val, key));
  }
  return out;
}

function deepSet(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A key needs (re-)translation if it's missing entirely, OR if it's present
// but byte-identical to the English source (length > 2 to skip trivially
// short/legitimately-shared strings) — the latter catches a file that was
// accidentally overwritten with raw English content.
function findMissingKeys(enFlat, targetFlat) {
  return Object.keys(enFlat).filter(k => {
    if (!(k in targetFlat)) return true;
    return targetFlat[k] === enFlat[k] && enFlat[k].trim().length > 2;
  });
}

async function translateBatch(pairs, lang, attempt = 1) {
  const info = LANG_INFO[lang];
  const prompt = `You are translating dashboard UI strings from English to ${info.name} for Spawnly, a game-server-hosting platform based in Portugal. Use a ${info.register} — match that register exactly, consistently with the rest of the site's ${info.name} translation.

STRICT RULES:
1. Respond with ONLY a single valid JSON object, nothing else — no markdown fences, no commentary, no explanation.
2. The JSON object must have EXACTLY the same keys as the input, in the same order, each mapped to its translated string.
3. Anything inside double curly braces, like {{value}} or {{amount}}, is a code placeholder — copy it through EXACTLY unchanged, character for character. Never translate or alter text inside {{ }}.
4. These are short UI strings (buttons, labels, tooltips, error messages) — keep translations natural, concise, and consistent with how a real application UI reads in ${info.name}, not overly literal.
5. Preserve any HTML-like tags (e.g. <strong>) exactly as-is if present.

Input (English) — translate every value, keep every key:
${JSON.stringify(pairs, null, 2)}`;

  let res;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: { temperature: 0.3 }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Ollama did not respond within ${OLLAMA_TIMEOUT_MS / 1000}s`);
    const cause = e.cause ? ` (cause: ${e.cause.code || e.cause.message || e.cause})` : '';
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}${cause} — is 'ollama serve' running?`);
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — is ${MODEL} pulled? Run: ollama pull ${MODEL}`);

  const data = await res.json();
  let text = (data.message?.content || '').trim();
  // Strip markdown code fences if the model added them despite instructions
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    if (attempt < 3) {
      log(`  malformed JSON (attempt ${attempt}), retrying...`);
      return translateBatch(pairs, lang, attempt + 1);
    }
    log(`  RAW RESPONSE (first 1500 chars):\n${text.slice(0, 1500)}\n`);
    throw new Error('Could not parse JSON from model response after 3 attempts — raw response logged above');
  }

  const missingKeys = Object.keys(pairs).filter(k => !(k in parsed));
  if (missingKeys.length > 0) {
    if (attempt < 3) {
      log(`  response missing ${missingKeys.length} key(s) (attempt ${attempt}), retrying...`);
      return translateBatch(pairs, lang, attempt + 1);
    }
    throw new Error(`Model response missing keys after 3 attempts: ${missingKeys.join(', ')}`);
  }

  // Guard against the model mangling placeholders
  for (const k of Object.keys(pairs)) {
    const origPlaceholders = (pairs[k].match(/\{\{[^}]+\}\}/g) || []).sort();
    const newPlaceholders = (String(parsed[k]).match(/\{\{[^}]+\}\}/g) || []).sort();
    if (JSON.stringify(origPlaceholders) !== JSON.stringify(newPlaceholders)) {
      log(`  WARNING: placeholder mismatch on "${k}" — original: [${origPlaceholders}] translated: [${newPlaceholders}]. Keeping translation anyway, please spot-check.`);
    }
  }

  return parsed;
}

let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) process.exit(1);
  stopRequested = true;
  log('\nStopping after the current batch finishes and saves — press Ctrl+C again to force-quit immediately.');
});

async function main() {
  log(`Log file: ${logFile}`);
  log(`Model: ${MODEL} | Languages: ${TARGET_LANGS.join(', ')} | Batch size: ${BATCH_SIZE} | Mode: ${PILOT ? 'PILOT (no file writes)' : 'FULL RUN'}\n`);

  const jsonFiles = fs.readdirSync(path.join(LOCALES_DIR, 'en')).filter(f => f.endsWith('.json'));
  log(`Found ${jsonFiles.length} locale files: ${jsonFiles.join(', ')}\n`);

  if (PILOT) {
    const lang = TARGET_LANGS[0];
    for (const file of jsonFiles) {
      const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en', file), 'utf8'));
      const enFlat = flatten(en);
      const targetPath = path.join(LOCALES_DIR, lang, file);
      const target = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
      const targetFlat = flatten(target);
      const missing = findMissingKeys(enFlat, targetFlat).slice(0, 5);
      if (missing.length === 0) continue;

      log(`Pilot: translating ${missing.length} keys from ${file} into ${lang}, printing only.\n`);
      const pairs = {};
      missing.forEach(k => pairs[k] = enFlat[k]);
      const translated = await translateBatch(pairs, lang);
      log(JSON.stringify(translated, null, 2));
      log(`\nFull log saved to: ${logFile}`);
      return;
    }
    log('No missing keys found anywhere for a pilot — everything is already translated.');
    return;
  }

  let totalDone = 0, totalFailed = 0;

  for (const lang of TARGET_LANGS) {
    if (stopRequested) break;
    if (!LANG_INFO[lang]) { log(`Skipping unknown language "${lang}" (supported: ${ALL_LANGS.join(', ')})`); continue; }

    log(`\n=== ${lang} (${LANG_INFO[lang].name}) ===`);

    for (const file of jsonFiles) {
      if (stopRequested) break;

      const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en', file), 'utf8'));
      const enFlat = flatten(en);

      const targetPath = path.join(LOCALES_DIR, lang, file);
      let target = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
      const targetFlat = flatten(target);

      const missingKeys = findMissingKeys(enFlat, targetFlat);
      if (missingKeys.length === 0) {
        log(`  ${file}: already complete (${Object.keys(enFlat).length} keys)`);
        continue;
      }

      log(`  ${file}: ${missingKeys.length} missing/untranslated / ${Object.keys(enFlat).length} total`);
      const batches = chunk(missingKeys, BATCH_SIZE);

      for (let i = 0; i < batches.length; i++) {
        if (stopRequested) break;
        const batchKeys = batches[i];
        const pairs = {};
        batchKeys.forEach(k => pairs[k] = enFlat[k]);

        const start = Date.now();
        try {
          const translated = await translateBatch(pairs, lang);
          for (const k of batchKeys) deepSet(target, k, translated[k]);
          fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf8');
          const seconds = ((Date.now() - start) / 1000).toFixed(1);
          log(`    batch ${i + 1}/${batches.length} (${batchKeys.length} keys) ... done (${seconds}s), saved`);
          totalDone += batchKeys.length;
        } catch (e) {
          log(`    batch ${i + 1}/${batches.length} ... FAILED: ${e.message}`);
          totalFailed += batchKeys.length;
        }
      }
    }
  }

  log(`\n${totalDone} keys translated and saved, ${totalFailed} failed, this run.`);
  if (stopRequested) log('Stopped early by request — run again anytime to pick up where this left off.');
  log(`Full log saved to: ${logFile}`);
}

main().catch(e => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
