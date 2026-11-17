// ==UserScript==
// @name         [x1080] 下載｜附件連結一鍵提取
// @namespace    https://github.com/kulaLin/x1080
// @version      2.13
// @description  自動點擊「按次數下載」並攔截真實下載網址與 Token，完成後自動關閉分頁
// @author       Gemini
// @match        *://1080xin.com/*
// @match        *://*.1080xin.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        window.close
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 設定：是否阻止瀏覽器自動彈出下載視窗？(true = 只抓網址不下載 / false = 照常下載)
    const BLOCK_AUTO_DOWNLOAD = false;
    // 設定：攔截面板是否預設展開？(false = 預設收合成小按鈕 / true = 預設展開)
    const SHOW_PANEL_BY_DEFAULT = false;
    // 設定：一鍵提取完成後是否自動關閉分頁？(true = 關閉 / false = 不關閉)
    const AUTO_CLOSE_TAB = true;
    // 設定：全部附件都開始下載後，等幾毫秒再關閉分頁（1000 = 1 秒，500 = 0.5 秒；只改這裡，按鈕文字會自動跟著變）
    const CLOSE_DELAY_MS = 100;
    // 設定：最多等幾毫秒讓所有附件完成；超時代表有附件沒成功，就不自動關閉
    const WAIT_TIMEOUT_MS = 20000;
    // 設定：一鍵提取按鈕距離畫面頂端多遠（35vh = 畫面高度的 35%，- 15px = 再往上 15 像素；數字越小越上面；攔截面板會自動跟在按鈕下方）
    const BUTTON_TOP = 'calc(35vh - 15px)';
    // 攔截面板 / 收合小按鈕的位置 = 一鍵提取按鈕下方 60px（固定換算，不用改）
    const PANEL_TOP = `calc(${BUTTON_TOP} + 60px)`;
    // 設定：液態玻璃的深淺（'auto' = 跟著系統的淺色 / 深色模式；'light' = 永遠淺色玻璃；'dark' = 永遠深色玻璃）
    const GLASS_THEME = 'auto';
    // 設定：液態玻璃的不透明度，類似 iOS 27 的透明度滑桿（0 = 最透明，1 = 完全不透明；底下網頁太花、字看不清楚就調高）
    const GLASS_OPACITY = 0.3;

    // 液態玻璃（Liquid Glass）樣式：半透明底色 + 背景模糊與提高飽和度 + 邊緣光線高光 + 按下時像水滴一樣微微膨脹
    // 系統開啟「減少透明度」時改成不透明，開啟「減少動態效果」時取消縮放動畫
    const GLASS_STYLE_ID = 'tm-extract-glass-style';
    const glassA = Math.min(Math.max(Number(GLASS_OPACITY) || 0, 0), 1);
    const alpha = (min) => (min + glassA * (1 - min)).toFixed(2);   // 把 0~1 的設定換算成各元素實際的透明度
    const GLASS_ROOT = '#tm-float-extract-btn, #tm-extract-toggle, #tm-extract-panel';
    const GLASS_SHEEN = 'linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.14) 100%)';
    const GLASS_DARK_VARS = `
            --tm-fill: rgba(28, 28, 32, ${alpha(0.3)});
            --tm-solid: rgb(44, 44, 46);
            --tm-text: #f5f5f7;
            --tm-sub: rgba(245, 245, 247, 0.6);
            --tm-rim: rgba(255, 255, 255, 0.5);
            --tm-edge: rgba(255, 255, 255, 0.18);
            --tm-divider: rgba(255, 255, 255, 0.12);
            --tm-mini: rgba(255, 255, 255, 0.12);
            --tm-link: #30d158;
            --tm-token: #ff9f0a;`;
    const GLASS_DARK_BLOCK = GLASS_THEME === 'dark' ? `${GLASS_ROOT} {${GLASS_DARK_VARS}\n        }`
        : GLASS_THEME === 'light' ? ''
        : `@media (prefers-color-scheme: dark) {\n        ${GLASS_ROOT} {${GLASS_DARK_VARS}\n        }\n        }`;
    const GLASS_CSS = `
        ${GLASS_ROOT} {
            --tm-fill: rgba(255, 255, 255, ${alpha(0.12)});
            --tm-solid: rgb(242, 242, 247);
            --tm-text: #1d1d1f;
            --tm-sub: rgba(29, 29, 31, 0.55);
            --tm-rim: rgba(255, 255, 255, 0.9);
            --tm-edge: rgba(255, 255, 255, 0.45);
            --tm-divider: rgba(0, 0, 0, 0.08);
            --tm-mini: rgba(255, 255, 255, 0.35);
            --tm-link: #1a7f37;
            --tm-token: #b54708;
            position: fixed;
            right: 20px;
            z-index: 2147483647;
            box-sizing: border-box;
            margin: 0;
            color: var(--tm-text);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Microsoft JhengHei", "Segoe UI", sans-serif;
            background: ${GLASS_SHEEN}, var(--tm-fill);
            -webkit-backdrop-filter: blur(12px) saturate(190%) brightness(1.05);
            backdrop-filter: blur(12px) saturate(190%) brightness(1.05);
            border: 1px solid var(--tm-edge);
            box-shadow:
                inset 0 1px 1px var(--tm-rim),
                inset 0 -1px 1px rgba(255, 255, 255, 0.2),
                inset 0 0 18px rgba(255, 255, 255, 0.12),
                0 10px 30px rgba(0, 0, 0, 0.18),
                0 2px 8px rgba(0, 0, 0, 0.1);
            transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
        }
        ${GLASS_DARK_BLOCK}
        /* 邊緣的光線高光：左上與右下較亮，像光線打在玻璃邊緣 */
        #tm-float-extract-btn::before, #tm-extract-toggle::before, #tm-extract-panel::before {
            content: "";
            position: absolute;
            inset: -1px;
            border-radius: inherit;
            padding: 1.5px;
            background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.2) 28%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.2) 72%, rgba(255,255,255,0.75));
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
        }
        #tm-float-extract-btn, #tm-extract-toggle {
            -webkit-appearance: none;
            appearance: none;
            border-radius: 999px;
            cursor: pointer;
            font-weight: 600;
            line-height: 1.4;
            white-space: nowrap;
            text-transform: none;
            min-height: 0;
        }
        #tm-float-extract-btn {
            top: ${BUTTON_TOP};
            padding: 12px 22px;
            font-size: 15px;
        }
        #tm-extract-toggle {
            top: ${PANEL_TOP};
            padding: 7px 16px;
            font-size: 13px;
        }
        #tm-float-extract-btn:hover, #tm-extract-toggle:hover { transform: scale(1.04); filter: brightness(1.06); }
        #tm-float-extract-btn:active, #tm-extract-toggle:active { transform: scale(1.09); filter: brightness(1.12); transition-duration: 0.2s; }
        #tm-float-extract-btn:focus-visible, #tm-extract-toggle:focus-visible { outline: 2px solid rgba(10, 132, 255, 0.7); outline-offset: 3px; }
        #tm-extract-panel {
            top: ${PANEL_TOP};
            width: 480px;
            max-width: 90vw;
            padding: 12px 16px;
            border-radius: 22px;
            font-size: 13px;
            line-height: 1.6;
        }
        #tm-extract-panel .tm-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; }
        #tm-extract-panel .tm-btns { display: flex; gap: 6px; }
        #tm-extract-panel .tm-mini {
            -webkit-appearance: none;
            appearance: none;
            margin: 0;
            padding: 4px 12px;
            border-radius: 999px;
            border: 1px solid var(--tm-edge);
            background: var(--tm-mini);
            color: var(--tm-text);
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.5;
            cursor: pointer;
            box-shadow: inset 0 1px 1px var(--tm-rim), 0 1px 3px rgba(0, 0, 0, 0.1);
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
        }
        #tm-extract-panel .tm-mini:hover { transform: scale(1.06); filter: brightness(1.06); }
        #tm-extract-panel .tm-mini:active { transform: scale(1.12); }
        #tm-extract-list {
            word-break: break-all;
            font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            max-height: min(250px, calc(100vh - ${PANEL_TOP} - 90px));
            overflow-y: auto;
        }
        #tm-extract-list .tm-item { padding: 6px 0; border-top: 1px solid var(--tm-divider); }
        #tm-extract-list .tm-label { color: var(--tm-sub); }
        #tm-extract-list .tm-link { color: var(--tm-link); text-decoration: underline; }
        #tm-extract-list .tm-token { color: var(--tm-token); }
        @media (prefers-reduced-transparency: reduce) {
            ${GLASS_ROOT} { --tm-fill: var(--tm-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            ${GLASS_ROOT}, #tm-extract-panel .tm-mini { transition: none !important; transform: none !important; }
        }
    `;

    // 把液態玻璃樣式放進網頁（只放一次；若被網站換頁時移除，下次檢查會補回）
    function ensureGlassStyle() {
        if (document.getElementById(GLASS_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = GLASS_STYLE_ID;
        style.textContent = GLASS_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // 有 @grant 時腳本跑在沙盒裡，要攔截網頁本身的函式得透過 unsafeWindow
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const extractedLinks = new Set();
    let tokenCount = 0;      // 已取得的 Download Token 數（每一個代表一個附件 claim 成功）
    let running = false;
    let closeTimer = null;

    // 切換面板 / 收合按鈕的顯示
    function setPanelVisible(visible) {
        const panel = document.getElementById('tm-extract-panel');
        const toggle = document.getElementById('tm-extract-toggle');
        if (panel) panel.style.display = visible ? 'block' : 'none';
        if (toggle) toggle.style.display = visible ? 'none' : 'block';
    }

    // 1. 建立顯示面板
    function showResultOnUI(label, content) {
        if (!content || extractedLinks.has(content)) return;
        extractedLinks.add(content);

        ensureGlassStyle();
        let panel = document.getElementById('tm-extract-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'tm-extract-panel';

            const titleBar = document.createElement('div');
            titleBar.className = 'tm-title';
            titleBar.innerHTML = '<span>🎯 已攔截的下載資訊</span>';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'tm-mini';
            copyBtn.textContent = '📋 複製全部';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(Array.from(extractedLinks).join('\n'));
                copyBtn.textContent = '✅ 已複製！';
                setTimeout(() => { copyBtn.textContent = '📋 複製全部'; }, 2000);
            };

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'tm-mini';
            closeBtn.textContent = '✕';
            closeBtn.title = '收合';
            closeBtn.onclick = () => setPanelVisible(false);

            const btnGroup = document.createElement('div');
            btnGroup.className = 'tm-btns';
            btnGroup.append(copyBtn, closeBtn);

            titleBar.appendChild(btnGroup);
            panel.appendChild(titleBar);

            const list = document.createElement('div');
            list.id = 'tm-extract-list';
            panel.appendChild(list);

            document.body.appendChild(panel);

            // 收合時顯示的小按鈕，點擊展開面板
            const toggle = document.createElement('button');
            toggle.id = 'tm-extract-toggle';
            toggle.type = 'button';
            toggle.onclick = () => setPanelVisible(true);
            document.body.appendChild(toggle);

            setPanelVisible(SHOW_PANEL_BY_DEFAULT);
        }

        const list = document.getElementById('tm-extract-list');
        const item = document.createElement('div');
        item.className = 'tm-item';

        if (content.startsWith('http') || content.startsWith('/')) {
            const fullUrl = content.startsWith('/') ? location.origin + content : content;
            item.innerHTML = `<span class="tm-label">[${label}]</span> <a class="tm-link" href="${fullUrl}" target="_blank">${fullUrl}</a>`;
        } else {
            item.innerHTML = `<span class="tm-label">[${label}]</span> <span class="tm-token">${content}</span>`;
        }
        list.appendChild(item);

        const toggle = document.getElementById('tm-extract-toggle');
        if (toggle) toggle.textContent = `🎯 已攔截 ${extractedLinks.size} 筆`;
    }

    // 2. 攔截 Fetch 與下載動作
    const origFetch = pageWindow.fetch;
    pageWindow.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const response = await origFetch.apply(this, args);

        if (url && url.includes('/api/downloads/')) {
            const clone = response.clone();
            clone.json().then(data => {
                if (data.url || data.download_url || data.file_url) {
                    showResultOnUI('API 下載連結', data.url || data.download_url || data.file_url);
                }
                if (data.download_token) {
                    tokenCount++;
                    showResultOnUI('Download Token', data.download_token);
                }
            }).catch(() => {});
        }
        return response;
    };

    const elementProto = pageWindow.HTMLElement.prototype;
    const origClick = elementProto.click;
    elementProto.click = function() {
        if (this.tagName === 'A' && this.href) {
            showResultOnUI('最終下載網址', this.href);
            if (BLOCK_AUTO_DOWNLOAD) return;
        }
        return origClick.apply(this, arguments);
    };

    const origOpen = pageWindow.open;
    pageWindow.open = function(url, ...rest) {
        if (url) {
            showResultOnUI('最終下載網址', url);
            if (BLOCK_AUTO_DOWNLOAD) return null;
        }
        return origOpen.call(this, url, ...rest);
    };

    // 每 200 毫秒檢查一次條件，成立回傳 true，超時回傳 false
    function waitFor(condition, timeoutMs) {
        return new Promise(resolve => {
            const start = Date.now();
            const timer = setInterval(() => {
                if (condition()) {
                    clearInterval(timer);
                    resolve(true);
                } else if (Date.now() - start >= timeoutMs) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, 200);
        });
    }

    // 3. 定期檢查頁面並插入按鈕
    //
    // [已知問題] 2026-11-15 記錄，待後續改版修正
    // 現象：1080xin 是單頁應用（Next.js），從列表點進文章、或在文章之間切換時不會重新載入頁面。
    //       懸浮按鈕只在第一次出現時建立，並在 onclick 閉包中固定住當下的 dlButtons。
    //       因此在同一分頁換到另一篇文章後：
    //         1) 按鈕上的數量 (N) 仍是第一篇的數量
    //         2) 點擊時會去點第一篇已被移除的舊按鈕，實際上沒有作用，最後等到 WAIT_TIMEOUT_MS 超時
    //         3) 換到沒有附件的頁面時，懸浮按鈕仍留在畫面上
    // 影響：每篇文章都開新分頁使用時不會發生。
    // 修正方向：
    //   - 每次 setInterval 都重新查詢 dlButtons，並更新按鈕文字的數量
    //   - onclick 內改為點擊「當下」查到的按鈕，而不是建立時存下的清單
    //   - 查不到下載按鈕時移除懸浮按鈕；網址（location.pathname）改變時重置 extractedLinks、tokenCount 與攔截面板
    setInterval(() => {
        if (!document.body) return;
        ensureGlassStyle();

        // 尋找頁面上是否有附件或「按次數下載」按鈕
        const dlButtons = Array.from(document.querySelectorAll('article.attachment .file-get button, button')).filter(
            b => b.textContent && b.textContent.includes('按次數下載')
        );

        let floatBtn = document.getElementById('tm-float-extract-btn');

        if (dlButtons.length > 0 && !floatBtn) {
            floatBtn = document.createElement('button');
            floatBtn.id = 'tm-float-extract-btn';
            floatBtn.type = 'button';

            const resetFloatBtn = () => {
                floatBtn.textContent = `⚡ 一鍵提取下載連結 (${dlButtons.length})`;
            };
            resetFloatBtn();

            floatBtn.onclick = async () => {
                // 倒數關閉期間再按一次 = 取消關閉
                if (closeTimer) {
                    clearTimeout(closeTimer);
                    closeTimer = null;
                    floatBtn.textContent = '🛑 已取消關閉分頁';
                    setTimeout(resetFloatBtn, 3000);
                    return;
                }
                if (running) return;
                running = true;

                floatBtn.textContent = '⏳ 正在自動點擊並提取...';
                const startCount = tokenCount;
                for (const btn of dlButtons) {
                    btn.click();
                    await new Promise(r => setTimeout(r, 1500));
                }

                // 等每個附件都拿到 Download Token（代表 claim 成功、檔案即將開始下載）
                const allDone = await waitFor(() => tokenCount - startCount >= dlButtons.length, WAIT_TIMEOUT_MS);
                const doneCount = Math.min(tokenCount - startCount, dlButtons.length);
                running = false;

                if (allDone && AUTO_CLOSE_TAB) {
                    // 毫秒 ÷ 1000 = 秒數，這裡的 1000 是固定換算，不要改
                    floatBtn.textContent = `✅ 提取完成，${CLOSE_DELAY_MS / 1000} 秒後關閉分頁（點此取消）`;
                    closeTimer = setTimeout(() => {
                        closeTimer = null;
                        window.close();
                        // 分頁若還在，代表瀏覽器不允許關閉
                        setTimeout(() => {
                            floatBtn.textContent = '⚠️ 無法自動關閉此分頁';
                            setTimeout(resetFloatBtn, 5000);
                        }, 1000);
                    }, CLOSE_DELAY_MS);
                    return;
                }

                if (allDone) {
                    floatBtn.textContent = '✅ 提取完成！';
                    setTimeout(resetFloatBtn, 3000);
                } else {
                    floatBtn.textContent = `⚠️ 只完成 ${doneCount}/${dlButtons.length} 個，不自動關閉分頁`;
                    setTimeout(resetFloatBtn, 8000);
                }
            };
            document.body.appendChild(floatBtn);
        }
    }, 1000);
})();