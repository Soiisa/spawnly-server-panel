// scripts/kb-migrate-strip-lang-suffix.js

require('dotenv').config({ path: '.env.kb-target' });
const { createClient } = require('@supabase/supabase-js');

const EXECUTE = process.argv.includes('--execute');
const LANGS = ['es', 'fr', 'de', 'pt'];

const supabase = createClient(
  process.env.KB_TARGET_SUPABASE_URL,
  process.env.KB_TARGET_SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log(EXECUTE ? 'EXECUTE mode — this will modify the database.\n' : 'DRY RUN — nothing will be written. Pass --execute to apply.\n');

  // 1. Build the full old-slug -> new-slug map, per language, from whatever's
  // actually in the DB right now (don't assume — verify against real rows).
  const { data: allRows, error } = await supabase
    .from('kb_articles')
    .select('id, slug, language, content')
    .in('language', LANGS);
  if (error) { console.error('Fetch failed:', error); process.exit(1); }

  const rowsToFix = [];
  for (const row of allRows) {
    const suffix = `-${row.language}`;
    if (row.slug.endsWith(suffix)) {
      rowsToFix.push({ ...row, newSlug: row.slug.slice(0, -suffix.length) });
    }
  }

  if (rowsToFix.length === 0) {
    console.log('No suffixed slugs found — nothing to migrate. (Already migrated, or none inserted yet.)');
    return;
  }

  // 2. Build a link-rewrite map per language: /{lang}/knowledge-base/{old} -> /{lang}/knowledge-base/{new}
  const linkMapByLang = {};
  for (const lang of LANGS) {
    linkMapByLang[lang] = {};
    rowsToFix.filter(r => r.language === lang).forEach(r => {
      linkMapByLang[lang][`/${lang}/knowledge-base/${r.slug}`] = `/${lang}/knowledge-base/${r.newSlug}`;
    });
  }

  console.log(`Found ${rowsToFix.length} rows to migrate:\n`);

  let done = 0, failed = 0;
  for (const row of rowsToFix) {
    let newContent = row.content;
    let linkRewrites = 0;
    for (const [oldHref, newHref] of Object.entries(linkMapByLang[row.language])) {
      const before = newContent;
      newContent = newContent.split(`"${oldHref}"`).join(`"${newHref}"`);
      if (newContent !== before) linkRewrites++;
    }

    console.log(`[${row.language}] ${row.slug} -> ${row.newSlug} (${linkRewrites} internal link${linkRewrites === 1 ? '' : 's'} rewritten)`);

    if (EXECUTE) {
      const { error: updateErr } = await supabase
        .from('kb_articles')
        .update({ slug: row.newSlug, content: newContent, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateErr) {
        console.log(`  FAILED: ${updateErr.message}`);
        failed++;
      } else {
        done++;
      }
    }
  }

  if (EXECUTE) {
    console.log(`\n${done} migrated, ${failed} failed, out of ${rowsToFix.length}.`);
  } else {
    console.log(`\nDry run complete — ${rowsToFix.length} rows would be migrated. Re-run with --execute to apply.`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
