# x1080
1080xin 磁力連結面板（Tampermonkey 腳本）

自動提取 1080xin.com「BT綜合區」（boards/7RHPO2w4jFUYiDhDsxz0wE）文章內的 magnet 連結，以「下載地址」面板顯示在網頁右側；其他頁面不顯示，可複製或一鍵傳送到 Notion 頁面。

## 安裝

1. 瀏覽器先安裝 [Tampermonkey](https://www.tampermonkey.net/)
2. 點這個連結安裝腳本：
   [1080xin-magnet-panel.user.js](https://raw.githubusercontent.com/kulaLin/x1080/main/1080xin-magnet-panel.user.js)
3. 之後此 repo 有新版時，Tampermonkey 會自動更新

## 功能

- 抓取頁面中所有 magnet 連結（`<a>` 連結、程式碼區塊、內文純文字），同一個 hash 自動去重
- 每條連結可「複製」或「送 Notion」；標題列可「全部複製」/「全部送 Notion」
- 傳送到 Notion 時自動略過已送過的連結（以 btih hash 比對，使用本機快取，不必每次讀取整個 Notion 頁面）
- 按下 Notion 按鈕、確認寫入成功後立即關閉分頁（約 1 秒內）；傳送失敗則保留分頁並顯示原因
- 同步寫入主頁面底下的「純 magnet 連結」子頁面（只有 magnet，一條一行；子頁面不存在會自動建立）
- 面板底部「整理 Notion」：刪除主頁面與子頁面中重複的連結（整組重複時連同標題列一起刪），把子頁面缺少的補上，並以 Notion 實際內容重建本機快取（在 Notion 手動刪掉的連結，整理後可以再次傳送）
- 點標題列可收合面板
- 動態載入的內容也會自動更新

## Notion 設定（第一次使用）

1. 到 <https://www.notion.so/profile/integrations> 建立 Internal integration，複製 token（`ntn_` 開頭）
2. 打開要寫入的 Notion 頁面 → 右上角「⋯ → 連線（Connections）」→ 加入該 integration
3. 第一次按「送 Notion」時依提示貼上 token 和頁面網址；之後可從 Tampermonkey 選單「設定 Notion」修改
4. Tampermonkey 詢問是否允許連線到 `api.notion.com` 時選「總是允許」

token 只存在本機瀏覽器的 Tampermonkey 儲存空間，不在此 repo 中。

每次傳送會在主頁面底部新增：帖子標題（連回原帖）＋時間，以及每條新的 magnet 各一個程式碼區塊（名稱在區塊說明）；子頁面則只新增 magnet 本身。
