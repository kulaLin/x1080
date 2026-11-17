// ==UserScript==
// @name         [x1080] 下載｜附件連結一鍵提取
// @namespace    https://github.com/kulaLin/x1080
// @version      2.16
// @description  自動點擊「按次數下載」並攔截真實下載網址與 Token，完成後自動關閉分頁
// @author       Gemini
// @match        *://1080xin.com/*
// @match        *://*.1080xin.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        window.close
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ===== 預設設定 =====
    // 這裡是「預設值」。實際使用的值在「⚙️ 設定」面板調整：
    //   - 在一鍵提取按鈕上按右鍵，或攔截面板上的 ⚙️，或 Tampermonkey 選單的「⚙️ 一鍵提取設定」
    // 調整後會存在 Tampermonkey 裡，腳本自動更新也不會被蓋掉；在設定面板按「重設」就回到這裡的值。
    const DEFAULTS = {
        buttonRight: 20,            // 按鈕距離畫面右邊幾 px（X 軸）
        buttonTop: null,            // 按鈕距離畫面頂端幾 px（Y 軸；null = 畫面高度的 35% 再往上 15px）
        glassOpacity: 0.3,          // 液態玻璃不透明度，類似 iOS 27 的透明度滑桿（0 = 最透明，1 = 完全不透明）
        glassTheme: 'auto',         // 液態玻璃深淺：'auto' 跟著系統淺色 / 深色模式，'light' 永遠淺色，'dark' 永遠深色
        shadowOpacity: 0.18,        // 液態玻璃陰影深淺（0 = 沒有陰影，1 = 最深）
        shadowSize: 30,             // 液態玻璃陰影大小：陰影往外擴散的範圍（px；越大越柔和、離畫面越「浮」）
        autoCloseTab: true,         // 一鍵提取完成後是否自動關閉分頁
        closeDelayMs: 100,          // 全部附件都開始下載後，等幾毫秒再關閉分頁（1000 = 1 秒）
        waitTimeoutMs: 20000,       // 最多等幾毫秒讓所有附件完成；超時代表有附件沒成功，就不自動關閉
        showPanelByDefault: false,  // 攔截面板是否預設展開（false = 收合成小按鈕）
        blockAutoDownload: false,   // 是否阻止瀏覽器自動下載（true = 只抓網址不下載）
    };
    const SETTINGS_KEY = 'settings';
    const THEMES = ['auto', 'light', 'dark'];
    const DEFAULT_TOP_CSS = 'calc(35vh - 15px)';
    const defaultTopPx = () => Math.round(window.innerHeight * 0.35 - 15);

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
            const ok = DEFAULTS[key] === null
                ? (v === null || (typeof v === 'number' && Number.isFinite(v)))
                : typeof v === typeof DEFAULTS[key] && (typeof v !== 'number' || Number.isFinite(v));
            if (ok) result[key] = v;
        }
        if (!THEMES.includes(result.glassTheme)) result.glassTheme = DEFAULTS.glassTheme;
        return result;
    }

    function saveSettings() {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(SETTINGS_KEY, Object.assign({}, settings));
        } catch (e) {}
    }

    let settings = loadSettings();

    // ===== 液態玻璃（Liquid Glass）樣式 =====
    // 半透明底色 + 背景模糊與提高飽和度 + 邊緣光線高光 + 按下時像水滴一樣微微膨脹
    // 系統開啟「減少透明度」時改成不透明，開啟「減少動態效果」時取消縮放動畫
    const GLASS_STYLE_ID = 'tm-extract-glass-style';
    const GLASS_ROOT = '#tm-float-extract-btn, #tm-float-preview, #tm-extract-toggle, #tm-extract-panel, #tm-settings-panel';
    const GLASS_BUTTONS = '#tm-float-extract-btn, #tm-float-preview, #tm-extract-toggle';
    const GLASS_SHEEN = 'linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.14) 100%)';
    const ACCENT = '#0a84ff';

    // 依目前設定算出按鈕、小按鈕與面板的位置（超出畫面時自動夾回畫面內）
    function layout() {
        const right = Math.max(0, Number(settings.buttonRight) || 0);
        const top = settings.buttonTop == null
            ? DEFAULT_TOP_CSS
            : `min(${Math.max(0, Number(settings.buttonTop) || 0)}px, calc(100vh - 110px))`;
        return {
            right: `min(${right}px, calc(100vw - 60px))`,
            panelRight: `max(10px, min(${right}px, calc(100vw - 490px)))`,
            top,
            panelTop: `calc(${top} + 60px)`,
        };
    }

    function buildGlassCSS() {
        const a = Math.min(Math.max(Number(settings.glassOpacity) || 0, 0), 1);
        const alpha = (min) => (min + a * (1 - min)).toFixed(2);   // 把 0~1 的設定換算成實際的透明度
        const pos = layout();
        // 陰影：一層大範圍的柔和陰影 + 一層貼近邊緣的細陰影（預設 = 0 10px 30px 18% 黑 + 0 2px 8px 10% 黑）
        const shadowA = Math.min(Math.max(Number(settings.shadowOpacity) || 0, 0), 1);
        const shadowPx = Math.max(0, Number(settings.shadowSize) || 0);
        const outerShadow = shadowA > 0 && shadowPx > 0
            ? `,\n                0 ${Math.round(shadowPx / 3)}px ${shadowPx}px rgba(0, 0, 0, ${shadowA.toFixed(3)}),\n                0 ${Math.max(1, Math.round(shadowPx / 15))}px ${Math.max(1, Math.round(shadowPx * 0.27))}px rgba(0, 0, 0, ${(shadowA * 0.55).toFixed(3)})`
            : '';
        const miniShadow = shadowA > 0 ? `, 0 1px 3px rgba(0, 0, 0, ${(shadowA * 0.55).toFixed(3)})` : '';
        const darkVars = `
            --tm-fill: rgba(28, 28, 32, ${alpha(0.3)});
            --tm-sheet: rgba(28, 28, 32, ${Math.max(0.8, a).toFixed(2)});
            --tm-solid: rgb(44, 44, 46);
            --tm-text: #f5f5f7;
            --tm-sub: rgba(245, 245, 247, 0.6);
            --tm-rim: rgba(255, 255, 255, 0.5);
            --tm-edge: rgba(255, 255, 255, 0.18);
            --tm-divider: rgba(255, 255, 255, 0.12);
            --tm-mini: rgba(255, 255, 255, 0.12);
            --tm-track: rgba(120, 120, 128, 0.36);
            --tm-seg-on: rgba(99, 99, 102, 0.95);
            --tm-link: #30d158;
            --tm-token: #ff9f0a;`;
        const darkBlock = settings.glassTheme === 'dark' ? `${GLASS_ROOT} {${darkVars}\n        }`
            : settings.glassTheme === 'light' ? ''
            : `@media (prefers-color-scheme: dark) {\n        ${GLASS_ROOT} {${darkVars}\n        }\n        }`;

        return `
        ${GLASS_ROOT} {
            --tm-fill: rgba(255, 255, 255, ${alpha(0.12)});
            --tm-sheet: rgba(255, 255, 255, ${Math.max(0.78, a).toFixed(2)});
            --tm-solid: rgb(242, 242, 247);
            --tm-text: #1d1d1f;
            --tm-sub: rgba(29, 29, 31, 0.55);
            --tm-rim: rgba(255, 255, 255, 0.9);
            --tm-edge: rgba(255, 255, 255, 0.45);
            --tm-divider: rgba(0, 0, 0, 0.08);
            --tm-mini: rgba(255, 255, 255, 0.35);
            --tm-track: rgba(120, 120, 128, 0.2);
            --tm-seg-on: #ffffff;
            --tm-link: #1a7f37;
            --tm-token: #b54708;
            position: fixed;
            right: ${pos.right};
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
                inset 0 0 18px rgba(255, 255, 255, 0.12)${outerShadow};
            transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
        }
        ${darkBlock}
        /* 邊緣的光線高光：左上與右下較亮，像光線打在玻璃邊緣 */
        #tm-float-extract-btn::before, #tm-float-preview::before, #tm-extract-toggle::before, #tm-extract-panel::before, #tm-settings-panel::before {
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
        ${GLASS_BUTTONS} {
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
        #tm-float-extract-btn, #tm-float-preview {
            top: ${pos.top};
            padding: 12px 22px;
            font-size: 15px;
        }
        #tm-extract-toggle {
            top: ${pos.panelTop};
            padding: 7px 16px;
            font-size: 13px;
        }
        #tm-float-extract-btn:hover, #tm-float-preview:hover, #tm-extract-toggle:hover { transform: scale(1.04); filter: brightness(1.06); }
        #tm-float-extract-btn:active, #tm-float-preview:active, #tm-extract-toggle:active { transform: scale(1.09); filter: brightness(1.12); transition-duration: 0.2s; }
        #tm-float-extract-btn:focus-visible, #tm-float-preview:focus-visible, #tm-extract-toggle:focus-visible { outline: 2px solid rgba(10, 132, 255, 0.7); outline-offset: 3px; }

        /* 攔截面板 */
        #tm-extract-panel {
            top: ${pos.panelTop};
            right: ${pos.panelRight};
            width: 480px;
            max-width: 90vw;
            padding: 12px 16px;
            border-radius: 22px;
            font-size: 13px;
            line-height: 1.6;
        }
        #tm-extract-panel .tm-title, #tm-settings-panel .tm-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; }
        #tm-extract-panel .tm-btns, #tm-settings-panel .tm-btns { display: flex; gap: 6px; }
        #tm-extract-panel .tm-mini, #tm-settings-panel .tm-mini {
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
            box-shadow: inset 0 1px 1px var(--tm-rim)${miniShadow};
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
        }
        #tm-extract-panel .tm-mini:hover, #tm-settings-panel .tm-mini:hover { transform: scale(1.06); filter: brightness(1.06); }
        #tm-extract-panel .tm-mini:active, #tm-settings-panel .tm-mini:active { transform: scale(1.12); }
        #tm-extract-list {
            word-break: break-all;
            font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            max-height: min(250px, calc(100vh - ${pos.panelTop} - 90px));
            overflow-y: auto;
        }
        #tm-extract-list .tm-item { padding: 6px 0; border-top: 1px solid var(--tm-divider); }
        #tm-extract-list .tm-label { color: var(--tm-sub); }
        #tm-extract-list .tm-link { color: var(--tm-link); text-decoration: underline; }
        #tm-extract-list .tm-token { color: var(--tm-token); }

        /* 設定面板（畫面正中央）：比按鈕更不透明，方便閱讀；透明度滑桿的效果請看按鈕 */
        #tm-settings-panel {
            background: ${GLASS_SHEEN}, var(--tm-sheet);
            top: 50%;
            left: 50%;
            right: auto;
            transform: translate(-50%, -50%);
            width: 360px;
            max-width: calc(100vw - 24px);
            max-height: calc(100vh - 24px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: 14px 16px 16px;
            border-radius: 24px;
            font-size: 13px;
            line-height: 1.5;
        }
        #tm-settings-panel::before { inset: 0; }
        /* 標題列固定在上方，項目太多時只有下面的內容捲動 */
        #tm-settings-panel .tm-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -16px; padding: 0 16px; }
        #tm-settings-panel .tm-title { font-size: 15px; }
        #tm-settings-panel .tm-sec { margin: 12px 4px 6px; font-size: 12px; font-weight: 600; color: var(--tm-sub); }
        #tm-settings-panel .tm-group { border-radius: 14px; background: var(--tm-mini); border: 1px solid var(--tm-edge); overflow: hidden; }
        #tm-settings-panel .tm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0; padding: 9px 12px; border-top: 1px solid var(--tm-divider); cursor: default; }
        #tm-settings-panel .tm-row:first-child { border-top: 0; }
        #tm-settings-panel label.tm-row { cursor: pointer; }
        #tm-settings-panel .tm-row.tm-stack { flex-direction: column; align-items: stretch; gap: 4px; }
        #tm-settings-panel .tm-row-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        #tm-settings-panel .tm-val { display: inline-flex; align-items: center; gap: 4px; color: var(--tm-sub); white-space: nowrap; }
        /* 網站本身的 input 樣式（高度、邊框、陰影）會把滑桿與數字框撐大，尺寸相關的屬性用 !important 固定 */
        #tm-settings-panel .tm-num {
            -webkit-appearance: none;
            appearance: none;
            -moz-appearance: textfield;
            box-sizing: border-box;
            width: 68px !important;
            margin: 0 !important;
            padding: 3px 8px !important;
            border-radius: 8px !important;
            border: 1px solid var(--tm-edge) !important;
            background: var(--tm-mini) !important;
            color: var(--tm-text);
            font: inherit;
            text-align: right;
            height: 28px !important;
            min-height: 0 !important;
            max-height: none !important;
            box-shadow: none !important;
            line-height: 20px !important;
            font-size: 13px !important;
        }
        #tm-settings-panel .tm-num:focus { outline: 2px solid rgba(10, 132, 255, 0.6); outline-offset: 1px; }
        #tm-settings-panel .tm-range {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 4px !important;
            margin: 10px 0 6px !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 999px !important;
            min-height: 0 !important;
            max-height: none !important;
            box-shadow: none !important;
            background: linear-gradient(to right, ${ACCENT} var(--p, 0%), var(--tm-track) var(--p, 0%));
            outline: none;
            cursor: pointer;
        }
        #tm-settings-panel .tm-range::-webkit-slider-thumb {
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
        #tm-settings-panel .tm-range:active::-webkit-slider-thumb { transform: scale(1.15); }
        #tm-settings-panel .tm-range::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #fff;
            border: 0;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        #tm-settings-panel .tm-switch {
            -webkit-appearance: none;
            appearance: none;
            position: relative;
            flex: none;
            width: 46px !important;
            height: 28px !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 999px !important;
            background: var(--tm-track);
            cursor: pointer;
            transition: background 0.25s ease;
            min-height: 0 !important;
            max-height: none !important;
            padding: 0 !important;
            box-shadow: none !important;
        }
        #tm-settings-panel .tm-switch::after {
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
        #tm-settings-panel .tm-switch:checked { background: ${ACCENT}; }
        #tm-settings-panel .tm-switch:checked::after { transform: translateX(18px); }
        #tm-settings-panel .tm-switch:focus-visible { outline: 2px solid rgba(10, 132, 255, 0.6); outline-offset: 2px; }
        #tm-settings-panel .tm-seg { display: inline-flex; flex: none; padding: 2px; border-radius: 9px; background: var(--tm-track); }
        #tm-settings-panel .tm-seg button {
            -webkit-appearance: none;
            appearance: none;
            margin: 0;
            padding: 4px 12px;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--tm-text);
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.5;
            cursor: pointer;
            transition: background 0.2s ease;
        }
        #tm-settings-panel .tm-seg button.tm-on { background: var(--tm-seg-on); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
        #tm-settings-panel .tm-hint { margin: 12px 4px 0; font-size: 11px; color: var(--tm-sub); }

        @media (prefers-reduced-transparency: reduce) {
            ${GLASS_ROOT} { --tm-fill: var(--tm-solid); --tm-sheet: var(--tm-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            ${GLASS_BUTTONS}, #tm-extract-panel .tm-mini, #tm-settings-panel .tm-mini { transition: none !important; transform: none !important; }
        }
    `;
    }

    // 把液態玻璃樣式放進網頁；設定改變時重新產生（若被網站換頁時移除，下次檢查會補回）
    function applyGlassStyle() {
        let style = document.getElementById(GLASS_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = GLASS_STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        const css = buildGlassCSS();
        if (style.textContent !== css) style.textContent = css;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
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

        applyGlassStyle();
        let panel = document.getElementById('tm-extract-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'tm-extract-panel';

            const titleBar = el('div', 'tm-title');
            titleBar.appendChild(el('span', '', '🎯 已攔截的下載資訊'));

            const copyBtn = el('button', 'tm-mini', '📋 複製全部');
            copyBtn.type = 'button';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(Array.from(extractedLinks).join('\n'));
                copyBtn.textContent = '✅ 已複製！';
                setTimeout(() => { copyBtn.textContent = '📋 複製全部'; }, 2000);
            };

            const gearBtn = el('button', 'tm-mini', '⚙️');
            gearBtn.type = 'button';
            gearBtn.title = '設定';
            gearBtn.onclick = openSettings;

            const closeBtn = el('button', 'tm-mini', '✕');
            closeBtn.type = 'button';
            closeBtn.title = '收合';
            closeBtn.onclick = () => setPanelVisible(false);

            const btnGroup = el('div', 'tm-btns');
            btnGroup.append(copyBtn, gearBtn, closeBtn);

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

            setPanelVisible(settings.showPanelByDefault);
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
            if (settings.blockAutoDownload) return;
        }
        return origClick.apply(this, arguments);
    };

    const origOpen = pageWindow.open;
    pageWindow.open = function(url, ...rest) {
        if (url) {
            showResultOnUI('最終下載網址', url);
            if (settings.blockAutoDownload) return null;
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

    // 3. 設定面板
    // scale：面板上顯示的數字 = 儲存的值 × scale（例如不透明度存 0.3、顯示 30%；等待時間存毫秒、顯示秒）
    const floatWidth = () => (document.getElementById('tm-float-extract-btn') || document.getElementById('tm-float-preview'))?.offsetWidth || 230;
    const SETTING_FIELDS = [
        { section: '位置' },
        { key: 'buttonRight', label: '水平位置（X 軸，距離右邊）', type: 'range', unit: 'px', min: 0, step: 1, max: () => Math.max(100, window.innerWidth - floatWidth() - 10) },
        { key: 'buttonTop', label: '垂直位置（Y 軸，距離頂端）', type: 'range', unit: 'px', min: 0, step: 1, max: () => Math.max(100, window.innerHeight - 110) },
        { section: '外觀' },
        { key: 'glassOpacity', label: '玻璃不透明度', type: 'range', unit: '%', min: 0, step: 1, max: () => 100, scale: 100 },
        { key: 'glassTheme', label: '玻璃深淺', type: 'seg', options: [['auto', '自動'], ['light', '淺色'], ['dark', '深色']] },
        { section: '陰影' },
        { key: 'shadowOpacity', label: '陰影深淺（0% = 沒有陰影）', type: 'range', unit: '%', min: 0, step: 1, max: () => 100, scale: 100 },
        { key: 'shadowSize', label: '陰影大小', type: 'range', unit: 'px', min: 0, step: 1, max: () => 80 },
        { section: '行為' },
        { key: 'autoCloseTab', label: '完成後自動關閉分頁', type: 'switch' },
        { key: 'closeDelayMs', label: '關閉分頁前等待', type: 'number', unit: '毫秒', min: 0, step: 100 },
        { key: 'waitTimeoutMs', label: '最多等待附件完成', type: 'number', unit: '秒', min: 1, step: 1, scale: 0.001 },
        { key: 'showPanelByDefault', label: '攔截面板預設展開', type: 'switch' },
        { key: 'blockAutoDownload', label: '只抓網址、不下載', type: 'switch' },
    ];

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        applyGlassStyle();
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

        if (f.type === 'seg') {
            const row = el('div', 'tm-row');
            const seg = el('div', 'tm-seg');
            seg.dataset.k = f.key;
            for (const [value, text] of f.options) {
                const b = el('button', '', text);
                b.type = 'button';
                b.dataset.v = value;
                b.onclick = () => setSetting(f.key, value);
                seg.appendChild(b);
            }
            row.append(label, seg);
            return row;
        }

        // 數字（range = 滑桿 + 數字框；number = 只有數字框）
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

        if (f.type === 'number') {
            const row = el('div', 'tm-row');
            row.append(label, val);
            return row;
        }

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

    // 把目前設定值填回面板上的各個控制項
    function refreshSettingsUI() {
        const sp = document.getElementById('tm-settings-panel');
        if (!sp) return;
        for (const f of SETTING_FIELDS) {
            if (!f.key) continue;
            let stored = settings[f.key];
            if (f.key === 'buttonTop' && stored == null) stored = defaultTopPx();

            if (f.type === 'switch') {
                sp.querySelector(`.tm-switch[data-k="${f.key}"]`).checked = !!stored;
                continue;
            }
            if (f.type === 'seg') {
                sp.querySelectorAll(`.tm-seg[data-k="${f.key}"] button`).forEach(b => b.classList.toggle('tm-on', b.dataset.v === stored));
                continue;
            }

            const view = +(stored * (f.scale || 1)).toFixed(3);
            const num = sp.querySelector(`.tm-num[data-k="${f.key}"]`);
            if (num !== document.activeElement) num.value = view;   // 正在輸入的數字框不要覆蓋，避免打字被打斷
            const range = sp.querySelector(`.tm-range[data-k="${f.key}"]`);
            if (range) {
                const max = f.max();
                range.max = max;
                range.value = Math.min(Math.max(view, f.min), max);
                range.style.setProperty('--p', `${((range.value - f.min) / (max - f.min)) * 100}%`);
            }
        }
    }

    function onSettingsKey(e) {
        if (e.key === 'Escape') closeSettings();
    }

    function openSettings() {
        if (!document.body) return;
        applyGlassStyle();
        if (document.getElementById('tm-settings-panel')) {
            refreshSettingsUI();
            return;
        }

        // 頁面上沒有一鍵提取按鈕時，放一個預覽按鈕，方便看位置與透明度
        if (!document.getElementById('tm-float-extract-btn') && !document.getElementById('tm-float-preview')) {
            const preview = el('button', '', '⚡ 一鍵提取下載連結（預覽）');
            preview.id = 'tm-float-preview';
            preview.type = 'button';
            document.body.appendChild(preview);
        }

        const sp = document.createElement('div');
        sp.id = 'tm-settings-panel';

        const title = el('div', 'tm-title');
        title.appendChild(el('span', '', '⚙️ 一鍵提取設定'));
        const resetBtn = el('button', 'tm-mini', '重設');
        resetBtn.type = 'button';
        resetBtn.title = '全部回到預設值';
        resetBtn.onclick = () => {
            settings = Object.assign({}, DEFAULTS);
            saveSettings();
            applyGlassStyle();
            refreshSettingsUI();
        };
        const doneBtn = el('button', 'tm-mini', '完成');
        doneBtn.type = 'button';
        doneBtn.onclick = closeSettings;
        const btns = el('div', 'tm-btns');
        btns.append(resetBtn, doneBtn);
        title.appendChild(btns);
        sp.appendChild(title);

        const body = el('div', 'tm-body');
        sp.appendChild(body);
        let group = null;
        for (const f of SETTING_FIELDS) {
            if (f.section) {
                body.appendChild(el('div', 'tm-sec', f.section));
                group = el('div', 'tm-group');
                body.appendChild(group);
                continue;
            }
            group.appendChild(buildSettingRow(f));
        }
        body.appendChild(el('div', 'tm-hint', '調整後立即生效並自動儲存，腳本更新也會保留。在一鍵提取按鈕上按右鍵、攔截面板的 ⚙️，或 Tampermonkey 選單都能開啟這裡；按 Esc 關閉。'));

        document.body.appendChild(sp);
        refreshSettingsUI();
        document.addEventListener('keydown', onSettingsKey, true);
    }

    function closeSettings() {
        document.getElementById('tm-settings-panel')?.remove();
        document.getElementById('tm-float-preview')?.remove();
        document.removeEventListener('keydown', onSettingsKey, true);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ 一鍵提取設定', openSettings);
    }

    // 4. 定期檢查頁面並插入按鈕
    //
    // [已知問題] 2026-11-15 記錄，待後續改版修正
    // 現象：1080xin 是單頁應用（Next.js），從列表點進文章、或在文章之間切換時不會重新載入頁面。
    //       懸浮按鈕只在第一次出現時建立，並在 onclick 閉包中固定住當下的 dlButtons。
    //       因此在同一分頁換到另一篇文章後：
    //         1) 按鈕上的數量 (N) 仍是第一篇的數量
    //         2) 點擊時會去點第一篇已被移除的舊按鈕，實際上沒有作用，最後等到 waitTimeoutMs 超時
    //         3) 換到沒有附件的頁面時，懸浮按鈕仍留在畫面上
    // 影響：每篇文章都開新分頁使用時不會發生。
    // 修正方向：
    //   - 每次 setInterval 都重新查詢 dlButtons，並更新按鈕文字的數量
    //   - onclick 內改為點擊「當下」查到的按鈕，而不是建立時存下的清單
    //   - 查不到下載按鈕時移除懸浮按鈕；網址（location.pathname）改變時重置 extractedLinks、tokenCount 與攔截面板
    setInterval(() => {
        if (!document.body) return;
        applyGlassStyle();

        // 尋找頁面上是否有附件或「按次數下載」按鈕
        const dlButtons = Array.from(document.querySelectorAll('article.attachment .file-get button, button')).filter(
            b => b.textContent && b.textContent.includes('按次數下載')
        );

        let floatBtn = document.getElementById('tm-float-extract-btn');

        if (dlButtons.length > 0 && !floatBtn) {
            document.getElementById('tm-float-preview')?.remove();
            floatBtn = document.createElement('button');
            floatBtn.id = 'tm-float-extract-btn';
            floatBtn.type = 'button';
            floatBtn.title = '右鍵：開啟設定';
            floatBtn.oncontextmenu = (e) => {
                e.preventDefault();
                openSettings();
            };

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
                const allDone = await waitFor(() => tokenCount - startCount >= dlButtons.length, settings.waitTimeoutMs);
                const doneCount = Math.min(tokenCount - startCount, dlButtons.length);
                running = false;

                if (allDone && settings.autoCloseTab) {
                    const delayMs = Math.max(0, Number(settings.closeDelayMs) || 0);
                    // 毫秒 ÷ 1000 = 秒數，這裡的 1000 是固定換算，不要改
                    floatBtn.textContent = `✅ 提取完成，${delayMs / 1000} 秒後關閉分頁（點此取消）`;
                    closeTimer = setTimeout(() => {
                        closeTimer = null;
                        window.close();
                        // 分頁若還在，代表瀏覽器不允許關閉
                        setTimeout(() => {
                            floatBtn.textContent = '⚠️ 無法自動關閉此分頁';
                            setTimeout(resetFloatBtn, 5000);
                        }, 1000);
                    }, delayMs);
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
