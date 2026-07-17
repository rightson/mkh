# 謝孟恭方法論 · Meng Kung Methodology

> **投資核心方法論**，歸屬於《股癌》Podcast 唯一主持人 **謝孟恭** 本人
> （他多次強調「股癌」是節目名、不是他的名字）。
>
> **來源是《股癌》節目**，但內容並非他直接寫下的條列——而是把節目每一集的逐字稿，
> 經 AI **抽取 → 萃取 → 跨期綜合**後**間接推導**出的心法整理，可回查、可對照。

這個 repo 的主角是**方法論**，不是程式。程式（逐字稿抓取管線）只是把原料餵進來的
[配角](docs/scraper.md)。若你只想讀方法論，往下看 [怎麼讀](#怎麼讀) 即可。

> ⚠️ **聽眾自行整理**的非官方二次詮釋，**不是**謝孟恭本人或《股癌》的官方產出，也**不是投資建議**。
> 心法忠於逐字稿原意，但屬間接推導、逐字稿又是語音轉文字偶有誤差，一切以原始節目為準。

## 怎麼讀

- **[📘 核心方法論](methodology/核心方法論.md)**——先讀這篇。跨越全部 <!--EP_TOTAL-->~679 集<!--/EP_TOTAL-->、
  淬煉出他長期不變的骨幹原則（依五大分類），是整個 repo 的入口。
- **[🗂 分時期方法論](methodology/)**——想看他的方法**如何隨市況演變**（創始期的摸索、
  2022 熊市的風控、2023 起的 AI 大多頭…），讀 `methodology/` 底下的分期文件。
  每期一份，附時期背景、核心心法、該期特有戰術、自我檢討錄與金句。進度表見
  [`methodology/README.md`](methodology/README.md)。
- **[🎙 逐字稿原文](transcripts/)**——想查某條心法的上下文，每條都附集數出處
  （如 `EP675, EP662`），可回 `transcripts/EPxxx.md` 對照原話。
  最新一集直接點：**🆕 <!--EP_LATEST-->[EP679](transcripts/EP679.md)<!--/EP_LATEST-->**。
- **[🗂 族群圖鑑](catalog/族群圖鑑.md)**——心法談「怎麼想」，族群圖鑑記「談過什麼」：
  把全部逐字稿裡謝孟恭反覆提及的**族群（類股主題）與其代表標的**（台股＋全球並列）
  策展成分類清單。**47 族群 / 282 標的**，每族群附別稱、市場範圍、出處集數與一句 MK 觀點。
  資料源是 [`catalog/mkh_sector_catalog.json`](catalog/mkh_sector_catalog.json)（唯一真相來源），
  下游 [alpha-quant](https://github.com/rightson/alpha-quant) 交易系統以此當「族群管理器」的
  初始 import 資料（之後可在系統後台自由增修）。**標的＝『曾提及』，非投資建議、非看多或持有。**

## 分類框架

抽取與整理都依同一套五大分類（詳見
[`.claude/skills/mkh-methodology/SKILL.md`](.claude/skills/mkh-methodology/SKILL.md)）：

| 分類 | 談的是 |
| --- | --- |
| **市場判斷框架** | 如何解讀盤面：量價、族群輪動、外資動向、財報季、總經事件、多空強弱的依據 |
| **操作原則** | 進出場邏輯、加減碼、追高／攤平的條件、換股（轉倉）的時機與紀律 |
| **風控與倉位** | 停損觀念、槓桿態度、現金水位、部位大小的思考 |
| **情緒與心理** | 散戶常見錯誤、自己犯過的錯與檢討、對 FOMO／恐慌的處理 |
| **資訊處理** | 怎麼看新聞、研究報告、市場共識與雜訊的分辨 |

原則是「只收可跨個股、跨時間重複使用的思考方式」，不收單純的行情播報；業配與閒聊不入文，
**自我檢討與認錯是最高價值的內容，優先保留**。

## 方法論是怎麼長出來的

```
transcripts/EPxxx.md ──►  mkh-methodology-extractor（平行精讀，5 集一批）
                              ├─►  methodology/<時期>.md   （分時期方法論）
                              └─►  methodology/核心方法論.md（跨期淬煉的核心）
```

- 抽取流程與品質標準：[`.claude/skills/mkh-methodology/SKILL.md`](.claude/skills/mkh-methodology/SKILL.md)
- 逐集精讀的 agent 定義：[`.claude/agents/mkh-methodology-extractor.md`](.claude/agents/mkh-methodology-extractor.md)

> 抽取心法對推理品質敏感，故 extractor 的模型下限訂為 **Opus 4.8 / Fable 5（medium）起跳**，不降階。

新時期完成後，會把它與前一期對照，在「時期背景」點出方法的演變（多頭追動能 vs 空頭保守），
再更新 [`methodology/README.md`](methodology/README.md) 的進度表。

## 配角：逐字稿抓取管線

方法論要持續更新，就得有人不斷把最新一集的逐字稿餵進來。這件事交給一條會**透過 GitHub
Action 持續運行**的兩段式管線——雖是配角，但不能不在。它以「搶快 → 校對」兼顧速度與品質：

1. **`scrape.js`（搶快）**——節目上架當晚，從 Podcast RSS（Apple／Spotify 索引的同一份
   SoundOn 來源）取**第一手音檔**先轉出**臨時逐字稿**：有設定轉錄後端就下載音檔轉逐字稿，
   否則先寫節目摘要暫存。目的是讓重點最快整理出來。
2. **`fallback.js`（校對）**——約 1~2 天後、逐字稿站
   [whatmkreallysaid.com](https://whatmkreallysaid.com/)（第三方完整逐字稿）發布該集時，
   用網站版**校對覆蓋**音訊臨時版以提高品質，並補齊音訊完全拿不到的集數。

細節（用法、frontmatter、如何啟用音檔轉錄）見 **[docs/scraper.md](docs/scraper.md)**。

```bash
node scrape.js       # 搶快：Podcast 第一手音訊轉臨時稿
node fallback.js     # 校對：逐字稿站覆蓋提質、補齊缺集
```

兩支程式零外部依賴，只需 Node.js 18+。自動更新由
[`.github/workflows/update-transcripts.yml`](.github/workflows/update-transcripts.yml)
每週一、四排程執行。

## 免責聲明

逐字稿與節目內容著作權屬《股癌》Podcast 製作人謝孟恭及相關權利人所有。本專案為聽眾的
學習筆記，僅供學習與技術交流、非商業用途，且**不構成任何投資建議**。方法論為整理者對
節目內容的理解，可能有誤讀；正確內容請以原始節目為準。
