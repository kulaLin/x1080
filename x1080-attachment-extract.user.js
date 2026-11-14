// ==UserScript==
// @name         [x1080] 下載｜附件連結一鍵提取
// @namespace    https://github.com/kulaLin/x1080
// @version      2.9
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

        let panel = document.getElementById('tm-extract-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'tm-extract-panel';
            panel.style.cssText = 'position: fixed; bottom: 75px; right: 20px; width: 480px; max-width: 90vw; padding: 12px 16px; background: #1e293b; color: #f8fafc; border-radius: 8px; font-size: 13px; line-height: 1.6; border: 2px solid #38bdf8; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 2147483647;';

            const titleBar = document.createElement('div');
            titleBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: bold; color: #38bdf8;';
            titleBar.innerHTML = '<span>🎯 已攔截的下載資訊</span>';

            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 複製全部';
            copyBtn.style.cssText = 'padding: 4px 10px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(Array.from(extractedLinks).join('\n'));
                copyBtn.textContent = '✅ 已複製！';
                setTimeout(() => { copyBtn.textContent = '📋 複製全部'; }, 2000);
            };

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.title = '收合';
            closeBtn.style.cssText = 'padding: 4px 10px; background: #334155; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
            closeBtn.onclick = () => setPanelVisible(false);

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display: flex; gap: 6px;';
            btnGroup.append(copyBtn, closeBtn);

            titleBar.appendChild(btnGroup);
            panel.appendChild(titleBar);

            const list = document.createElement('div');
            list.id = 'tm-extract-list';
            list.style.cssText = 'word-break: break-all; font-family: monospace; max-height: 250px; overflow-y: auto;';
            panel.appendChild(list);

            document.body.appendChild(panel);

            // 收合時顯示的小按鈕，點擊展開面板
            const toggle = document.createElement('button');
            toggle.id = 'tm-extract-toggle';
            toggle.type = 'button';
            toggle.style.cssText = 'position: fixed; bottom: 75px; right: 20px; padding: 6px 14px; background: #1e293b; color: #38bdf8; border: 2px solid #38bdf8; border-radius: 50px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 2147483647;';
            toggle.onclick = () => setPanelVisible(true);
            document.body.appendChild(toggle);

            setPanelVisible(SHOW_PANEL_BY_DEFAULT);
        }

        const list = document.getElementById('tm-extract-list');
        const item = document.createElement('div');
        item.style.cssText = 'padding: 6px 0; border-top: 1px dashed #334155;';

        if (content.startsWith('http') || content.startsWith('/')) {
            const fullUrl = content.startsWith('/') ? location.origin + content : content;
            item.innerHTML = `<span style="color:#94a3b8;">[${label}]</span> <a href="${fullUrl}" target="_blank" style="color:#4ade80; text-decoration:underline;">${fullUrl}</a>`;
        } else {
            item.innerHTML = `<span style="color:#94a3b8;">[${label}]</span> <span style="color:#fbbf24;">${content}</span>`;
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

        // 尋找頁面上是否有附件或「按次數下載」按鈕
        const dlButtons = Array.from(document.querySelectorAll('article.attachment .file-get button, button')).filter(
            b => b.textContent && b.textContent.includes('按次數下載')
        );

        let floatBtn = document.getElementById('tm-float-extract-btn');

        if (dlButtons.length > 0 && !floatBtn) {
            floatBtn = document.createElement('button');
            floatBtn.id = 'tm-float-extract-btn';
            floatBtn.type = 'button';
            floatBtn.style.cssText = 'position: fixed !important; bottom: 20px !important; right: 20px !important; z-index: 2147483647 !important; padding: 12px 20px !important; background: #10b981 !important; color: #ffffff !important; border: 2px solid #ffffff !important; border-radius: 50px !important; cursor: pointer !important; font-weight: bold !important; font-size: 15px !important; box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;';

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