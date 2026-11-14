# x1080
1080xin（x1080x）相關 Tampermonkey 腳本

## 腳本列表

| 腳本 | 說明 | 安裝 |
|---|---|---|
| [x1080-magnet-notion](#x1080-magnet-notion) | BT綜合區文章右側「下載地址」面板：複製 magnet、一鍵送 Notion 後自動關閉分頁 | [安裝](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-magnet-notion.user.js) |

安裝方式：瀏覽器先裝好 [Tampermonkey](https://www.tampermonkey.net/)，再點上表的「安裝」連結。之後 repo 有新版時，Tampermonkey 會自動更新。

---

## x1080-magnet-notion

檔案：`x1080-magnet-notion.user.js`

只在「BT綜合區」（boards/7RHPO2w4jFUYiDhDsxz0wE）的文章頁顯示，提取文章內的 magnet 連結，以「下載地址」面板顯示在網頁右側。

### 功能

- 抓取頁面中所有 magnet 連結（`<a>` 連結、程式碼區塊、內文純文字），同一個 hash 自動去重
- 每條連結可「複製」或「送 Notion」；標題列可「全部複製」/「全部送 Notion」
- 傳送到 Notion 時自動略過已送過的連結（以 btih hash 比對，使用本機快取，不必每次讀取整個 Notion 頁面）
- 按下 Notion 按鈕、確認寫入成功後立即關閉分頁（約 1 秒內）；傳送失敗則保留分頁並顯示原因
- 同步寫入主頁面底下的「純 magnet 連結」子頁面（只有 magnet，一條一行；子頁面不存在會自動建立）
- 面板底部「整理 Notion」：刪除主頁面與子頁面中重複的連結（整組重複時連同標題列一起刪），把子頁面缺少的補上，並以 Notion 實際內容重建本機快取（在 Notion 手動刪掉的連結，整理後可以再次傳送）
- 點標題列可收合面板
- 網站換頁不重新載入時也會自動更新

### Notion 設定（第一次使用）

1. 到 <https://www.notion.so/profile/integrations> 建立 Internal integration，複製 token（`ntn_` 開頭）
2. 在 integration 的「內容存取權限」勾選要寫入的 Notion 頁面（或在該頁面「⋯ → 連線」加入該 integration）
3. 第一次按「送 Notion」時依提示貼上 token 和頁面網址；之後可從 Tampermonkey 選單「設定 Notion」修改
4. Tampermonkey 詢問是否允許連線到 `api.notion.com` 時選「總是允許」

token 只存在本機瀏覽器的 Tampermonkey 儲存空間，不在此 repo 中。

每次傳送會在主頁面底部新增：帖子標題（連回原帖）＋時間，以及每條新的 magnet 各一個程式碼區塊（名稱在區塊說明）；子頁面則只新增 magnet 本身。
