# 股癌逐字稿抓取 (gooaye-transcripts)

抓取 [whatmkreallysaid.com](https://whatmkreallysaid.com/)（股癌 Podcast 非官方逐字稿站）
的所有逐字稿，每一集輸出成一份獨立的 Markdown 檔。

## 運作原理

該網站雖然是純前端 (JS) 渲染，但**並非**每集一支 API。整站的搜尋／瀏覽都建立在
一份單一資料包之上：頁面載入時會抓取 brotli 壓縮的 `/transcripts.json.br`，
裡面就是所有集數的逐字稿 JSON 陣列。

所以本程式直接抓這份官方資料包、解壓縮後逐集輸出，不需要 headless browser，
也只送出一個請求，對站方最友善。

資料欄位（每集）：

| 欄位 | 說明 |
| --- | --- |
| `n` | 集數 |
| `t` | 標題 |
| `d` | 日期 (ISO，少數集數缺) |
| `dt` | 日期顯示字串 |
| `desc` | 摘要 |
| `tx` | 逐字稿全文 |

## 使用方式

需要 Node.js 18+（用到內建 `fetch` 與 `zlib.brotliDecompressSync`，**零外部依賴**）。

```bash
node scrape.js                 # 輸出到 ./transcripts
node scrape.js --out ./out     # 自訂輸出目錄
node scrape.js --force         # 即使檔案已存在也重新覆寫
```

## 輸出

- `transcripts/EP1.md` … `transcripts/EP674.md`：每集一份，含 YAML frontmatter
  （集數、標題、日期、來源網址）＋摘要＋逐字稿。檔名與網站一致（不補零）。
- `transcripts/README.md`：自動產生的索引表（集數、日期、標題、連結）。

預設會略過已存在的檔案（增量更新）；要全部重抓請加 `--force`。

## 免責聲明

逐字稿原始內容著作權屬《股癌》Podcast 製作人及相關權利人所有，本專案僅供學習與
技術交流，非商業用途。正確內容請以原始音訊為準。
