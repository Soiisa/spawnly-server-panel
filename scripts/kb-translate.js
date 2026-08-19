// scripts/kb-translate.js
//
// Translates Spawnly's published English Knowledge Base articles into every
// other locale the site supports (es, fr, de, pt) using a local Ollama model,
// and publishes each translation immediately as it's produced — one article at
// a time, language by language.
//
// ONE-TIME DATABASE PREREQUISITE
// kb_articles originally had a UNIQUE constraint on `slug` alone, which this
// script's design requires to be a composite unique on (slug, language)
// instead — every language shares the same slug now (see below), and Postgres
// needs to allow that. Run this once in the Supabase SQL editor before using
// this script:
//   ALTER TABLE kb_articles DROP CONSTRAINT kb_articles_slug_key;
//   ALTER TABLE kb_articles ADD CONSTRAINT kb_articles_slug_language_key UNIQUE (slug, language);
// (Service-role API access can't run DDL, so this can't be scripted — it has
// to be run by hand, once.)
//
// DESIGNED TO BE STOPPED AND RESUMED FREELY.
// Nothing is buffered across articles: each translation is a single, atomic
// Supabase insert. If you Ctrl+C (or the process dies, or Ollama hangs and the
// per-request timeout kills it) between articles, whatever was already inserted
// stays inserted and published, and whatever wasn't is simply untouched — no
// partial rows, no cleanup needed. Every run starts by re-fetching which EN
// articles exist and which (slug, language) translations already exist, and
// only processes what's missing. That also means: whenever you add new EN
// articles later, just run this again — it'll translate only the new ones,
// for every language, and leave everything already translated alone.
//
// PUBLISHES IMMEDIATELY, NO REVIEW STEP.
// Unlike the KB-authoring workflow used earlier in this project (draft ->
// human review -> publish), this script sets is_published: true the moment
// each translation is inserted, by design, since re-reviewing hundreds of
// machine-translated rows by hand isn't practical for a script you re-run
// repeatedly. If you want the old cautious behavior back for a given run,
// pass --draft and nothing gets published until you flip it manually.
//
// SLUGS ARE SHARED ACROSS LANGUAGES
// Every translation keeps the EXACT SAME slug as its English original —
// differentiated only by the `language` column — matching how
// pages/knowledge-base/[slug].js and pages/server-sitemap.xml.js both work.
// Internal links get rewritten from <a href="/knowledge-base/some-slug"> to
// <a href="/{lang}/knowledge-base/some-slug"> (locale prefix added, slug
// unchanged) so in-article navigation stays in that language instead of
// bouncing the reader back to English (raw <a> tags in dangerouslySetInnerHTML
// content do NOT get Next.js's automatic locale-prefixing the way a real
// <Link> would).
//
// REQUIREMENTS
//   - Ollama running locally (default http://127.0.0.1:11434) with the model
//     below pulled: `ollama pull mistral-nemo:12b`
//   - Run from the project root so `.env.kb-target` resolves (KB_TARGET_SUPABASE_URL /
//     KB_TARGET_SUPABASE_SERVICE_ROLE_KEY must be set there)
//   - `@supabase/supabase-js` and `dotenv` are already project dependencies
//
// USAGE
//   node scripts/kb-translate.js                       # translate + publish everything missing, all 4 languages
//   node scripts/kb-translate.js --langs=pt,es          # only these languages
//   node scripts/kb-translate.js --draft                # insert as drafts instead of publishing immediately
//   node scripts/kb-translate.js --pilot                # translate 3 sample EN articles into the first requested language, print only, no DB writes
//   node scripts/kb-translate.js --model=qwen3.5:9b     # use a different installed Ollama model
//
// Every run writes everything it prints to a timestamped file under logs/ too,
// so output survives closing the terminal.

require('dotenv').config({ path: '.env.kb-target' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, `kb-translate-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
function log(msg = '') {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n');
}

const args = process.argv.slice(2);
const PILOT = args.includes('--pilot');
const DRAFT = args.includes('--draft');
const modelArg = args.find(a => a.startsWith('--model='));
const MODEL = modelArg ? modelArg.split('=')[1] : 'mistral-nemo:12b';
const langsArg = args.find(a => a.startsWith('--langs='));
const ALL_LANGS = ['es', 'fr', 'de', 'pt'];
const TARGET_LANGS = langsArg ? langsArg.split('=')[1].split(',').map(s => s.trim()) : ALL_LANGS;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per article — if Ollama hangs, don't block the whole run forever

const supabase = createClient(
  process.env.KB_TARGET_SUPABASE_URL,
  process.env.KB_TARGET_SUPABASE_SERVICE_ROLE_KEY
);

const PILOT_SLUGS = [
  'getting-started-creating-your-first-server',   // plain prose, no code/tables
  'arma-reforger-server-json-configuration',       // code blocks + a table, must stay untranslated
  'dont-starve-together-installing-mods'           // a danger callout, must stay a callout
];

// Register/tone notes verified against the site's real translation files —
// don't guess these, they differ per language (FR uses formal "vous", the
// others use the informal register).
const LANG_INFO = {
  es: { name: 'Spanish (Spain)', register: 'informal "tú" register (not formal "usted")' },
  fr: { name: 'French (France)', register: 'formal "vous" register (not informal "tu")' },
  de: { name: 'German', register: 'informal "du" register (not formal "Sie")' },
  pt: { name: 'European Portuguese (Portugal, not Brazil)', register: 'informal "tu" register (not formal "você")' }
};

// ---------------------------------------------------------------------------
// Glossary: pulls real EN -> target-language strings straight from the app's
// own locale files, so article prose refers to UI elements (tab names, button
// labels) using the EXACT words a user actually sees in that language's
// dashboard.
// ---------------------------------------------------------------------------
function buildGlossary(lang) {
  const localesDir = path.join(__dirname, '..', 'public', 'locales');
  const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'server.json'), 'utf8'));
  const l = JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'server.json'), 'utf8'));
  const enC = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'common.json'), 'utf8'));
  const lC = JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'common.json'), 'utf8'));

  const glossary = {};
  const flatten = (obj, lObj) => {
    Object.keys(obj || {}).forEach(k => {
      if (typeof obj[k] === 'string' && obj[k].split(' ').length <= 6) {
        if (lObj?.[k] && lObj[k] !== obj[k]) glossary[obj[k]] = lObj[k];
      } else if (typeof obj[k] === 'object') {
        flatten(obj[k], lObj?.[k] || {});
      }
    });
  };
  flatten(en, l);
  flatten(enC, lC);
  return glossary;
}

function buildPrompt(article, lang, glossaryText, slugMapText) {
  const info = LANG_INFO[lang];
  return `You are translating a game-server-hosting help center article from English to ${info.name} for Spawnly, a company based in Portugal. The site's real UI is already translated to ${info.name} using a ${info.register} — match that register exactly.

STRICT RULES:
1. Output ONLY valid HTML for the content, and a plain text title. Do not add commentary, notes, or markdown fences.
2. Preserve ALL HTML tags, attributes (href, data-callout, class, colspan, etc.) EXACTLY as-is. Only translate the human-readable text between tags.
3. Do NOT translate: content inside <code> or <pre> blocks, file names, file paths, JSON keys (like "-mods", "-authkey"), config field names (like MaxPlayers=, WorkshopItems=), cvar names (like sv_cheats, rcon_password), command names, or product/brand names (Spawnly, Steam, Workshop, RCON, GMod, Rust, etc. — game and platform names stay in English).
4. When referring to a UI element (a tab name or button label), use the EXACT term from this glossary if it appears, so it matches what users actually see in the dashboard:
${glossaryText}
5. Any internal link matching href="/knowledge-base/SOME-SLUG" must be rewritten using this exact mapping — the slug itself never changes, only a "/${lang}" locale prefix gets added (only rewrite links whose slug appears here, leave any other href untouched):
${slugMapText}
6. Keep the same HTML structure (same headings, same number of paragraphs/list items/callouts/tables) — this is a translation, not a rewrite or summary.

Respond in EXACTLY this format, nothing else:
TITLE: <translated title>
CONTENT:
<translated HTML content>

---

Original title: ${article.title}

Original content:
${article.content}`;
}

async function translateArticle(article, lang, glossaryText, slugMapText, attempt = 1) {
  const prompt = buildPrompt(article, lang, glossaryText, slugMapText);

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
    if (e.name === 'AbortError') {
      throw new Error(`Ollama did not respond within ${OLLAMA_TIMEOUT_MS / 1000}s — skipping, will retry on next run`);
    }
    const cause = e.cause ? ` (cause: ${e.cause.code || e.cause.message || e.cause})` : '';
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}${cause} — is 'ollama serve' running?`);
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — is ${MODEL} pulled? Run: ollama pull ${MODEL}`);

  const data = await res.json();
  const text = data.message?.content || '';

  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const contentMatch = text.match(/CONTENT:\s*([\s\S]*)/);

  if (!titleMatch || !contentMatch) {
    if (attempt < 3) {
      log(`  [${article.slug}/${lang}] malformed response (attempt ${attempt}), retrying...`);
      return translateArticle(article, lang, glossaryText, slugMapText, attempt + 1);
    }
    log(`  [${article.slug}/${lang}] RAW RESPONSE (first 1500 chars):\n${text.slice(0, 1500)}\n`);
    throw new Error('Could not parse TITLE/CONTENT from model response after 3 attempts — raw response logged above');
  }

  // The model occasionally wraps the title in markdown bold (**Title**), and/or
  // prepends a stray "**" right before the content's first tag, despite being
  // told to output plain HTML — strip leading/trailing markdown emphasis
  // markers from both so literal asterisks don't end up stored and rendered.
  const cleanTitle = titleMatch[1].trim().replace(/^\*+\s*|\s*\*+$/g, '').trim();
  const cleanContent = contentMatch[1].trim().replace(/^\*+\s*/, '').trim();

  return { title: cleanTitle, content: cleanContent };
}

let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) process.exit(1); // second Ctrl+C forces immediate exit
  stopRequested = true;
  log('\nStopping after the current article finishes (already-published articles are untouched) — press Ctrl+C again to force-quit immediately.');
});

async function main() {
  log(`Log file: ${logFile}`);
  log(`Model: ${MODEL} | Languages: ${TARGET_LANGS.join(', ')} | Mode: ${PILOT ? 'PILOT (no DB writes)' : DRAFT ? 'FULL RUN (drafts, no auto-publish)' : 'FULL RUN (publishes immediately)'}\n`);

  const { data: enArticles, error: fetchErr } = await supabase
    .from('kb_articles')
    .select('id, title, slug, game, tags, content')
    .eq('language', 'en')
    .eq('is_published', true)
    .order('slug');
  if (fetchErr) { log(`Failed to fetch EN articles: ${JSON.stringify(fetchErr)}`); process.exit(1); }
  log(`Found ${enArticles.length} published EN articles.\n`);

  if (PILOT) {
    const lang = TARGET_LANGS[0];
    const glossary = buildGlossary(lang);
    const glossaryText = Object.entries(glossary).filter(([e]) => e.length > 2 && e.length < 40).slice(0, 150).map(([e, l]) => `${e} => ${l}`).join('\n');
    const slugMapText = enArticles.map(a => `/knowledge-base/${a.slug} => /${lang}/knowledge-base/${a.slug}`).join('\n');
    const toProcess = enArticles.filter(a => PILOT_SLUGS.includes(a.slug));
    log(`Pilot mode: translating ${toProcess.length} sample articles into ${lang}, printing only.\n`);

    for (const article of toProcess) {
      const start = Date.now();
      try {
        const { title, content } = await translateArticle(article, lang, glossaryText, slugMapText);
        const seconds = ((Date.now() - start) / 1000).toFixed(1);
        log(`----- ${article.slug} (${seconds}s) -----\nTITLE: ${title}\nCONTENT:\n${content}\n`);
      } catch (e) {
        log(`----- ${article.slug} FAILED: ${e.message} -----\n`);
      }
    }
    log(`\nFull log saved to: ${logFile}`);
    return;
  }

  let totalDone = 0, totalFailed = 0;

  for (const lang of TARGET_LANGS) {
    if (stopRequested) break;
    if (!LANG_INFO[lang]) { log(`Skipping unknown language "${lang}" (supported: ${ALL_LANGS.join(', ')})`); continue; }

    const glossary = buildGlossary(lang);
    const glossaryText = Object.entries(glossary).filter(([e]) => e.length > 2 && e.length < 40).slice(0, 150).map(([e, l]) => `${e} => ${l}`).join('\n');
    const slugMapText = enArticles.map(a => `/knowledge-base/${a.slug} => /${lang}/knowledge-base/${a.slug}`).join('\n');

    const { data: existing } = await supabase.from('kb_articles').select('slug').eq('language', lang);
    // Recognize BOTH the current bare-slug scheme and the older "-{lang}" suffixed
    // scheme (from before kb_articles got a composite (slug, language) unique
    // constraint) as "already translated" — otherwise an unmigrated old row is
    // invisible to this check and gets silently re-translated as a duplicate.
    // See scripts/kb-migrate-strip-lang-suffix.js for the one-time cleanup.
    const existingBaseSlugs = new Set((existing || []).map(r => r.slug.endsWith(`-${lang}`) ? r.slug.slice(0, -(`-${lang}`.length)) : r.slug));
    const toProcess = enArticles.filter(a => !existingBaseSlugs.has(a.slug));

    log(`\n=== ${lang} (${LANG_INFO[lang].name}): ${enArticles.length - toProcess.length} already done, ${toProcess.length} remaining ===`);

    for (const article of toProcess) {
      if (stopRequested) break;
      const start = Date.now();
      const idx = `[${totalDone + totalFailed + 1} in this run]`;
      try {
        const { title, content } = await translateArticle(article, lang, glossaryText, slugMapText);
        const { error: insertErr } = await supabase.from('kb_articles').insert({
          title,
          slug: article.slug,
          game: article.game,
          language: lang,
          tags: article.tags,
          content,
          is_published: !DRAFT,
          updated_at: new Date().toISOString()
        });
        if (insertErr) throw insertErr;
        const seconds = ((Date.now() - start) / 1000).toFixed(1);
        log(`${idx} ${lang}/${article.slug} ... done (${seconds}s)${DRAFT ? ' [draft]' : ' [published]'}`);
        totalDone++;
      } catch (e) {
        log(`${idx} ${lang}/${article.slug} ... FAILED: ${e.message}`);
        totalFailed++;
      }
    }
  }

  log(`\n${totalDone} translated${DRAFT ? '' : ' and published'}, ${totalFailed} failed, this run.`);
  if (stopRequested) log('Stopped early by request — run again anytime to pick up where this left off.');
  log(`Full log saved to: ${logFile}`);
}

main().catch(e => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
