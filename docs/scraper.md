# 逐字稿抓取管線（配角）

本專案的主角是 [`methodology/`](../methodology/)——謝孟恭的投資方法論。
這條抓取管線是**配角**：它的唯一任務是把《股癌》每一集的逐字稿穩定地餵進
`transcripts/`，方法論才有原料可抽。配角雖然低調，但**必須存在、且透過 GitHub
Action 持續運行**，否則方法論會停在某一集。

## 兩段式「搶快 → 校對」品質接力

本專案奉「一切以原始節目為準」為圭臬。實務上分兩步兼顧**速度**與**品質**：

- **音訊搶快**：節目上架當晚，用第一手音檔（謝孟恭原音）先轉出**臨時逐字稿**，
  讓重點能最快整理出來。
- **網站校對**：約 1~2 天後、第三方逐字稿站 whatmkreallysaid.com 發布該集時，用
  網站版**校對覆蓋**臨時稿以提高品質，再據以更新重點。

```
① scrape.js   搶快  ──►  Podcast RSS（Apple / Spotify 索引的同一份 SoundOn RSS）
                          ├─ 有設定轉錄後端：下載音檔 → Whisper 轉臨時逐字稿
                          └─ 沒有設定：寫「節目摘要 (show notes) stub」暫存缺集
                                     │  1~2 天後逐字稿站發布↓
② fallback.js 校對  ──►  whatmkreallysaid.com 逐字稿資料包（第三方完整逐字稿）
                          用網站版校對覆蓋音訊臨時版以提質；已是網站版／既有正式版不動。
```

### ① `scrape.js`——Podcast 第一手音訊（搶快）

謝孟恭的原音就是節目本身，最快可得，故用來搶快出臨時稿。這支程式：

1. 解析《股癌》Podcast RSS（Apple Podcasts 與 Spotify 都索引同一份 RSS，本節目託管
   於 SoundOn；程式先用 iTunes lookup 取得目前 feedUrl，失敗才退回已知 URL）。取得每集
   的集數、標題、發布日、節目摘要與**音檔 URL**。
2. 找出「RSS 有、但 `transcripts/` 還沒有（或只有待補音檔的 stub）」的最新缺集。
3. 對缺集：
   - **有設定轉錄後端**：下載音檔 → 呼叫 OpenAI 相容的 `/audio/transcriptions` →
     寫入音檔轉錄的逐字稿（frontmatter 標 `source_type: podcast-audio`、
     `transcript_status: audio-transcribed`）。此為搶快臨時版，待逐字稿站發布後由
     `fallback.js` 用網站版校對覆蓋提質。
   - **沒有設定**：用 RSS 的節目摘要寫一份待補 stub（`transcript_status: pending-audio`），
     並在 frontmatter 保留 `audio_url`，等日後設定轉錄後端或由 `fallback.js` 逐字稿站補上再升級。

> 沒有任何 secret 也能持續運行（退化為摘要 stub），這樣 Action 才穩定不中斷；
> 有 secret 時才做真正的 audio → 逐字稿。

```bash
node scrape.js                # 掃描並補最新缺集（預設最多 5 集）
node scrape.js --limit 3      # 最多只補最新的 N 集
node scrape.js --dry-run      # 只印出會補哪些集，不寫檔
```

音訊逐字稿檔的 frontmatter 額外欄位：

| 欄位 | 說明 |
| --- | --- |
| `source_type: podcast-audio` | 第一手音訊搶快臨時版；待網站版校對覆蓋提質 |
| `transcript_status` | `pending-audio`（僅摘要）或 `audio-transcribed`（已轉錄） |
| `audio_url` | Podcast 音檔連結，供日後轉錄 |

#### 啟用音檔轉錄（可選）

在 repo 的 **Settings → Secrets and variables → Actions** 加入：

| Secret | 說明 | 預設 |
| --- | --- | --- |
| `TRANSCRIBE_API_KEY` | OpenAI 相容語音轉文字金鑰（OpenAI 或 Groq 皆可） | 必填才會啟用轉錄 |
| `TRANSCRIBE_API_URL` | 端點 | `https://api.openai.com/v1/audio/transcriptions` |
| `TRANSCRIBE_MODEL` | 模型（Groq 可用 `whisper-large-v3`） | `whisper-1` |
| `TRANSCRIBE_MAX_MB` | 單檔上限（MB）；後端上限較高時可調大 | `24` |

> ⚠️ **25MB 上限**：多數 Whisper API 單檔上限為 25MB，而股癌單集約 40–70 分鐘、
> MP3 常達 28–58MB，會超過上限而退回 stub。若你的轉錄後端支援更大檔案，用
> `TRANSCRIBE_MAX_MB` 調高即可讓整集音檔轉錄；否則該集只留 stub，等校對步驟用逐字稿站補上。
> 音檔切段轉錄（切成 <25MB 分段再拼接）保留為未來選項——它需要 `ffmpeg` 之類的
> 外部依賴，與本專案「零外部依賴」的原則相衝，故暫不內建。

> YouTube 也是可行的音檔來源，但需額外依賴（如 `yt-dlp`）下載；目前搶快以 Podcast RSS
> 為主（已同時涵蓋 Apple 與 Spotify），YouTube 保留為手動／未來選項。

### ② `fallback.js`——逐字稿站校對（校對）

音訊搶快出的是臨時稿（Whisper 有辨識誤差；無後端或音檔超過 25MB 時甚至只有 stub）。
約 1~2 天後逐字稿站 [whatmkreallysaid.com](https://whatmkreallysaid.com/) 發布該集，
本程式就用網站版**校對覆蓋**臨時稿以提質，並補齊音訊完全拿不到的集數。該站是純前端
渲染，但**並非**每集一支 API：整站建立在一份 brotli 壓縮的
`/transcripts.json.br` 資料包之上（所有集數的逐字稿 JSON 陣列）。所以本程式直接抓
這份官方資料包、解壓縮後逐集輸出，只送一個請求，對站方最友善，也不需要 headless
browser。

覆蓋規則（音訊搶快、網站校對提質）：

| 本地現況 | 校對行為 |
| --- | --- |
| 沒有該集 | 用網站版補上 |
| 音訊搶快臨時版（`source_type: podcast-audio`，含 `pending-audio` stub 與 `audio-transcribed`） | 用網站版校對覆蓋提質 |
| 已是網站校對版（`transcript-site`）／既有正式版 | 保留，不重複覆蓋 |
| `--force` | 一律以網站版覆寫 |

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
node fallback.js                 # 校對覆蓋音訊臨時版、補齊缺集，輸出到 ./transcripts
node fallback.js --out ./out     # 自訂輸出目錄
node fallback.js --force         # 即使檔案已存在也用網站版覆寫
```

## 輸出

- `transcripts/EP001.md` … `transcripts/EPxxx.md`：每集一份，含 YAML frontmatter
  ＋摘要＋逐字稿。集數補零至三碼，方便依檔名排序。
- `transcripts/README.md`：`fallback.js` 依逐字稿站資料包（涵蓋全集）自動產生的索引表。

兩支程式都零外部依賴，只用 Node.js 18+ 內建的 `fetch` / `zlib` / `FormData`。

## 自動更新

[`.github/workflows/update-transcripts.yml`](../.github/workflows/update-transcripts.yml)
依兩個節奏自動依序跑 `scrape.js`（音訊搶快）與 `fallback.js`（逐字稿站校對）：

- **音訊搶快**：台灣週三、週六晚 22:00（節目上架當晚，先出臨時稿）。
- **網站校對**：台灣週一、週五晚 22:00（約晚 1~2 天，逐字稿站發布後校對提質）。

兩支每次都跑（皆為冪等），有變更就以 `github-actions[bot]` 身分 commit 並 push；也可在
Actions 頁面手動觸發。需要不同頻率時，調整 workflow 內的 `cron` 即可。

> 排程（`cron`）只依 **default branch（main）** 上的設定執行，改動需合併進 main 才生效。

> 自動 commit 需要 workflow 具備 `contents: write` 權限（已於檔內設定）。若 push 被擋，
> 請至 repo 的 **Settings → Actions → General → Workflow permissions** 開啟
> 「Read and write permissions」。
