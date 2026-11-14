// ==UserScript==
// @name         [x1080] 版面｜精簡（隱藏數據／簽名檔／回覆區）
// @namespace    https://github.com/kulaLin/x1080
// @version      1.3
// @description  隱藏標題下方數據按鈕、主文下方VIP簽名檔與操作列，以及底部所有回覆與編輯器區塊
// @author       James
// @match        *://*.1080xin.com/*
// @match        *://1080xin.com/*
// @match        *://*.x1080x.com/*
// @match        *://x1080x.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-clean-layout.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-clean-layout.user.js
// ==/UserScript==

(function() {
    'use strict';

    const cleanCSS = `
        /* 1. 隱藏標題區的查看/回覆統計與收藏、回覆主題按鈕 */
        .thread-header-nums,
        /* 2. 隱藏主文底部的「論壇VIP」簽名檔廣告與「回覆/引用/檢舉」按鈕列 */
        .author-signature,
        .post-foot,
        /* 3. 完全隱藏底部互動區（寫下回覆輸入框、富文本編輯器、發佈按鈕） */
        .thread-interactions,
        /* 4. 隱藏 .post-list 內除了一樓（主文）以外的所有區塊（如「還沒有回覆」與其他樓層） */
        .post-list > *:nth-child(n+2) {
            display: none !important;
        }

        /* 緊縮標題區塊間距，讓主文往上貼齊 */
        .thread-header {
            padding-bottom: 4px !important;
            margin-bottom: 4px !important;
            gap: 0 !important;
        }
    `;

    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(cleanCSS);
    } else {
        const injectStyle = () => {
            if (document.getElementById('clean-1080xin-css')) return;
            const style = document.createElement('style');
            style.id = 'clean-1080xin-css';
            style.textContent = cleanCSS;
            (document.head || document.documentElement).appendChild(style);
        };
        injectStyle();
        document.addEventListener('DOMContentLoaded', injectStyle);
    }
})();
