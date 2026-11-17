// ==UserScript==
// @name         [x1080] 版面｜附件區塊右側懸浮
// @namespace    https://github.com/kulaLin/x1080
// @version      4.7
// @description  將 attachments-section 改為右側懸浮、垂直排列、透明背景、下載按鈕移至最底部、隱藏各身份價格階梯；拖曳上方把手可移動位置（X/Y 軸），設定面板可調位置、寬度、透明度與模糊，100%保留原生按鈕
// @match        *://*.1080xin.com/*
// @match        *://1080xin.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ===== 預設設定 =====
    // 這裡是「預設值」。實際使用的值可以直接拖曳附件區塊上方的把手，或在「⚙️ 設定」面板調整：
    //   - 把手上的 ⚙️、在把手上按右鍵，或 Tampermonkey 選單的「⚙️ 附件區塊設定」
    // 調整後會存在 Tampermonkey 裡，腳本自動更新也不會被蓋掉；在設定面板按「重設」就回到這裡的值。
    const DEFAULTS = {
        panelRight: 16,       // 水平位置（X 軸）：區塊右緣距離畫面右邊幾 px
        panelTop: 260,        // 垂直位置（Y 軸）：區塊上緣（拖曳把手）距離畫面頂端幾 px
        panelWidth: 280,      // 區塊寬度（px）
        bgOpacity: 0,         // 背景不透明度：0 = 完全透明，0.2 = 微透黑底
        blurPx: 8,            // 毛玻璃模糊程度（px）：0 = 不模糊，8 = 微毛玻璃（防背景文字干擾閱讀）
        lockPosition: false,  // true = 鎖定位置，把手不能拖曳
    };
    const SETTINGS_KEY = 'settings';
    const HANDLE_H = 26;                       // 拖曳把手高度（px）
    const WIDTH_MIN = 200, WIDTH_MAX = 600;    // 寬度可調範圍（px）
    // [已知問題] 2026-11-15 記錄，待實際確認後調整
    // 預設位置與 x1080-magnet-notion 的「下載地址」面板重疊（該面板在右側 top:200px、寬 340px、z-index 較高）。
    // 同一篇文章同時有 magnet 與附件時，本區塊會被蓋住。v4.7 起可直接拖曳把手錯開（位置會記住）；
    // 是否改預設位置或兩者自動錯開，待實際使用後再決定。

    // 讀取存在 Tampermonkey 裡的設定；型別不對或已不存在的項目就用預設值
    function loadSettings() {
        let saved = {};
        try {
            if (typeof GM_getValue === 'function') saved = GM_getValue(SETTINGS_KEY, {}) || {};
        } catch (e) {}
        const result = Object.assign({}, DEFAULTS);
        for (const key of Object.keys(DEFAULTS)) {
            if (!(key in saved)) continue;
            const v = saved[key];
            const ok = typeof v === typeof DEFAULTS[key] && (typeof v !== 'number' || Number.isFinite(v));
            if (ok) result[key] = v;
        }
        return result;
    }

    function saveSettings() {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(SETTINGS_KEY, Object.assign({}, settings));
        } catch (e) {}
    }

    let settings = loadSettings();

    const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));

    // 可視範圍（不含捲軸）
    function viewport() {
        const de = document.documentElement;
        return {
            w: (de && de.clientWidth) || window.innerWidth,
            h: (de && de.clientHeight) || window.innerHeight,
        };
    }

    // 依目前設定算出實際位置；超出畫面時自動夾回畫面內（存的值不變，換回大螢幕時會回到原位）
    function layout() {
        const vp = viewport();
        const width = Math.round(clamp(Number(settings.panelWidth) || DEFAULTS.panelWidth, WIDTH_MIN, WIDTH_MAX));
        const maxRight = Math.max(0, vp.w - width);
        const maxTop = Math.max(0, vp.h - HANDLE_H - 60);
        return {
            width,
            maxRight,
            maxTop,
            right: Math.round(clamp(Number(settings.panelRight) || 0, 0, maxRight)),
            top: Math.round(clamp(Number(settings.panelTop) || 0, 0, maxTop)),
        };
    }

    const SHEEN = 'linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.14) 100%)';
    const ACCENT = '#0a84ff';

    // 位置、寬度、背景都用 :root 變數（--tm-ap-*）控制，拖曳或改設定時只改變數，不用重寫整份樣式
    const cssText = `
        /* 1. 保底：維持原本成功的 Flex 置頂結構 */
        #first-post .post-content .post-text,
        .post-content .post-text {
            display: flex !important;
            flex-direction: column !important;
        }

        /* 2. 將附件區塊固定在畫面上（位置可拖曳）+ 透明背景 + 垂直排列；上方留給拖曳把手 */
        .post-text > section.attachments-section,
        section.attachments-section {
            order: -1 !important;
            position: fixed !important;
            top: calc(var(--tm-ap-top, 260px) + ${HANDLE_H}px) !important;
            right: var(--tm-ap-right, 16px) !important;
            left: auto !important;
            bottom: auto !important;
            width: var(--tm-ap-w, 280px) !important;
            max-height: max(120px, calc(100vh - var(--tm-ap-top, 260px) - ${HANDLE_H + 20}px)) !important;
            overflow-y: auto !important;
            z-index: 999999 !important;
            margin: 0 !important;
            padding: 14px !important;
            background: var(--tm-ap-bg, transparent) !important;
            backdrop-filter: blur(var(--tm-ap-blur, 8px)) !important;
            -webkit-backdrop-filter: blur(var(--tm-ap-blur, 8px)) !important;
            border: 1px solid rgba(128, 128, 128, 0.3) !important;
            border-radius: 0 0 10px 10px !important;
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

        /* 5. 拖曳把手：在附件區塊正上方，跟著同一組 X/Y 位置移動 */
        #tm-ap-handle {
            position: fixed;
            top: var(--tm-ap-top, 260px);
            right: var(--tm-ap-right, 16px);
            left: auto;
            bottom: auto;
            width: var(--tm-ap-w, 280px);
            height: ${HANDLE_H}px;
            z-index: 999999;
            display: none;
            align-items: center;
            gap: 2px;
            box-sizing: border-box;
            margin: 0;
            padding: 0 4px 0 8px;
            color: inherit;
            font: 12px/1 -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", "Segoe UI", sans-serif;
            background: rgba(128, 128, 128, 0.16);
            -webkit-backdrop-filter: blur(var(--tm-ap-blur, 8px));
            backdrop-filter: blur(var(--tm-ap-blur, 8px));
            border: 1px solid rgba(128, 128, 128, 0.3);
            border-bottom: 0;
            border-radius: 10px 10px 0 0;
            cursor: grab;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
        }
        #tm-ap-handle.is-visible { display: flex; }
        #tm-ap-handle.is-dragging { cursor: grabbing; background: rgba(10, 132, 255, 0.22); }
        #tm-ap-handle.is-locked { cursor: default; }
        #tm-ap-handle .tm-ap-grip { padding-right: 4px; opacity: 0.55; }
        #tm-ap-handle.is-locked .tm-ap-grip { opacity: 0.2; }
        #tm-ap-handle .tm-ap-title { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; opacity: 0.8; font-variant-numeric: tabular-nums; }
        #tm-ap-handle .tm-ap-btn { flex: none; padding: 3px 6px; border-radius: 6px; cursor: pointer; opacity: 0.65; }
        #tm-ap-handle .tm-ap-btn:hover { opacity: 1; background: rgba(128, 128, 128, 0.22); }
        html.tm-ap-dragging, html.tm-ap-dragging * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }

        /* 設定面板開著、但頁面沒有附件時顯示的預覽框 */
        #tm-ap-preview {
            position: fixed;
            top: calc(var(--tm-ap-top, 260px) + ${HANDLE_H}px);
            right: var(--tm-ap-right, 16px);
            width: var(--tm-ap-w, 280px);
            height: 140px;
            z-index: 999999;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            color: inherit;
            font-size: 12px;
            background: var(--tm-ap-bg, transparent);
            -webkit-backdrop-filter: blur(var(--tm-ap-blur, 8px));
            backdrop-filter: blur(var(--tm-ap-blur, 8px));
            border: 1px dashed rgba(128, 128, 128, 0.55);
            border-radius: 0 0 10px 10px;
        }

        /* 6. 設定面板（畫面正中央）：液態玻璃風格，與 x1080-attachment-extract 的設定面板一致 */
        #tm-ap-settings {
            --tm-sheet: rgba(255, 255, 255, 0.82);
            --tm-solid: rgb(242, 242, 247);
            --tm-text: #1d1d1f;
            --tm-sub: rgba(29, 29, 31, 0.55);
            --tm-rim: rgba(255, 255, 255, 0.9);
            --tm-edge: rgba(255, 255, 255, 0.45);
            --tm-divider: rgba(0, 0, 0, 0.08);
            --tm-mini: rgba(255, 255, 255, 0.35);
            --tm-track: rgba(120, 120, 128, 0.2);
            position: fixed;
            top: 50%;
            left: 50%;
            right: auto;
            transform: translate(-50%, -50%);
            z-index: 2147483647;
            box-sizing: border-box;
            width: 360px;
            max-width: calc(100vw - 24px);
            max-height: calc(100vh - 24px);
            overflow-y: auto;
            margin: 0;
            padding: 14px 16px 16px;
            border-radius: 24px;
            color: var(--tm-text);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Microsoft JhengHei", "Segoe UI", sans-serif;
            font-size: 13px;
            line-height: 1.5;
            background: ${SHEEN}, var(--tm-sheet);
            -webkit-backdrop-filter: blur(12px) saturate(190%) brightness(1.05);
            backdrop-filter: blur(12px) saturate(190%) brightness(1.05);
            border: 1px solid var(--tm-edge);
            box-shadow:
                inset 0 1px 1px var(--tm-rim),
                inset 0 -1px 1px rgba(255, 255, 255, 0.2),
                0 10px 30px rgba(0, 0, 0, 0.18),
                0 2px 8px rgba(0, 0, 0, 0.1);
        }
        @media (prefers-color-scheme: dark) {
            #tm-ap-settings {
                --tm-sheet: rgba(28, 28, 32, 0.85);
                --tm-solid: rgb(44, 44, 46);
                --tm-text: #f5f5f7;
                --tm-sub: rgba(245, 245, 247, 0.6);
                --tm-rim: rgba(255, 255, 255, 0.5);
                --tm-edge: rgba(255, 255, 255, 0.18);
                --tm-divider: rgba(255, 255, 255, 0.12);
                --tm-mini: rgba(255, 255, 255, 0.12);
                --tm-track: rgba(120, 120, 128, 0.36);
            }
        }
        #tm-ap-settings .tm-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 15px; font-weight: 600; }
        #tm-ap-settings .tm-btns { display: flex; gap: 6px; }
        #tm-ap-settings .tm-mini {
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
        #tm-ap-settings .tm-mini:hover { transform: scale(1.06); filter: brightness(1.06); }
        #tm-ap-settings .tm-mini:active { transform: scale(1.12); }
        #tm-ap-settings .tm-sec { margin: 12px 4px 6px; font-size: 12px; font-weight: 600; color: var(--tm-sub); }
        #tm-ap-settings .tm-group { border-radius: 14px; background: var(--tm-mini); border: 1px solid var(--tm-edge); overflow: hidden; }
        #tm-ap-settings .tm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0; padding: 9px 12px; border-top: 1px solid var(--tm-divider); cursor: default; }
        #tm-ap-settings .tm-row:first-child { border-top: 0; }
        #tm-ap-settings label.tm-row { cursor: pointer; }
        #tm-ap-settings .tm-row.tm-stack { flex-direction: column; align-items: stretch; gap: 4px; }
        #tm-ap-settings .tm-row-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        #tm-ap-settings .tm-val { display: inline-flex; align-items: center; gap: 4px; color: var(--tm-sub); white-space: nowrap; }
        #tm-ap-settings .tm-num {
            -webkit-appearance: none;
            appearance: none;
            -moz-appearance: textfield;
            box-sizing: border-box;
            width: 68px;
            margin: 0;
            padding: 3px 8px;
            border-radius: 8px;
            border: 1px solid var(--tm-edge);
            background: var(--tm-mini);
            color: var(--tm-text);
            font: inherit;
            text-align: right;
        }
        #tm-ap-settings .tm-num:focus { outline: 2px solid rgba(10, 132, 255, 0.6); outline-offset: 1px; }
        #tm-ap-settings .tm-range {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 4px;
            margin: 10px 0 6px;
            padding: 0;
            border: 0;
            border-radius: 999px;
            background: linear-gradient(to right, ${ACCENT} var(--p, 0%), var(--tm-track) var(--p, 0%));
            outline: none;
            cursor: pointer;
        }
        #tm-ap-settings .tm-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #fff;
            border: 0;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.08);
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        #tm-ap-settings .tm-range:active::-webkit-slider-thumb { transform: scale(1.15); }
        #tm-ap-settings .tm-range::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #fff;
            border: 0;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        #tm-ap-settings .tm-switch {
            -webkit-appearance: none;
            appearance: none;
            position: relative;
            flex: none;
            width: 46px;
            height: 28px;
            margin: 0;
            border: 0;
            border-radius: 999px;
            background: var(--tm-track);
            cursor: pointer;
            transition: background 0.25s ease;
        }
        #tm-ap-settings .tm-switch::after {
            content: "";
            position: absolute;
            top: 2px;
            left: 2px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        #tm-ap-settings .tm-switch:checked { background: ${ACCENT}; }
        #tm-ap-settings .tm-switch:checked::after { transform: translateX(18px); }
        #tm-ap-settings .tm-switch:focus-visible { outline: 2px solid rgba(10, 132, 255, 0.6); outline-offset: 2px; }
        #tm-ap-settings .tm-hint { margin: 12px 4px 0; font-size: 11px; color: var(--tm-sub); }

        @media (prefers-reduced-transparency: reduce) {
            #tm-ap-settings { --tm-sheet: var(--tm-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            #tm-ap-settings .tm-mini, #tm-ap-settings .tm-switch::after, #tm-ap-settings .tm-range::-webkit-slider-thumb { transition: none !important; transform: none; }
        }
    `;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    // ===== 樣式與位置變數 =====
    const STYLE_ID = 'tm-move-attachment-top';
    const VARS_STYLE_ID = 'tm-ap-vars';
    let lastVars = '';

    // 把目前的位置、寬度、背景寫進 :root 變數（直接改 CSSOM，不會觸發 MutationObserver）
    function applyVars() {
        const style = document.getElementById(VARS_STYLE_ID);
        const rule = style && style.sheet && style.sheet.cssRules[0];
        if (!rule) return;
        const p = layout();
        const vars = [
            ['--tm-ap-right', p.right + 'px'],
            ['--tm-ap-top', p.top + 'px'],
            ['--tm-ap-w', p.width + 'px'],
            ['--tm-ap-bg', `rgba(0, 0, 0, ${clamp(Number(settings.bgOpacity) || 0, 0, 1)})`],
            ['--tm-ap-blur', clamp(Number(settings.blurPx) || 0, 0, 40) + 'px'],
        ];
        const key = vars.map(v => v[1]).join('|');
        if (key === lastVars && rule.style.getPropertyValue('--tm-ap-top')) return;
        lastVars = key;
        for (const [name, value] of vars) rule.style.setProperty(name, value);
    }

    // 放入樣式表（若被網站換頁時移除，下次檢查會補回）
    function ensureStyles() {
        const target = document.head || document.documentElement;
        if (!target) return;
        if (!document.getElementById(STYLE_ID)) {
            const style = el('style', '', cssText);
            style.id = STYLE_ID;
            target.appendChild(style);
        }
        if (!document.getElementById(VARS_STYLE_ID)) {
            const vars = el('style', '', ':root {}');
            vars.id = VARS_STYLE_ID;
            target.appendChild(vars);
        }
        applyVars();
    }

    // ===== 拖曳把手 =====
    let handle = null;
    let handleTitle = null;
    let flashTimer = 0;
    let drag = null;

    const posText = (p) => `X ${p.right} · Y ${p.top}`;

    function refreshHandle(text) {
        if (!handle) return;
        const locked = !!settings.lockPosition;
        handle.classList.toggle('is-locked', locked);
        handle.title = locked
            ? '位置已鎖定（按 ⚙️ 或右鍵開啟設定可解鎖）'
            : '拖曳移動位置・右鍵開啟設定';
        handleTitle.textContent = text || (locked ? '附件 🔒' : '附件');
    }

    // 在把手上暫時顯示一段文字（例如座標），過一下再換回原本的標題
    function flash(text, ms = 1500) {
        clearTimeout(flashTimer);
        refreshHandle(text);
        flashTimer = setTimeout(() => refreshHandle(), ms);
    }

    function buildHandle() {
        handle = el('div');
        handle.id = 'tm-ap-handle';
        handleTitle = el('span', 'tm-ap-title');
        const resetBtn = el('span', 'tm-ap-btn', '↺');
        resetBtn.dataset.act = 'reset';
        resetBtn.title = '位置恢復預設';
        const gearBtn = el('span', 'tm-ap-btn', '⚙️');
        gearBtn.dataset.act = 'settings';
        gearBtn.title = '附件區塊設定';
        handle.append(el('span', 'tm-ap-grip', '⠿'), handleTitle, resetBtn, gearBtn);

        handle.addEventListener('pointerdown', onDragStart);
        handle.addEventListener('pointermove', onDragMove);
        handle.addEventListener('pointerup', onDragEnd);
        handle.addEventListener('pointercancel', onDragEnd);
        handle.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            if (btn.dataset.act === 'reset') resetPosition();
            else if (btn.dataset.act === 'settings') openSettings();
        });
        handle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openSettings();
        });
        refreshHandle();
    }

    function onDragStart(e) {
        if (e.button !== 0 || settings.lockPosition || e.target.closest('[data-act]')) return;
        const p = layout();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, right: p.right, top: p.top, moved: false };
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved) {
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;   // 移動不到 3px 當成點擊，不算拖曳
            drag.moved = true;
            clearTimeout(flashTimer);
            handle.classList.add('is-dragging');
            document.documentElement.classList.add('tm-ap-dragging');
        }
        // X 軸是「距離右邊」，所以往右拖 = 數字變小
        const p = layout();
        settings.panelRight = Math.round(clamp(drag.right - dx, 0, p.maxRight));
        settings.panelTop = Math.round(clamp(drag.top + dy, 0, p.maxTop));
        applyVars();
        refreshSettingsUI();
        refreshHandle(posText(layout()));
    }

    function onDragEnd(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const moved = drag.moved;
        drag = null;
        try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
        handle.classList.remove('is-dragging');
        document.documentElement.classList.remove('tm-ap-dragging');
        if (moved) {
            saveSettings();
            flash(posText(layout()));
        }
    }

    function resetPosition() {
        settings.panelRight = DEFAULTS.panelRight;
        settings.panelTop = DEFAULTS.panelTop;
        saveSettings();
        applyVars();
        refreshSettingsUI();
        flash(posText(layout()));
    }

    // 有附件區塊（或設定面板開著）時顯示把手；設定面板開著但頁面沒有附件時，放一個預覽框
    function updateHandle(sectionVisible) {
        if (!document.body) return;
        const settingsOpen = !!document.getElementById(SETTINGS_ID);
        let preview = document.getElementById('tm-ap-preview');
        if (settingsOpen && !sectionVisible) {
            if (!preview) {
                preview = el('div', '', '附件區塊預覽');
                preview.id = 'tm-ap-preview';
                document.body.appendChild(preview);
            }
        } else if (preview) {
            preview.remove();
        }

        const show = sectionVisible || settingsOpen;
        if (!handle) {
            if (!show) return;
            buildHandle();
        }
        if (!handle.isConnected) document.body.appendChild(handle);
        handle.classList.toggle('is-visible', show);
    }

    // ===== 設定面板 =====
    // scale：面板上顯示的數字 = 儲存的值 × scale（例如不透明度存 0.2、顯示 20%）
    const SETTINGS_ID = 'tm-ap-settings';
    const SETTING_FIELDS = [
        { section: '位置（也可以直接拖曳附件區塊上方的把手）' },
        { key: 'panelRight', label: '水平位置（X 軸，距離右邊）', type: 'range', unit: 'px', min: 0, step: 1, max: () => Math.max(100, layout().maxRight) },
        { key: 'panelTop', label: '垂直位置（Y 軸，距離頂端）', type: 'range', unit: 'px', min: 0, step: 1, max: () => Math.max(100, layout().maxTop) },
        { key: 'panelWidth', label: '寬度', type: 'range', unit: 'px', min: WIDTH_MIN, step: 10, max: () => WIDTH_MAX },
        { key: 'lockPosition', label: '鎖定位置（不能拖曳）', type: 'switch' },
        { section: '外觀' },
        { key: 'bgOpacity', label: '背景不透明度', type: 'range', unit: '%', min: 0, step: 1, max: () => 100, scale: 100 },
        { key: 'blurPx', label: '毛玻璃模糊', type: 'range', unit: 'px', min: 0, step: 1, max: () => 20 },
    ];

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        applyVars();
        refreshHandle();
        refreshSettingsUI();
    }

    function buildSettingRow(f) {
        const scale = f.scale || 1;
        const label = el('span', '', f.label);

        if (f.type === 'switch') {
            const row = el('label', 'tm-row');
            const sw = el('input', 'tm-switch');
            sw.type = 'checkbox';
            sw.dataset.k = f.key;
            sw.onchange = () => setSetting(f.key, sw.checked);
            row.append(label, sw);
            return row;
        }

        // 滑桿 + 數字框
        const onView = (raw) => {
            const v = parseFloat(raw);
            if (!Number.isFinite(v)) return;
            setSetting(f.key, +(Math.max(f.min, v) / scale).toFixed(4));
        };
        const num = el('input', 'tm-num');
        num.type = 'number';
        num.dataset.k = f.key;
        num.min = f.min;
        num.step = f.step;
        num.oninput = () => onView(num.value);
        const val = el('span', 'tm-val');
        val.append(num, document.createTextNode(f.unit));

        const row = el('div', 'tm-row tm-stack');
        const head = el('div', 'tm-row-head');
        head.append(label, val);
        const range = el('input', 'tm-range');
        range.type = 'range';
        range.dataset.k = f.key;
        range.min = f.min;
        range.step = f.step;
        range.oninput = () => onView(range.value);
        row.append(head, range);
        return row;
    }

    // 把目前設定值填回面板上的各個控制項（位置與寬度顯示實際套用、已夾回畫面內的值）
    function refreshSettingsUI() {
        const sp = document.getElementById(SETTINGS_ID);
        if (!sp) return;
        const p = layout();
        const shown = { panelRight: p.right, panelTop: p.top, panelWidth: p.width };
        for (const f of SETTING_FIELDS) {
            if (!f.key) continue;
            const stored = f.key in shown ? shown[f.key] : settings[f.key];

            if (f.type === 'switch') {
                sp.querySelector(`.tm-switch[data-k="${f.key}"]`).checked = !!stored;
                continue;
            }

            const view = +(Number(stored) * (f.scale || 1)).toFixed(3);
            const num = sp.querySelector(`.tm-num[data-k="${f.key}"]`);
            if (num !== document.activeElement) num.value = view;   // 正在輸入的數字框不要覆蓋，避免打字被打斷
            const range = sp.querySelector(`.tm-range[data-k="${f.key}"]`);
            const max = f.max();
            range.max = max;
            range.value = Math.min(Math.max(view, f.min), max);
            range.style.setProperty('--p', `${((range.value - f.min) / (max - f.min)) * 100}%`);
        }
    }

    function onSettingsKey(e) {
        if (e.key === 'Escape') closeSettings();
    }

    function openSettings() {
        if (!document.body) return;
        ensureStyles();
        if (document.getElementById(SETTINGS_ID)) {
            refreshSettingsUI();
            return;
        }

        const sp = el('div');
        sp.id = SETTINGS_ID;

        const title = el('div', 'tm-title');
        title.appendChild(el('span', '', '⚙️ 附件區塊設定'));
        const resetBtn = el('button', 'tm-mini', '重設');
        resetBtn.type = 'button';
        resetBtn.title = '全部回到預設值';
        resetBtn.onclick = () => {
            settings = Object.assign({}, DEFAULTS);
            saveSettings();
            applyVars();
            refreshHandle();
            refreshSettingsUI();
        };
        const doneBtn = el('button', 'tm-mini', '完成');
        doneBtn.type = 'button';
        doneBtn.onclick = closeSettings;
        const btns = el('div', 'tm-btns');
        btns.append(resetBtn, doneBtn);
        title.appendChild(btns);
        sp.appendChild(title);

        let group = null;
        for (const f of SETTING_FIELDS) {
            if (f.section) {
                sp.appendChild(el('div', 'tm-sec', f.section));
                group = el('div', 'tm-group');
                sp.appendChild(group);
                continue;
            }
            group.appendChild(buildSettingRow(f));
        }
        sp.appendChild(el('div', 'tm-hint', '調整後立即生效並自動儲存，腳本更新也會保留。拖曳把手可直接移動，↺ 恢復預設位置；在把手上按右鍵、按 ⚙️，或從 Tampermonkey 選單都能開啟這裡；按 Esc 關閉。'));
        sp.addEventListener('keydown', (e) => e.stopPropagation());   // 避免在數字框打字時觸發網站的快捷鍵

        document.body.appendChild(sp);
        refreshSettingsUI();
        document.addEventListener('keydown', onSettingsKey, true);
        applyFix();
    }

    function closeSettings() {
        document.getElementById(SETTINGS_ID)?.remove();
        document.removeEventListener('keydown', onSettingsKey, true);
        applyFix();
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ 附件區塊設定', openSettings);
        GM_registerMenuCommand('↺ 附件區塊位置恢復預設', resetPosition);
    }

    // ===== 主流程：套用版面 =====
    function applyFix() {
        ensureStyles();

        let sectionVisible = false;
        const sections = document.querySelectorAll('section.attachments-section');
        sections.forEach(sec => {
            if (sec.dataset.tmFixed !== '1') {
                sec.dataset.tmFixed = '1';
                const set = (name, value) => sec.style.setProperty(name, value, 'important');
                set('order', '-1');
                set('position', 'fixed');
                set('top', `calc(var(--tm-ap-top, 260px) + ${HANDLE_H}px)`);
                set('right', 'var(--tm-ap-right, 16px)');
                set('left', 'auto');
                set('bottom', 'auto');
                set('width', 'var(--tm-ap-w, 280px)');
                set('max-height', `max(120px, calc(100vh - var(--tm-ap-top, 260px) - ${HANDLE_H + 20}px))`);
                set('overflow-y', 'auto');
                set('z-index', '999999');
                set('background', 'var(--tm-ap-bg, transparent)');
                set('backdrop-filter', 'blur(var(--tm-ap-blur, 8px))');
                set('-webkit-backdrop-filter', 'blur(var(--tm-ap-blur, 8px))');
                set('border', '1px solid rgba(128, 128, 128, 0.3)');
                set('padding', '14px');
                set('border-radius', '0 0 10px 10px');
                set('box-shadow', 'none');
                set('display', 'flex');
                set('flex-direction', 'column');
            }
            if (sec.getClientRects().length) sectionVisible = true;

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

        updateHandle(sectionVisible);
    }

    applyFix();
    document.addEventListener('DOMContentLoaded', applyFix);
    window.addEventListener('load', applyFix);
    window.addEventListener('resize', () => {
        applyVars();
        refreshSettingsUI();
    });

    // 只有網頁本身的變動才重新套用；把手、設定面板、預覽框自己的變動（例如拖曳時更新座標文字）略過
    // 觀察 document 而不是 documentElement：document-start 時 <html> 有可能還沒建立
    const OWN_NODES = '#tm-ap-handle, #tm-ap-settings, #tm-ap-preview';
    new MutationObserver(mutations => {
        if (mutations.every(m => m.target.closest && m.target.closest(OWN_NODES))) return;
        applyFix();
    }).observe(document, { childList: true, subtree: true });
})();
