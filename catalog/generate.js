#!/usr/bin/env node
// 由 catalog/mkh_sector_catalog.json（唯一真相來源）產生 catalog/族群圖鑑.md。
// 用法：node catalog/generate.js
//
// 排版依心流原則：重點內容（標的、供應鏈）優先，關鍵屬性（MK 觀點）緊接著，
// 補充資訊（未上市備查、出處、來源/免責）後放。

const fs = require('fs');
const path = require('path');

const CATALOG = path.join(__dirname, 'mkh_sector_catalog.json');
const OUTPUT = path.join(__dirname, '族群圖鑑.md');

const data = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const { meta, sectors } = data;

const memberCount = sectors.reduce((n, s) => n + s.members.length, 0);

const ticker = (m) => `\`${m.symbol} ${m.name} (${m.market})\``;
const eps = (list) => (list && list.length ? list.join('、') : '');

// 供應鏈節點一行一項：`- 產品（公司、公司）— note（EPxxx、EPyyy）`
// 一行一節點／一行一鏈結，方便閱讀，也保留將來轉供應鏈局部 DAG 圖的結構。
function chainItem(item) {
  let line = item.product;
  if (item.companies && item.companies.length) {
    line += `（${item.companies.map((c) => `\`${c}\``).join('、')}）`;
  }
  if (item.note) line += ` — ${item.note}`;
  if (item.episodes && item.episodes.length) line += `（${eps(item.episodes)}）`;
  return line;
}

function sectorBlock(s) {
  const lines = [];
  lines.push(`### ${s.name}（${s.aliases.join('、')}）`);
  lines.push(`- **標的**：${s.members.map(ticker).join(' ｜ ')}`);

  if (s.chain && (s.chain.stages || []).some((st) => st.items.length)) {
    lines.push('- **供應鏈**（節目提及之上下游）：');
    for (const st of s.chain.stages) {
      if (!st.items.length) continue;
      lines.push(`  - **${st.stage}**`);
      for (const item of st.items) {
        lines.push(`    - ${chainItem(item)}`);
      }
    }
    if (s.chain.links && s.chain.links.length) {
      lines.push('  - **鏈結**');
      for (const l of s.chain.links) {
        let line = `    - ${l.from} → ${l.to}`;
        if (l.note) line += ` — ${l.note}`;
        if (l.episodes && l.episodes.length) line += `（${eps(l.episodes)}）`;
        lines.push(line);
      }
    }
    if (s.chain.cross_sector && s.chain.cross_sector.length) {
      lines.push('  - **跨族群**');
      for (const x of s.chain.cross_sector) {
        let line = `    - →「${x.to_sector}」`;
        if (x.note) line += ` — ${x.note}`;
        if (x.episodes && x.episodes.length) line += `（${eps(x.episodes)}）`;
        lines.push(line);
      }
    }
  }

  lines.push(`- **MK 觀點**：${s.note}`);
  if (s.unlisted && s.unlisted.length) {
    lines.push(`- **未上市（僅備查，不入成員）**：${s.unlisted.join('、')}`);
  }
  lines.push(`- **出處**：${eps(s.episodes)}`);
  return lines.join('\n');
}

const out = [];
out.push(`# ${meta.title}`);
out.push('');
out.push(
  `**${sectors.length} 族群**、**${memberCount} 標的**（\`代號 名稱 (市場)\`；台股/全球並列）。來源與免責聲明見[文末](#關於本檔)。`
);

// 依 category 分組（順序＝該類別在 JSON 中首次出現的順序；
// JSON 內同類別的 sector 不一定相鄰，需先歸戶避免類別標題重複）。
const categories = [];
const byCategory = new Map();
for (const s of sectors) {
  if (!byCategory.has(s.category)) {
    byCategory.set(s.category, []);
    categories.push(s.category);
  }
  byCategory.get(s.category).push(s);
}

for (const cat of categories) {
  out.push('');
  out.push(`## ${cat}`);
  for (const s of byCategory.get(cat)) {
    out.push('');
    out.push(sectorBlock(s));
  }
}

out.push('');
out.push('---');
out.push('');
out.push('## 關於本檔');
out.push('');
out.push(`- **來源**：${meta.source}。`);
out.push(`- **免責**：${meta.disclaimer}`);
out.push(
  '- **維護**：⚙️ 本檔由 `catalog/mkh_sector_catalog.json` 產生（勿手改本檔，改 JSON 後執行 `node catalog/generate.js` 重新輸出）；catalog JSON 是族群與標的分類清單的**唯一真相來源**。下游 alpha-quant 交易系統以此當族群管理器的初始 import 資料（之後可在系統後台自由增修族群/類股），詳見該 repo `docs/specs/mkh-sector-catalog.md`。'
);
out.push('');

fs.writeFileSync(OUTPUT, out.join('\n'));
console.log(`generated ${OUTPUT}: ${sectors.length} 族群, ${memberCount} 標的`);
