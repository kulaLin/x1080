// ==UserScript==
// @name         [x1080] 版面｜附件區塊右側懸浮
// @namespace    https://github.com/kulaLin/x1080
// @version      4.6
// @description  將 attachments-section 改為右側垂直排列、透明背景、下載按鈕徹底移至最底部、檔名完整橫排顯示、隱藏各身份價格階梯，100%保留原生按鈕
// @match        *://*.1080xin.com/*
// @match        *://1080xin.com/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ★ 在這裡自由微調懸浮窗距離頂部的高度（數字越大越往下）
    const TOP_OFFSET = '260px';
    // [已知問題] 2026-11-15 記錄，待實際確認後調整
    // 與 x1080-magnet-notion 的「下載地址」面板位置重疊（該面板在右側 top:200px、寬 340px、z-index 較高）。
    // 同一篇文章同時有 magnet 與附件時，本區塊會被蓋住。調整方向：改這裡的 TOP_OFFSET、改到左側，或兩者自動錯開。
    // ★ 背景不透明度：0 = 完全透明，0.2 = 微透黑底
    const BG_OPACITY = 0;
    // ★ 毛玻璃模糊程度：'0px' = 完全無模糊穿透，'8px' = 微毛玻璃（防背景文字干擾閱讀）
    const BLUR_PX = '8px';

    const cssText = `
        /* 1. 保底：維持原本成功的 Flex 置頂結構 */
        #first-post .post-content .post-text,
        .post-content .post-text {
            display: flex !important;
            flex-direction: column !important;
        }

        /* 2. 將附件區塊固定在右側偏下方（避開標題）+ 透明背景 + 垂直排列 */
        .post-text > section.attachments-section,
        section.attachments-section {
            order: -1 !important;
            position: fixed !important;
            top: ${TOP_OFFSET} !important;
            right: 16px !important;
            width: 280px !important;
            max-height: calc(100vh - ${TOP_OFFSET} - 20px) !important;
            overflow-y: auto !important;
            z-index: 999999 !important;
            margin: 0 !important;
            padding: 14px !important;
            background: rgba(0, 0, 0, ${BG_OPACITY}) !important;
            backdrop-filter: blur(${BLUR_PX}) !important;
            -webkit-backdrop-filter: blur(${BLUR_PX}) !important;
            border: 1px solid rgba(128, 128, 128, 0.3) !important;
            border-radius: 10px !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            box-sizing: border-box !important;
        }

        /* 內部單一附件卡片也保持透明 */
        section.attachments-section article.attachment {
            background: transparent !important;
        }

        /* 3. 強制附件區內所有結構容器（包含 Grid 或多層標籤）全部改為單欄垂直排列 */
        section.attachments-section div,
        section.attachments-section ul,
        section.attachments-section li,
        section.attachments-section article,
        section.attachments-section section,
        section.attachments-section header,
        section.attachments-section footer {
            display: flex !important;
            flex-direction: column !important;
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            background: transparent !important;
        }

        /* 讓檔名與字元正常橫向填滿一整行，不再被擠成直條 */
        section.attachments-section * {
            white-space: normal !important;
            word-break: break-all !important;
        }

        /* 4. 隱藏「各身份價格」（按鈕與價格階梯 .price-tiers）、「下載說明」、「RAR 圖示」 */
        section.attachments-section button.file-more,
        button.file-more,
        section.attachments-section .price-tiers,
        div.price-tiers,
        section.attachments-section a[href="/help"],
        section.attachments-section a[href*="/help"],
        a[href="/help"][data-seen],
        section.attachments-section span.file-icon,
        span.file-icon {
            display: none !important;
        }
    `;

    function applyFix() {
        // 注入 CSS 樣式表
        if (!document.getElementById('tm-move-attachment-top')) {
            const target = document.head || document.documentElement;
            if (target) {
                const style = document.createElement('style');
                style.id = 'tm-move-attachment-top';
                style.textContent = cssText;
                target.appendChild(style);
            }
        }

        const sections = document.querySelectorAll('section.attachments-section');
        sections.forEach(sec => {
            if (sec.dataset.tmFixed !== '1') {
                sec.dataset.tmFixed = '1';
                sec.style.setProperty('order', '-1', 'important');
                sec.style.setProperty('position', 'fixed', 'important');
                sec.style.setProperty('top', TOP_OFFSET, 'important');
                sec.style.setProperty('right', '16px', 'important');
                sec.style.setProperty('width', '280px', 'important');
                sec.style.setProperty('max-height', `calc(100vh - ${TOP_OFFSET} - 20px)`, 'important');
                sec.style.setProperty('overflow-y', 'auto', 'important');
                sec.style.setProperty('z-index', '999999', 'important');
                sec.style.setProperty('background', `rgba(0, 0, 0, ${BG_OPACITY})`, 'important');
                sec.style.setProperty('backdrop-filter', `blur(${BLUR_PX})`, 'important');
                sec.style.setProperty('-webkit-backdrop-filter', `blur(${BLUR_PX})`, 'important');
                sec.style.setProperty('border', '1px solid rgba(128, 128, 128, 0.3)', 'important');
                sec.style.setProperty('padding', '14px', 'important');
                sec.style.setProperty('border-radius', '10px', 'important');
                sec.style.setProperty('box-shadow', 'none', 'important');
                sec.style.setProperty('display', 'flex', 'important');
                sec.style.setProperty('flex-direction', 'column', 'important');
            }

            // 找出「按次數下載 / 下載」按鈕（排除已隱藏的各身份價格按鈕與說明連結）
            const candidates = sec.querySelectorAll('button:not(.file-more), a:not([href*="/help"])');
            candidates.forEach(btn => {
                const text = (btn.textContent || '').trim();
                if (!text.includes('下載') && !text.includes('下载') && btn.tagName !== 'BUTTON') return;
                if (btn.classList.contains('file-more')) return;

                // 設定按鈕本身填滿底部一整行並置中
                btn.style.setProperty('order', '999', 'important');
                btn.style.setProperty('width', '100%', 'important');
                btn.style.setProperty('margin-top', '10px', 'important');
                btn.style.setProperty('display', 'inline-flex', 'important');
                btn.style.setProperty('flex-direction', 'row', 'important');
                btn.style.setProperty('justify-content', 'center', 'important');
                btn.style.setProperty('align-items', 'center', 'important');
                btn.style.setProperty('white-space', 'nowrap', 'important');
                btn.style.setProperty('box-sizing', 'border-box', 'important');

                // 從按鈕一路往上追溯到 section.attachments-section，把每一層父容器都改為上下垂直排列，並把包著按鈕的分支推到最底部
                let curr = btn;
                let parent = curr.parentElement;
                while (parent && parent !== sec) {
                    parent.style.setProperty('display', 'flex', 'important');
                    parent.style.setProperty('flex-direction', 'column', 'important');
                    parent.style.setProperty('align-items', 'stretch', 'important');
                    parent.style.setProperty('width', '100%', 'important');
                    parent.style.setProperty('max-width', '100%', 'important');
                    parent.style.setProperty('box-sizing', 'border-box', 'important');

                    // 讓包含下載按鈕的這個子容器排在該層的最後面（最底部）
                    curr.style.setProperty('order', '999', 'important');
                    curr.style.setProperty('width', '100%', 'important');

                    curr = parent;
                    parent = curr.parentElement;
                }
                // 確保最頂層分支也在 attachments-section 的最底部
                if (curr && curr !== sec) {
                    curr.style.setProperty('order', '999', 'important');
                    curr.style.setProperty('width', '100%', 'important');
                }
            });
        });
    }

    applyFix();
    document.addEventListener('DOMContentLoaded', applyFix);
    window.addEventListener('load', applyFix);
    new MutationObserver(applyFix).observe(document.documentElement, { childList: true, subtree: true });
})();
