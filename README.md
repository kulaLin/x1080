# x1080
1080xin（x1080x）相關 Tampermonkey 腳本

## 腳本列表

| Tampermonkey 名稱 | 檔案 | 說明 | 安裝 |
|---|---|---|---|
| [x1080] 下載｜磁力連結面板＋Notion | [x1080-magnet-notion](#x1080-magnet-notion) | BT綜合區文章右側「下載地址」面板：複製 magnet、一鍵送 Notion 後自動關閉分頁 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-magnet-notion.user.js) |
| [x1080] 下載｜附件連結一鍵提取 | [x1080-attachment-extract](#x1080-attachment-extract) | 附件「按次數下載」一鍵全部點擊，攔截真實下載網址與 Token，完成後自動關閉分頁 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js) |
| [x1080] 版面｜附件區塊右側懸浮 | [x1080-attachment-panel](#x1080-attachment-panel) | 附件區塊改為右側懸浮、垂直排列、透明背景，下載按鈕移到最底部 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js) |
| [x1080] 版面｜精簡（隱藏數據／簽名檔／回覆區） | [x1080-clean-layout](#x1080-clean-layout) | 隱藏標題下方數據、簽名檔廣告、操作列與底部回覆區 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-clean-layout.user.js) |
| [x1080] 瀏覽｜已開連結標記 | [x1080-visited-marker](#x1080-visited-marker) | 自行記錄開過的連結並淡化＋打勾，不依賴瀏覽器 :visited（Linkclump 大量開啟也有效） | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-visited-marker.user.js) |
| [x1080] 瀏覽｜板塊新文章通知 | [x1080-board-watch](#x1080-board-watch) | 定時檢查關注的板塊，有新文章就用 Telegram 與桌面通知提醒 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-board-watch.user.js) |

安裝方式：瀏覽器先裝好 [Tampermonkey](https://www.tampermonkey.net/)，再點上表的「安裝」連結。之後 repo 有新版時，Tampermonkey 會自動更新。

### 命名與版本規範

新增或修改腳本時一律照這個規範。

| 項目 | 規則 | 範例 |
|---|---|---|
| Tampermonkey 名稱（`@name`） | `[x1080] 類別｜功能`，功能約 12 字內，細節寫在 `@description` | `[x1080] 下載｜附件連結一鍵提取` |
| 類別 | 只用三種：**下載**（取得連結、下載、送出）、**版面**（改外觀、隱藏、移位）、**瀏覽**（標記、導覽、閱讀輔助） | |
| 檔名 | `x1080-對象-功能.user.js`，全小寫英文、用 `-` 連接 | `x1080-attachment-extract.user.js` |
| `@namespace` | 固定 `https://github.com/kulaLin/x1080` | |
| 版本號 | 主版.次版.修正：修 bug → 第三碼 +1；加功能或改名稱等外觀資訊 → 第二碼 +1；大改 → 第一碼 +1；只改註解不升版 | 4.4 → 4.4.1 / 4.5 / 5.0 |
| 已知問題 | 程式碼內用 `// [已知問題] YYYY-MM-DD` 註解，README 對應段落同步記錄 | |
| 設定值 | 放在腳本開頭的常數或 `CONFIG`，要改請改 repo 檔案（在 Tampermonkey 編輯器改會被自動更新覆蓋） | |

> Tampermonkey 用「`@name` + `@namespace`」辨認同一支腳本。這兩個值一改，就會被當成新腳本，原本存在腳本裡的資料（Notion token、已開記錄等）不會帶過去，改之前要先備份。

### 腳本之間的已知衝突（待確認）

- **x1080-magnet-notion 與 x1080-attachment-panel 位置重疊**（2026-11-15 記錄）：兩者都固定在畫面右側。「下載地址」面板在 top 200px、寬 340px；附件懸浮區塊在 top 260px、寬 280px。同一篇 BT綜合區文章同時有 magnet 與附件時會疊在一起，「下載地址」面板層級較高，會蓋住附件區塊。實際遇到後再決定：其中一個往下移、改到左側，或自動錯開。兩支腳本內都有「[已知問題]」註解標示位置設定處。

---

## x1080-magnet-notion

檔案：`x1080-magnet-notion.user.js`（Tampermonkey 名稱：[x1080] 下載｜磁力連結面板＋Notion）

> 已知衝突：與 x1080-attachment-panel 的右側面板位置重疊，見上方「腳本之間的已知衝突」。

只在「BT綜合區」（boards/7RHPO2w4jFUYiDhDsxz0wE）的文章頁顯示，提取文章內的 magnet 連結，以「下載地址」面板顯示在網頁右側。

### 功能

- 抓取頁面中所有 magnet 連結（`<a>` 連結、程式碼區塊、內文純文字），同一個 hash 自動去重
- 每條連結可「複製」或「送 Notion」；標題列可「全部複製」/「全部送 Notion」
- 傳送到 Notion 時自動略過已送過的連結（以 btih hash 比對，使用本機快取，不必每次讀取整個 Notion 頁面）
- 按下 Notion 按鈕、確認寫入成功後倒數 5 秒關閉分頁；倒數期間可按「取消關閉」或 Esc 取消；傳送失敗則保留分頁並顯示原因
- 同步寫入主頁面底下的「純 magnet 連結」子頁面（只有 magnet，一條一行；子頁面不存在會自動建立）
- 面板底部「整理 Notion」：刪除主頁面與子頁面中重複的連結（整組重複時連同標題列一起刪），把子頁面缺少的補上，並以 Notion 實際內容重建本機快取（在 Notion 手動刪掉的連結，整理後可以再次傳送）
- 點標題列可收合面板
- 網站換頁不重新載入時也會自動更新

### 設定（腳本開頭的常數）

| 常數 | 預設 | 說明 |
|---|---|---|
| `AUTO_CLOSE_TAB` | `true` | 送 Notion 成功後是否自動關閉分頁 |
| `CLOSE_DELAY_MS` | `5000` | 成功後等幾毫秒再關閉（倒數期間可取消） |

> 注意：要改設定請改 repo 裡的檔案。直接在 Tampermonkey 編輯器改，下次自動更新時會被覆蓋。

### Notion 設定（第一次使用）

1. 到 <https://www.notion.so/profile/integrations> 建立 Internal integration，複製 token（`ntn_` 開頭）
2. 在 integration 的「內容存取權限」勾選要寫入的 Notion 頁面（或在該頁面「⋯ → 連線」加入該 integration）
3. 第一次按「送 Notion」時依提示貼上 token 和頁面網址；之後可從 Tampermonkey 選單「設定 Notion」修改
4. Tampermonkey 詢問是否允許連線到 `api.notion.com` 時選「總是允許」

token 只存在本機瀏覽器的 Tampermonkey 儲存空間，不在此 repo 中。

每次傳送會在主頁面底部新增：帖子標題（連回原帖）＋時間，以及每條新的 magnet 各一個程式碼區塊（名稱在區塊說明）；子頁面則只新增 magnet 本身。

---

## x1080-attachment-extract

檔案：`x1080-attachment-extract.user.js`（Tampermonkey 名稱：[x1080] 下載｜附件連結一鍵提取）

頁面上有「按次數下載」按鈕時，右下角出現「⚡ 一鍵提取下載連結 (N)」按鈕。

### 功能

- 一鍵依序點擊頁面上所有「按次數下載」按鈕（每個間隔 1.5 秒）
- 攔截網站的下載 API 回應，取得真實下載網址與 Download Token，顯示在右下角面板（預設收合成「🎯 已攔截 N 筆」小按鈕），可一鍵複製全部
- 每個附件都拿到 Download Token 後自動關閉分頁；倒數期間再按一次按鈕可取消關閉
- 超過 20 秒仍有附件沒完成，就不自動關閉，並顯示完成幾個

### 設定（腳本開頭的常數）

| 常數 | 預設 | 說明 |
|---|---|---|
| `BLOCK_AUTO_DOWNLOAD` | `false` | `true` = 只抓網址、不讓瀏覽器下載 |
| `SHOW_PANEL_BY_DEFAULT` | `false` | 攔截面板是否預設展開 |
| `AUTO_CLOSE_TAB` | `true` | 完成後是否自動關閉分頁 |
| `CLOSE_DELAY_MS` | `100` | 全部完成後等幾毫秒關閉分頁 |
| `WAIT_TIMEOUT_MS` | `20000` | 最多等幾毫秒讓所有附件完成，超時就不關閉 |

> 注意：要改設定請改 repo 裡的檔案。直接在 Tampermonkey 編輯器改，下次自動更新時會被覆蓋。

### 已知問題（待改版）

- **同一分頁切換文章時，一鍵提取按鈕不會更新**（2026-11-15 記錄）：網站換頁不會重新載入，懸浮按鈕只在第一次出現時記住當頁的下載按鈕，換到其他文章後，數量與點擊對象仍停留在第一篇，點了會等到超時；換到沒有附件的頁面時按鈕也不會消失。每篇文章開新分頁使用則不受影響。詳細原因與修正方向見腳本內「[已知問題]」註解。

---

## x1080-clean-layout

檔案：`x1080-clean-layout.user.js`（Tampermonkey 名稱：[x1080] 版面｜精簡（隱藏數據／簽名檔／回覆區））

適用網域：1080xin.com、x1080x.com（含子網域）。以 CSS 在頁面載入前就隱藏，不會閃一下才消失。

### 隱藏的區塊

| 區塊 | CSS 選擇器 |
|---|---|
| 標題區的查看／回覆統計、收藏與回覆主題按鈕 | `.thread-header-nums` |
| 主文底部「論壇VIP」簽名檔廣告 | `.author-signature` |
| 主文底部「回覆／引用／檢舉」按鈕列 | `.post-foot` |
| 底部互動區（回覆輸入框、編輯器、發佈按鈕） | `.thread-interactions` |
| 一樓（主文）以外的所有樓層與「還沒有回覆」 | `.post-list > *:nth-child(n+2)` |

另外縮小 `.thread-header` 的間距，讓主文往上貼齊。網站改版、class 名稱變動時，對照上表修改即可。

---

## x1080-attachment-panel

檔案：`x1080-attachment-panel.user.js`（Tampermonkey 名稱：[x1080] 版面｜附件區塊右側懸浮）

> 已知衝突：與 x1080-magnet-notion 的右側面板位置重疊，見上方「腳本之間的已知衝突」。

把文章內的附件區塊（`section.attachments-section`）固定在畫面右側，改成垂直排列、透明背景。網站原本的下載按鈕完整保留，只是移到最底部。

### 功能

- 附件區塊懸浮在畫面右側（寬 280px），內容過長時可在區塊內捲動
- 所有內層容器改為單欄垂直排列，檔名完整橫向顯示，不會被擠成直條
- 「按次數下載／下載」按鈕移到區塊最底部並填滿整行
- 隱藏「各身份價格」按鈕、「下載說明」連結與 RAR 圖示
- 網站動態載入或換頁時自動重新套用

### 設定（腳本開頭的常數）

| 常數 | 預設 | 說明 |
|---|---|---|
| `TOP_OFFSET` | `'260px'` | 懸浮區塊距離畫面頂端的高度，數字越大越往下 |
| `BG_OPACITY` | `0` | 背景不透明度：`0` = 完全透明，`0.2` = 微透黑底 |
| `BLUR_PX` | `'8px'` | 毛玻璃模糊程度：`'0px'` = 不模糊，`'8px'` = 微毛玻璃 |

> 注意：要改設定請改 repo 裡的檔案。直接在 Tampermonkey 編輯器改，下次自動更新時會被覆蓋。

---

## x1080-visited-marker

檔案：`x1080-visited-marker.user.js`（Tampermonkey 名稱：[x1080] 瀏覽｜已開連結標記）

不問瀏覽器「這個連結造訪過沒有」，而是每個頁面載入時把自己的網址記進腳本的儲存空間，清單頁再比對這份記錄，命中的連結就淡化並加上 ✓。因此不受 Chromium `:visited` 分區化影響，用 Linkclump、中鍵、Ctrl+點擊大量開啟的分頁也會被標記。

適用網域：1080xin.com、agaghhh.cc（舊網域，記錄共用）。

### 快捷鍵

| 按鍵 | 動作 |
|---|---|
| Alt + 點擊連結 | 單獨切換該連結的已開標記（不會開啟頁面） |
| Alt + M | 把滑鼠選取範圍內的連結全部標記為已開 |
| Alt + U | 把選取範圍內的連結取消標記 |
| Alt + O | 用頁內點擊開啟選取範圍內尚未標記的連結（需允許此站「快顯視窗」，單次最多 60 個） |

### Tampermonkey 選單

開啟／關閉標記顯示、把本頁所有連結標記為已開、匯出記錄、匯入記錄（與現有合併）、清除全部記錄、顯示本頁的比對鍵值（除錯用）、重跑舊網域記錄轉換。

### 設定

腳本開頭的 `CONFIG` 物件，可調整標記外觀（透明度、顏色、✓ 記號、整列淡化）、網址正規化規則（`DROP_PARAMS` 等）、記錄規則與保留上限（預設 20,000 筆）。

> 注意：要改設定請改 repo 裡的檔案。直接在 Tampermonkey 編輯器改，下次自動更新時會被覆蓋。

> 記錄存在 Tampermonkey 這支腳本的儲存空間。從 GitHub 安裝時若被當成「新腳本」而不是「更新」（例如 `@name` 或 `@namespace` 改過），會是一份全新的空記錄，所以安裝前先用選單「匯出記錄」備份，裝好後再「匯入記錄」。

### 已知問題（待改版）

- **同一篇文章因網址參數不同被當成多筆**（2026-11-15 記錄）：網站文章網址為 `/resources/<id>`，但列表上的連結帶 `?return=…`（依來源列表而不同），進入文章後網址列變成 `?page=1&order=asc`。比對鍵值會把這些參數算進去，所以從不同列表頁進同一篇文章，可能不會互相顯示「已開」。修正方向是比對時只看文章 id，並把現有記錄一次轉換合併。詳細原因與修正方向見腳本 `keyOf()` 上方的「[已知問題]」註解。

---

## x1080-board-watch

檔案：`x1080-board-watch.user.js`（Tampermonkey 名稱：[x1080] 瀏覽｜板塊新文章通知）

網站沒有 RSS，也沒有「關注板塊」功能，而且不帶登入狀態的請求會被 Cloudflare 擋下（403），所以不能放在伺服器上排程檢查。這支腳本改在已登入的瀏覽器裡執行：定時讀取關注的板塊，跟已看過的文章比對，有新文章就通知。

### 運作方式

- 每 10 分鐘讀一次關注的板塊（每個板塊之間間隔 3 秒）
- 第一次執行只記錄現有文章，不通知；之後只通知沒看過的文章（置頂公告也只在第一次被記錄）
- 通知：Telegram（標題＋連結，可點開）＋ Windows 桌面通知（點擊開啟文章）；同一板塊一次超過 3 篇時，桌面通知合併成一則
- 同時開多個 1080xin 分頁時，只有一個分頁負責檢查，不會重複通知
- 讀取失敗（例如登入過期、網站驗證）或網站版面改變時，最多每 6 小時提醒一次

### 限制

- **需保留至少一個 1080xin 分頁開著**（建議釘選）；電腦睡眠或 Chrome 關閉時不會檢查，恢復後的下一次檢查會補上
- 兩次檢查之間某板塊新文章超過一整頁（約 23 篇）時，可能漏掉被擠到第二頁的文章，通知會註明「可能還有更多」

### 第一次使用

1. 從上方腳本列表安裝
2. Tampermonkey 選單 →「設定 Telegram（bot token 與 chat id）」，依序貼上 bot token（向 @BotFather 取得）與自己的 chat id
3. 選單 →「測試 Telegram 通知」，確認手機收到訊息
4. 選單 →「立即檢查」，第一次會記錄各板塊現有文章；之後每 10 分鐘自動檢查

Telegram token 與 chat id 只存在本機 Tampermonkey 中，不在此 repo。

### Tampermonkey 選單

立即檢查、顯示監控狀態、暫停／恢復監控、設定 Telegram、測試 Telegram 通知、重設已看過的文章（下次只記錄不通知）。

### 設定（腳本開頭的常數）

| 常數 | 預設 | 說明 |
|---|---|---|
| `BOARDS` | 高清有碼、外挂字幕、亞洲SM、BT綜合區（無碼HD） | 關注的板塊名稱與網址，可帶 `category_id` 篩選分類 |
| `CHECK_INTERVAL_MIN` | `10` | 幾分鐘檢查一次 |
| `NOTIFY_TELEGRAM` | `true` | 是否用 Telegram 通知 |
| `NOTIFY_DESKTOP` | `true` | 是否用桌面通知 |
| `TELEGRAM_SHOW_TITLES` | `true` | Telegram 是否列出標題；`false` 只通知「某板塊有 N 篇新文章」，手機鎖定畫面比較不會露出標題 |
| `GAP_BETWEEN_BOARDS_MS` | `3000` | 讀取各板塊之間的間隔 |

> 注意：要改設定請改 repo 裡的檔案。直接在 Tampermonkey 編輯器改，下次自動更新時會被覆蓋。
