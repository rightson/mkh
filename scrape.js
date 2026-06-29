#!/usr/bin/env node
/*
 * 股癌逐字稿抓取程式 (whatmkreallysaid.com scraper)
 *
 * 網站本身是純前端 (JS) 渲染：頁面載入後會抓取一份單一的 brotli 壓縮資料包
 *   /transcripts.json.br
 * 裡面就是「所有」集數的逐字稿 JSON 陣列。搜尋等功能都在瀏覽器端用這份資料完成。
 *
 * 因此最可靠、最有禮貌的抓法不是去 render 每一頁 HTML，而是直接抓這份官方資料包，
 * 解壓縮後把每一集輸出成一份獨立的 Markdown 檔。
 *
 * 資料格式 (每個 episode 物件)：
 *   n    : 集數 (number)
 *   t    : 標題 (string)
 *   d    : 日期 ISO  (string, e.g. "2020-02-27")，少數集數可能沒有
 *   dt   : 日期顯示用 (string, e.g. "Feb 27, 2020")
 *   desc : 摘要 (string)
 *   tx   : 逐字稿全文 (string)
 *
 * 用法：
 *   node scrape.js                 # 輸出到 ./transcripts
 *   node scrape.js --out ./out     # 自訂輸出目錄
 *   node scrape.js --force         # 即使已存在也覆寫
 *
 * 只依賴 Node.js 內建模組 (fetch + zlib)，不需要安裝任何套件。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = 'https://whatmkreallysaid.com';
const MANIFEST_URL = `${BASE}/pack_manifest.json`;
const PACK_URL = `${BASE}/transcripts.json.br`;

// ── 參數解析 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { out: path.join(__dirname, 'transcripts'), force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--force' || a === '-f') opts.force = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

// ── 下載並解壓縮資料包 ───────────────────────────────────────────────────────
async function fetchPack() {
  // 直接抓取預壓縮的 brotli 檔，自己解壓縮，避免下載 ~36MB 的原始 JSON。
  const res = await fetch(PACK_URL);
  if (!res.ok) throw new Error(`下載資料包失敗: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // fetch() 可能已依 Content-Encoding: br 自動解壓縮，也可能拿到原始 brotli bytes。
  // 先嘗試直接 parse，失敗再用 brotli 解壓縮。
  const tryParse = (b) => {
    try { return JSON.parse(b.toString('utf8')); } catch (_) { return null; }
  };
  let data = tryParse(buf);
  if (!data) data = tryParse(zlib.brotliDecompressSync(buf));
  if (!data) throw new Error('資料包解析失敗 (既非 JSON 也非有效的 brotli)');
  if (!Array.isArray(data)) throw new Error('資料包格式非預期 (應為陣列)');
  return data;
}

async function fetchManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch (_) { /* manifest 只是輔助資訊，失敗就略過 */ }
  return null;
}

// ── Markdown 產生 ───────────────────────────────────────────────────────────
function epId(n) {
  return String(n).padStart(3, '0'); // 補零至三碼 (EP001 … EP674)，方便依檔名排序
}

// YAML frontmatter 字串值跳脫（包雙引號，跳脫內部雙引號與反斜線）
function yamlStr(s) {
  return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function toMarkdown(ep) {
  const epUrl = `${BASE}/episode.html?file=EP${ep.n}`;
  const lines = [];
  lines.push('---');
  lines.push(`episode: ${ep.n}`);
  lines.push(`title: ${yamlStr(ep.t)}`);
  if (ep.d) lines.push(`date: ${ep.d}`);
  if (ep.dt) lines.push(`date_display: ${yamlStr(ep.dt)}`);
  lines.push(`source: ${yamlStr(epUrl)}`);
  lines.push('---');
  lines.push('');
  lines.push(`# EP${ep.n}　${ep.t || ''}`.trimEnd());
  lines.push('');
  if (ep.d || ep.dt) {
    lines.push(`> 📅 ${ep.d || ''}${ep.dt ? `（${ep.dt}）` : ''}`.trim());
    lines.push('');
  }
  if (ep.desc) {
    lines.push('## 摘要');
    lines.push('');
    lines.push(ep.desc.trim());
    lines.push('');
  }
  lines.push('## 逐字稿');
  lines.push('');
  lines.push((ep.tx || '').trim());
  lines.push('');
  return lines.join('\n');
}

// ── 主程式 ──────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('用法: node scrape.js [--out <dir>] [--force]');
    return;
  }

  console.log('→ 讀取 manifest …');
  const manifest = await fetchManifest();
  if (manifest) {
    console.log(`  版本 ${manifest.version}，建置於 ${manifest.built_at}，共 ${manifest.episode_count} 集`);
  }

  console.log('→ 下載逐字稿資料包 …');
  const episodes = await fetchPack();
  console.log(`  取得 ${episodes.length} 集`);

  if (manifest && manifest.episode_count && manifest.episode_count !== episodes.length) {
    console.warn(`  ⚠ manifest 宣稱 ${manifest.episode_count} 集，但資料包有 ${episodes.length} 集`);
  }

  fs.mkdirSync(opts.out, { recursive: true });

  // 依集數排序輸出
  episodes.sort((a, b) => a.n - b.n);

  let written = 0, skipped = 0;
  for (const ep of episodes) {
    const file = path.join(opts.out, `EP${epId(ep.n)}.md`);
    if (!opts.force && fs.existsSync(file)) { skipped++; continue; }
    fs.writeFileSync(file, toMarkdown(ep), 'utf8');
    written++;
  }

  // 產生索引檔
  const indexLines = ['# 股癌逐字稿索引', ''];
  if (manifest) indexLines.push(`資料版本：\`${manifest.version}\`（建置於 ${manifest.built_at}）`, '');
  indexLines.push(`共 ${episodes.length} 集。`, '', '| 集數 | 日期 | 標題 |', '| ---: | --- | --- |');
  for (const ep of episodes) {
    const title = (ep.t || '').replace(/\|/g, '\\|');
    indexLines.push(`| [EP${ep.n}](EP${epId(ep.n)}.md) | ${ep.d || ''} | ${title} |`);
  }
  fs.writeFileSync(path.join(opts.out, 'README.md'), indexLines.join('\n') + '\n', 'utf8');

  console.log(`✓ 完成：寫入 ${written} 集，略過 ${skipped} 集（已存在），輸出於 ${opts.out}`);
}

main().catch((err) => {
  console.error('✗ 發生錯誤：', err.message || err);
  process.exit(1);
});
