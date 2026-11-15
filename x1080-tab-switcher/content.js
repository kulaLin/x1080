// x1080 分頁切換：內容腳本
// 油猴腳本無法切換分頁，所以由它在網頁上發出事件，這裡收到後轉給背景程式處理。
// 油猴腳本與擴充功能跑在不同的執行環境，但共用同一份 DOM，所以用 DOM 事件與屬性溝通。

(function () {
    'use strict';

    // 標記「擴充功能已安裝」，油猴腳本看到這個屬性才會要求切換分頁，沒裝就維持原本行為
    document.documentElement.setAttribute('data-x1080-tab-switcher', chrome.runtime.getManifest().version);

    function relay(action) {
        try {
            chrome.runtime.sendMessage({ action }).catch(() => { /* 背景程式沒回應就算了 */ });
        } catch (e) {
            // 擴充功能被重新載入後，舊分頁裡的這段程式會失效；重新整理分頁即可恢復
        }
    }

    // 切換到右邊的分頁
    document.addEventListener('x1080-tab-switcher:next', () => relay('next'));
    // 回到發出事件的這個分頁（例如點了「傳送失敗」通知）
    document.addEventListener('x1080-tab-switcher:focus', () => relay('focus'));
})();
