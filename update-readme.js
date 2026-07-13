#!/usr/bin/env node
'use strict';

// 依 transcripts/ 現況同步根 README 首頁的「總集數」與「最新一集」連結。
// 逐字稿管線每次跑完就呼叫本檔，讓首頁數字與最新集自動跟上，不必手動改。
//
// 冪等設計：用 HTML 註解標記（<!--NAME--> … <!--/NAME-->）包住動態片段，
// 每次只覆蓋標記之間的內容。若現況與 README 已一致，覆蓋後內容不變、
// git 也不會產生 diff，故可安全地每次執行。
//
// 只處理「總集數」與「最新一集」這兩個純機械可得的資訊；
// methodology/README.md 的抽取進度表屬 AI 抽取成果，不在此自動更新。

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TRANSCRIPTS_DIR = path.join(ROOT, 'transcripts');
const README = path.join(ROOT, 'README.md');

// 掃描 transcripts/，回傳集數與最新一集編號。
function scan() {
  const nums = fs.readdirSync(TRANSCRIPTS_DIR)
    .map(f => {
      const m = f.match(/^EP(\d+)\.md$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(n => n !== null)
    .sort((a, b) => a - b);

  if (nums.length === 0) throw new Error('transcripts/ 下找不到任何 EPxxx.md');
  return { count: nums.length, latest: nums[nums.length - 1] };
}

// 覆蓋 <!--NAME--> 與 <!--/NAME--> 之間的內容。
function replaceBetween(text, name, replacement) {
  const re = new RegExp(`(<!--${name}-->)[\\s\\S]*?(<!--/${name}-->)`);
  if (!re.test(text)) throw new Error(`README 找不到標記 <!--${name}-->…<!--/${name}-->`);
  return text.replace(re, `$1${replacement}$2`);
}

function epId(n) {
  return 'EP' + String(n).padStart(3, '0');
}

function main() {
  const { count, latest } = scan();
  const ep = epId(latest);

  const before = fs.readFileSync(README, 'utf8');
  let after = before;
  after = replaceBetween(after, 'EP_TOTAL', `~${count} 集`);
  after = replaceBetween(after, 'EP_LATEST', `[${ep}](transcripts/${ep}.md)`);

  if (after === before) {
    console.log(`README 已是最新：共 ${count} 集，最新 ${ep}`);
    return;
  }
  fs.writeFileSync(README, after);
  console.log(`README 已同步：共 ${count} 集，最新 ${ep}`);
}

main();
