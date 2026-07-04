#!/usr/bin/env node
/*
 * 股癌逐字稿「主抓」程式 — Podcast 第一手音訊 (primary: podcast audio)
 *
 * 本專案奉「一切以原始節目為準」為圭臬，故來源階層以**第一手音訊**為主：
 * 謝孟恭的原音（《股癌》Podcast 的音檔）才是節目本身，whatmkreallysaid.com
 * 逐字稿站是第三方的二手轉錄，只作備援（見 fallback.js）。
 *
 * 流程：
 *   1. 解析《股癌》的 Podcast RSS（Apple Podcasts 與 Spotify 都是索引同一份 RSS，
 *      本節目託管在 SoundOn）。從 RSS 取得每集的：集數、標題、發布日、節目摘要
 *      (show notes) 與「音檔 enclosure URL」。
 *   2. 找出「RSS 有、但本地 transcripts/ 還沒有（或只有待補音檔的 stub）」的最新集數。
 *   3. 對這些缺集：
 *        - 若設定了語音轉文字後端（見下方環境變數），下載音檔 → 轉逐字稿 → 寫入，
 *          frontmatter 標 `source_type: podcast-audio`、`transcript_status: audio-transcribed`。
 *          此為第一手來源，備援（網站）不會覆蓋它。
 *        - 否則，用 RSS 的節目摘要寫一份「待補 stub」，frontmatter 標
 *          `source_type: podcast-audio` 與 `transcript_status: pending-audio`，
 *          並保留音檔 URL，等有了轉錄後端再升級、或由備援（逐字稿站）補上正式版。
 *
 * 也就是說：**沒有任何 secret 也能持續運行**（退化為摘要 stub），
 * 有 secret 時才做真正的 audio → 逐字稿。這樣 GitHub Action 才能穩定不中斷。
 *
 * 語音轉文字後端（可選，OpenAI 相容的 /audio/transcriptions）：
 *   TRANSCRIBE_API_KEY   API 金鑰（如 OpenAI 或 Groq 的 key）
 *   TRANSCRIBE_API_URL   端點，預設 https://api.openai.com/v1/audio/transcriptions
 *   TRANSCRIBE_MODEL     模型，預設 whisper-1（Groq 可用 whisper-large-v3）
 *   TRANSCRIBE_MAX_MB    單檔上限 MB，預設 24（多數 Whisper API 為 25MB；後端上限
 *                        較高時可調大，讓整集音檔不必因超限而退回 stub）
 *
 * 用法：
 *   node scrape.js                # 掃描缺集並補上，輸出到 ./transcripts
 *   node scrape.js --out ./out    # 自訂輸出目錄
 *   node scrape.js --limit 3      # 最多只補最新的 N 集缺集（預設 5）
 *   node scrape.js --dry-run      # 只印出會補哪些集，不寫檔
 *
 * 只依賴 Node.js 內建模組（fetch + fs），不需要安裝任何套件。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 《股癌》Gooaye 在 Apple Podcasts 的 collectionId；用來向 iTunes 查目前的 feedUrl，
// 查不到時退回已知的 SoundOn RSS。
const ITUNES_COLLECTION_ID = 1500839292;
const FALLBACK_FEED_URL =
  'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml';
const APPLE_URL = `https://podcasts.apple.com/podcast/id${ITUNES_COLLECTION_ID}`;

// ── 參數解析 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    out: path.join(__dirname, 'transcripts'),
    limit: 5,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--limit' || a === '-l') opts.limit = parseInt(argv[++i], 10);
    else if (a === '--dry-run' || a === '-n') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

// ── 找出目前的 Podcast RSS URL ───────────────────────────────────────────────
async function resolveFeedUrl() {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${ITUNES_COLLECTION_ID}&entity=podcast`,
      { cache: 'no-cache' }
    );
    if (res.ok) {
      const data = await res.json();
      const feed = data && data.results && data.results[0] && data.results[0].feedUrl;
      if (feed) return feed;
    }
  } catch (_) {
    /* iTunes 查詢失敗就用已知 feed */
  }
  return FALLBACK_FEED_URL;
}

// ── 極簡 RSS 解析（零依賴，不引入 XML 套件）─────────────────────────────────
function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}

// 把 show notes 的 HTML 粗略轉成純文字（保留換行、去標籤）。
function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const blocks = xml.split(/<item\b/i).slice(1);
  for (const raw of blocks) {
    const block = '<item' + raw.split(/<\/item>/i)[0] + '</item>';
    const title = tag(block, 'title');
    const epMatch = title.match(/EP\s*(\d+)/i);
    if (!epMatch) continue; // 只收有集數的正式單集
    const encMatch = block.match(/<enclosure\b[^>]*\burl="([^"]+)"[^>]*>/i);
    items.push({
      n: parseInt(epMatch[1], 10),
      title,
      pubDate: tag(block, 'pubDate'),
      link: tag(block, 'link'),
      audioUrl: encMatch ? decodeEntities(encMatch[1]) : '',
      notes: htmlToText(tag(block, 'description') || tag(block, 'content:encoded')),
    });
  }
  return items;
}

// ── 語音轉文字（可選後端）───────────────────────────────────────────────────
function transcriberConfig() {
  const key = process.env.TRANSCRIBE_API_KEY;
  if (!key) return null;
  return {
    key,
    url: process.env.TRANSCRIBE_API_URL || 'https://api.openai.com/v1/audio/transcriptions',
    model: process.env.TRANSCRIBE_MODEL || 'whisper-1',
  };
}

// 單檔上限：多數 Whisper API 為 25MB，預設抓 24MB 保險；後端上限較高時可用
// TRANSCRIBE_MAX_MB 調大，讓整集音檔不必因超限而退回 stub。
const MAX_AUDIO_BYTES = (parseInt(process.env.TRANSCRIBE_MAX_MB, 10) || 24) * 1024 * 1024;

async function transcribeAudio(cfg, audioUrl) {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`下載音檔失敗 HTTP ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  if (buf.length > MAX_AUDIO_BYTES) {
    throw new Error(
      `音檔 ${(buf.length / 1e6).toFixed(1)}MB 超過單檔上限 ` +
        `${(MAX_AUDIO_BYTES / 1e6).toFixed(0)}MB，改用摘要 stub（可調高 TRANSCRIBE_MAX_MB）`
    );
  }
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'episode.mp3');
  form.append('model', cfg.model);
  form.append('response_format', 'text');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`轉錄 API 失敗 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.text()).trim();
}

// ── Markdown 產生 ───────────────────────────────────────────────────────────
function epId(n) {
  return String(n).padStart(3, '0');
}

function yamlStr(s) {
  return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// 把 RSS pubDate（RFC 822）轉成 ISO 日期字串 (YYYY-MM-DD)，失敗回空字串。
function isoDate(pubDate) {
  const m = String(pubDate).match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/
  );
  if (!m) return '';
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  return `${m[3]}-${months[m[2]]}-${String(m[1]).padStart(2, '0')}`;
}

function toMarkdown(item, transcript) {
  const date = isoDate(item.pubDate);
  const hasTx = Boolean(transcript);
  const lines = ['---'];
  lines.push(`episode: ${item.n}`);
  lines.push(`title: ${yamlStr(item.title.replace(/^EP\s*\d+\s*[|｜]?\s*/i, '').trim() || item.title)}`);
  if (date) lines.push(`date: ${date}`);
  lines.push(`source: ${yamlStr(item.link || APPLE_URL)}`);
  lines.push('source_type: podcast-audio'); // 第一手音訊；備援（網站）不覆蓋已轉錄版
  lines.push(`transcript_status: ${hasTx ? 'audio-transcribed' : 'pending-audio'}`);
  if (item.audioUrl) lines.push(`audio_url: ${yamlStr(item.audioUrl)}`);
  lines.push('---');
  lines.push('');
  lines.push(`# EP${item.n}　${item.title.replace(/^EP\s*\d+\s*[|｜]?\s*/i, '').trim()}`.trimEnd());
  lines.push('');
  if (date) lines.push(`> 📅 ${date}`, '');
  lines.push(
    hasTx
      ? '> 🎙 本集逐字稿由 **Podcast 第一手音檔自動轉錄**（主來源），可能有辨識誤差；正確內容以原始節目為準。'
      : '> ⚠️ 尚未取得本集音檔轉錄，以下為 **Podcast 節目摘要 (show notes)** 暫存，非完整逐字稿（可能含業配）。設定轉錄後端、或由備援逐字稿站補上後會自動升級。',
    ''
  );
  if (item.notes) {
    lines.push('## 節目摘要', '', item.notes, '');
  }
  lines.push('## 逐字稿', '');
  lines.push(hasTx ? transcript : '（尚未取得完整逐字稿，見上方節目摘要。）');
  lines.push('');
  return lines.join('\n');
}

// 既有檔案是否為「還可被升級」的狀態：不存在，或存在但是待補音檔的 stub。
function needsFill(file) {
  if (!fs.existsSync(file)) return true;
  const head = fs.readFileSync(file, 'utf8').slice(0, 400);
  return /transcript_status:\s*pending-audio/.test(head);
}

// ── 主程式 ──────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('用法: node scrape.js [--out <dir>] [--limit <n>] [--dry-run]');
    return;
  }

  const cfg = transcriberConfig();
  console.log(`→ 轉錄後端：${cfg ? `已設定（${cfg.model}）` : '未設定，將寫節目摘要 stub'}`);

  console.log('→ 解析 Podcast RSS …');
  const feedUrl = await resolveFeedUrl();
  const res = await fetch(feedUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`下載 RSS 失敗 HTTP ${res.status}`);
  const items = parseRssItems(await res.text());
  if (!items.length) throw new Error('RSS 解析不到任何單集');
  items.sort((a, b) => b.n - a.n); // 由新到舊
  console.log(`  RSS 最新集數 EP${items[0].n}，共解析 ${items.length} 集`);

  fs.mkdirSync(opts.out, { recursive: true });

  // 挑出需要補的缺集（由新到舊，最多 limit 集）
  const missing = items
    .filter((it) => needsFill(path.join(opts.out, `EP${epId(it.n)}.md`)))
    .slice(0, Math.max(0, opts.limit));

  if (!missing.length) {
    console.log('✓ 沒有缺集，本地音訊逐字稿都是最新的。');
    return;
  }
  console.log(`  需補 ${missing.length} 集：${missing.map((m) => 'EP' + m.n).join(', ')}`);

  let filled = 0;
  for (const it of missing) {
    const file = path.join(opts.out, `EP${epId(it.n)}.md`);
    let transcript = '';
    if (cfg && it.audioUrl) {
      try {
        console.log(`  · EP${it.n} 下載音檔轉錄中 …`);
        transcript = await transcribeAudio(cfg, it.audioUrl);
      } catch (e) {
        console.warn(`  ⚠ EP${it.n} 轉錄失敗（${e.message}），改寫摘要 stub`);
      }
    }
    if (opts.dryRun) {
      console.log(`  [dry-run] 會寫 ${file}（${transcript ? '含轉錄' : '摘要 stub'}）`);
      continue;
    }
    fs.writeFileSync(file, toMarkdown(it, transcript), 'utf8');
    filled++;
    console.log(`  ✓ 寫入 ${path.basename(file)}（${transcript ? 'audio-transcribed' : 'pending-audio'}）`);
  }

  console.log(`✓ 主抓完成：處理 ${filled} 集${opts.dryRun ? '（dry-run 未寫檔）' : ''}。`);
}

main().catch((err) => {
  console.error('✗ 主抓發生錯誤：', err.message || err);
  process.exit(1);
});
