# 逐字稿抓取管線（配角）

本專案的主角是 [`methodology/`](../methodology/)——謝孟恭的投資方法論。
這條抓取管線是**配角**：它的唯一任務是把《股癌》每一集的逐字稿穩定地餵進
`transcripts/`，方法論才有原料可抽。配角雖然低調，但**必須存在、且透過 GitHub
Action 持續運行**，否則方法論會停在某一集。

## 兩段式抓法

管線分兩段，先主後備，確保「逐字稿站落後時也不漏新集」：

```
① scrape.js   主抓  ──►  whatmkreallysaid.com 逐字稿資料包（完整逐字稿）
                                     │  逐字稿站還沒收錄最新一集時↓
② fallback.js 備援  ──►  Podcast RSS（Apple / Spotify 索引的同一份 SoundOn RSS）
                          ├─ 有設定轉錄後端：下載音檔 → Whisper 轉逐字稿
                          └─ 沒有設定：寫「節目摘要 (show notes) stub」暫存缺集
```

逐字稿站日後補上該集後，下一次 `scrape.js` 會自動用正式版**覆蓋備援 stub**
（靠 frontmatter 的 `source_type: podcast-fallback` 辨識）。

### ① `scrape.js`——逐字稿站主抓

[whatmkreallysaid.com](https://whatmkreallysaid.com/)（《股癌》非官方逐字稿站）
是純前端渲染，但**並非**每集一支 API：整站建立在一份 brotli 壓縮的
`/transcripts.json.br` 資料包之上（所有集數的逐字稿 JSON 陣列）。所以本程式直接抓
這份官方資料包、解壓縮後逐集輸出，只送一個請求，對站方最友善，也不需要 headless
browser。

資料欄位（每集）：

| 欄位 | 說明 |
| --- | --- |
| `n` | 集數 |
| `t` | 標題 |
| `d` | 日期 (ISO，少數集數缺) |
| `dt` | 日期顯示字串 |
| `desc` | 摘要 |
| `tx` | 逐字稿全文 |

```bash
node scrape.js                 # 輸出到 ./transcripts
node scrape.js --out ./out     # 自訂輸出目錄
node scrape.js --force         # 即使檔案已存在也重新覆寫
```

### ② `fallback.js`——Podcast 備援

逐字稿站偶爾落後於節目——最新一集已上架 Podcast、逐字稿站還沒補上。這支程式補這個洞：

1. 解析《股癌》Podcast RSS（Apple Podcasts 與 Spotify 都索引同一份 RSS，本節目託管
   於 SoundOn；程式先用 iTunes lookup 取得目前 feedUrl，失敗才退回已知 URL）。取得每集
   的集數、標題、發布日、節目摘要與**音檔 URL**。
2. 找出「RSS 有、但 `transcripts/` 還沒有（或只有待補音檔的備援 stub）」的最新缺集。
3. 對缺集：
   - **有設定轉錄後端**：下載音檔 → 呼叫 OpenAI 相容的 `/audio/transcriptions` →
     寫入音檔轉錄的逐字稿（frontmatter 標 `transcript_status: audio-transcribed`）。
   - **沒有設定**：用 RSS 的節目摘要寫一份備援 stub（`transcript_status: pending-audio`），
     並在 frontmatter 保留 `audio_url`，等逐字稿站補上或日後設定轉錄後端再升級。

> 沒有任何 secret 也能持續運行（退化為摘要 stub），這樣 Action 才穩定不中斷；
> 有 secret 時才做真正的 audio → 逐字稿。

```bash
node fallback.js               # 掃描並補最新缺集（預設最多 5 集）
node fallback.js --limit 3     # 最多只補最新的 N 集
node fallback.js --dry-run     # 只印出會補哪些集，不寫檔
```

備援檔的 frontmatter 額外欄位：

| 欄位 | 說明 |
| --- | --- |
| `source_type: podcast-fallback` | 標記為備援；`scrape.js` 據此覆蓋為正式版 |
| `transcript_status` | `pending-audio`（僅摘要）或 `audio-transcribed`（已轉錄） |
| `audio_url` | Podcast 音檔連結，供日後轉錄 |

#### 啟用音檔轉錄（可選）

在 repo 的 **Settings → Secrets and variables → Actions** 加入：

| Secret | 說明 | 預設 |
| --- | --- | --- |
| `TRANSCRIBE_API_KEY` | OpenAI 相容語音轉文字金鑰（OpenAI 或 Groq 皆可） | 必填才會啟用轉錄 |
| `TRANSCRIBE_API_URL` | 端點 | `https://api.openai.com/v1/audio/transcriptions` |
| `TRANSCRIBE_MODEL` | 模型（Groq 可用 `whisper-large-v3`） | `whisper-1` |

> YouTube 也是可行的音檔來源，但需額外依賴（如 `yt-dlp`）下載；目前備援以 Podcast RSS
> 為主（已同時涵蓋 Apple 與 Spotify），YouTube 保留為手動／未來選項。

## 輸出

- `transcripts/EP001.md` … `transcripts/EPxxx.md`：每集一份，含 YAML frontmatter
  ＋摘要＋逐字稿。集數補零至三碼，方便依檔名排序。
- `transcripts/README.md`：`scrape.js` 依逐字稿站資料自動產生的索引表。

兩支程式都零外部依賴，只用 Node.js 18+ 內建的 `fetch` / `zlib` / `FormData`。

## 自動更新

[`.github/workflows/update-transcripts.yml`](../.github/workflows/update-transcripts.yml)
在每週一、四（UTC）自動依序跑 `scrape.js` 與 `fallback.js`，有新集數就以
`github-actions[bot]` 身分 commit 並 push；也可在 Actions 頁面手動觸發。需要不同頻率
時，調整 workflow 內的 `cron` 即可。

> 自動 commit 需要 workflow 具備 `contents: write` 權限（已於檔內設定）。若 push 被擋，
> 請至 repo 的 **Settings → Actions → General → Workflow permissions** 開啟
> 「Read and write permissions」。
