// ==UserScript==
// @name         已開連結標記 (1080xin.com)
// @namespace    local.visited-marker
// @version      1.1.1
// @description  自行記錄開過的連結並標記，完全不依賴瀏覽器 :visited，可解決 Chromium 分區化後 Linkclump 等擴充功能大量開啟的連結不變色的問題
// @match        *://1080xin.com/*
// @match        *://*.1080xin.com/*
// @match        *://agaghhh.cc/*
// @match        *://*.agaghhh.cc/*
// @run-at       document-start
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-visited-marker.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-visited-marker.user.js
// ==/UserScript==

/*
 運作原理
 ─────────────────────────────────────────────────────────────
 不去問瀏覽器「這個連結造訪過沒有」，而是：
   1. 每個頁面載入時，把「自己的網址」記進腳本自己的儲存空間。
      → 不管這個分頁是怎麼開的（Linkclump 大量開啟、中鍵、Ctrl+click
        都一樣），只要頁面有載入就會被記錄到。
   2. 清單頁上的每個連結，比對這份記錄，命中就套上淡化樣式與勾號。
 因為完全不碰瀏覽器歷史，Chromium 的 :visited 分區化規則怎麼改都不影響。

 關於換網域（v1.1 新增）
 ─────────────────────────────────────────────────────────────
 站台換網域時，記錄不會失效。SITE_HOSTS 裡列出的主機都視為同一個站，
 比對鍵值不含主機名。安裝後會自動把舊的 agaghhh.cc 記錄轉成新格式，
 只跑一次。以後再換網域，只要在 @match 和 SITE_HOSTS 各加一行即可。
 上面 agaghhh.cc 的兩行 @match 若用不到可以刪掉，不影響已轉好的記錄。

 安裝
 ─────────────────────────────────────────────────────────────
 Edge 的 Tampermonkey → 儀表板 → 直接編輯原本那支腳本並貼上覆蓋，
 不要另外新增一支。編輯原腳本會沿用同一份儲存空間，
 新增一支則是全新的空記錄。

 快捷鍵
 ─────────────────────────────────────────────────────────────
 Alt + 點擊連結   單獨切換該連結的已開標記（不會開啟頁面）
 Alt + M         把「用滑鼠選取到的範圍」內的連結全部標記為已開
 Alt + U         把選取範圍內的連結取消標記
 Alt + O         用頁內點擊開啟選取範圍內尚未標記的連結（見下方說明）

 關於 Alt + O
 ─────────────────────────────────────────────────────────────
 這是第二種思路：導覽由頁面自己發起，理論上能滿足三重索引條件，
 讓瀏覽器原生的紫色也回來。需要在網站權限中允許此站「快顯視窗」，
 否則只會開出第一個。是否真的變紫請自行實測；就算沒變紫，
 上面的自訂標記照樣會生效，功能不受影響。
*/

(function () {
    'use strict';

    // ===== 設定 ============================================================
    const CONFIG = {
        // 這些主機視為同一個站，比對鍵值不含主機名，換網域記錄也不會失效
        SITE_HOSTS: [
            /(^|\.)1080xin\.com$/i,
            /(^|\.)agaghhh\.cc$/i,
        ],
        SITE_KEY: 'site',

        // 標記外觀
        DIM_OPACITY: 0.45,          // 已開連結的透明度
        MARK_COLOR: '#9aa0a6',      // 已開連結的文字顏色，設成 null 表示不改顏色
        BADGE: ' ✓',                // 接在連結後面的小記號，設成 '' 表示不加
        DIM_ROW: true,              // 是否讓整列也淡一點
        ROW_SELECTOR: 'tr, li',     // 「一列」怎麼認定
        ROW_BG: 'rgba(128,128,128,.10)',

        // 網址正規化：決定兩個網址算不算同一筆
        MERGE_THREAD_PAGES: true,   // 同一主題的第 2、3 頁視為同一筆
        DROP_PARAMS: ['extra', 'highlight', 'from', 'fromuid', 'ref', 'mobile',
                      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
                      'utm_content', 'fbclid', 'gclid'],

        // 記錄規則
        RECORD_ON_LOAD: true,       // 頁面載入就把自己記起來（Linkclump 靠這個）
        RECORD_ON_CLICK: true,      // 點下去的當下也先記起來（站外連結靠這個）
        IGNORE_URL_PATTERNS: [      // 符合的網址不記錄，例如清單頁本身
            // /\/forum-\d+-\d+\.html$/,
        ],

        // Alt+O 頁內開啟
        OPEN_DELAY_MS: 150,         // 每個分頁之間的間隔
        OPEN_MAX: 60,               // 單次最多開幾個，避免手滑

        // 保養
        MAX_ENTRIES: 20000,         // 超過就丟掉最舊的
    };

    const STORE_KEY = 'seen_v1';
    const ENABLED_KEY = 'enabled_v1';
    const MIGRATED_KEY = 'host_migrated_v1';

    // ===== 儲存 ============================================================
    let store = read();
    let enabled = GM_getValue(ENABLED_KEY, true);

    function read() {
        try { return GM_getValue(STORE_KEY, {}) || {}; } catch (e) { return {}; }
    }

    // 先重讀再合併再寫回，降低多分頁同時寫入互相覆蓋的機會
    function commit(keys) {
        const fresh = read();
        const now = Date.now();
        let changed = false;
        for (const k of keys) {
            if (!fresh[k]) changed = true;
            fresh[k] = now;
        }
        if (!changed) return;
        prune(fresh);
        store = fresh;
        GM_setValue(STORE_KEY, fresh);
    }

    function forget(keys) {
        const fresh = read();
        let changed = false;
        for (const k of keys) if (fresh[k]) { delete fresh[k]; changed = true; }
        if (!changed) return;
        store = fresh;
        GM_setValue(STORE_KEY, fresh);
    }

    function prune(obj) {
        const all = Object.keys(obj);
        if (all.length <= CONFIG.MAX_ENTRIES) return;
        all.sort((a, b) => obj[a] - obj[b]);
        all.slice(0, all.length - CONFIG.MAX_ENTRIES).forEach(k => delete obj[k]);
    }

    // 舊版的鍵值帶著主機名（agaghhh.cc|tid:123），換網域後就對不上。
    // 這裡把屬於本站的主機前綴一次換成 SITE_KEY，只跑一次。
    function migrateHosts() {
        if (GM_getValue(MIGRATED_KEY, false)) return;
        const fresh = read();
        const out = {};
        let moved = 0;
        for (const k of Object.keys(fresh)) {
            const i = k.indexOf('|');
            const host = i > 0 ? k.slice(0, i) : '';
            if (host && host !== CONFIG.SITE_KEY && CONFIG.SITE_HOSTS.some(re => re.test(host))) {
                const nk = CONFIG.SITE_KEY + k.slice(i);
                out[nk] = Math.max(out[nk] || 0, fresh[k]);
                moved++;
            } else {
                out[k] = Math.max(out[k] || 0, fresh[k]);
            }
        }
        GM_setValue(MIGRATED_KEY, true);
        if (moved) {
            store = out;
            GM_setValue(STORE_KEY, out);
            console.log('[visited-marker] 已轉換 ' + moved + ' 筆舊網域記錄');
        }
    }

    // 其他分頁寫入時即時同步，清單頁不必重整就會變色
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(STORE_KEY, (name, oldVal, newVal, remote) => {
            if (!remote) return;
            store = newVal || {};
            scan();
        });
    }

    // ===== 網址正規化 ======================================================
    function hostKeyOf(hostname) {
        return CONFIG.SITE_HOSTS.some(re => re.test(hostname)) ? CONFIG.SITE_KEY : hostname;
    }

    // [已知問題] 2026-11-15 記錄，待改版修正
    // 網站改版後（Next.js），文章網址是 /resources/<id>，而且同一篇文章會帶不同的查詢參數：
    //   - 板塊列表上的連結：/resources/<id>?return=%2Fboards%2F7RHPO2w4jFUYiDhDsxz0wE
    //     （2026-11-15 實測 BT綜合區列表 23 個文章連結全部是這個格式）
    //   - 進入文章後網址列：/resources/<id>?page=1&order=asc
    // 下面的 MERGE_THREAD_PAGES 只認得舊 Discuz 的 tid / thread-123-，對 /resources/<id> 不起作用，
    // 參數又只去掉 DROP_PARAMS 裡列的，所以 return / page / order 都會進到 key 裡。可能造成：
    //   1) 從不同列表頁（不同板塊、分頁、搜尋結果，return 值不同）進同一篇文章，被當成不同筆，
    //      在 A 列表開過的文章，到 B 列表不會顯示已開
    //   2) 頁面載入時記錄的若是 ?page=1&order=asc 那種網址，就對不上列表上 ?return=… 的連結
    //      （目前列表上仍有已標記的連結，推測載入當下網址還是 ?return=…，網站之後才改寫網址；未完全確認）
    // 修正方向：
    //   - 在下方 MERGE_THREAD_PAGES 區塊加一條：路徑符合 /resources/<id> 時，只回傳 host + '|res:' + id
    //   - 比照 migrateHosts() 寫一次性轉換，把現有 site|/resources/<id>?… 的記錄合併成 site|res:<id>
    //   - 較小的替代方案：把 'return'、'page'、'order' 加進 DROP_PARAMS（但舊記錄仍需轉換）
    function keyOf(raw) {
        let u;
        try { u = new URL(raw, location.href); } catch (e) { return null; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        u.hash = '';

        const host = hostKeyOf(u.hostname);

        if (CONFIG.MERGE_THREAD_PAGES) {
            // Discuz 風格：viewthread.php?tid=123&page=2
            const tid = u.searchParams.get('tid');
            if (tid) return host + '|tid:' + tid;
            // Discuz 風格：thread-123-2-1.html
            const m = u.pathname.match(/(?:^|\/)thread-(\d+)-/);
            if (m) return host + '|tid:' + m[1];
        }

        CONFIG.DROP_PARAMS.forEach(p => u.searchParams.delete(p));
        u.searchParams.sort();
        return host + '|' + u.pathname + (u.search || '');
    }

    function ignored(url) {
        return CONFIG.IGNORE_URL_PATTERNS.some(re => re.test(url));
    }

    // ===== 樣式 ============================================================
    function injectCSS() {
        const color = CONFIG.MARK_COLOR
            ? `a[data-seen="1"], a[data-seen="1"] * { color: ${CONFIG.MARK_COLOR} !important; }` : '';
        const badge = CONFIG.BADGE
            ? `a[data-seen="1"]::after { content: "${CONFIG.BADGE}"; font-size: .85em; opacity: .8; }` : '';
        const row = CONFIG.DIM_ROW
            ? `[data-seen-row="1"] { background-color: ${CONFIG.ROW_BG} !important; }` : '';
        const css = `
            a[data-seen="1"] { opacity: ${CONFIG.DIM_OPACITY} !important; }
            ${color}
            ${badge}
            ${row}
            #vm-toast {
                position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
                background: #202124; color: #fff; font: 13px/1.5 system-ui, sans-serif;
                padding: 8px 14px; border-radius: 6px; opacity: 0;
                transition: opacity .18s; pointer-events: none;
            }
            #vm-toast.show { opacity: .94; }
            #vm-panel {
                position: fixed; inset: 0; z-index: 2147483646;
                background: rgba(0,0,0,.45); display: flex;
                align-items: center; justify-content: center;
            }
            #vm-panel > div {
                background: #fff; color: #202124; width: min(560px, 92vw);
                padding: 16px; border-radius: 8px;
                font: 13px/1.6 system-ui, sans-serif;
            }
            #vm-panel textarea {
                width: 100%; height: 240px; margin: 10px 0; box-sizing: border-box;
                font: 12px/1.4 ui-monospace, monospace; padding: 8px;
            }
            #vm-panel button { margin-left: 8px; padding: 5px 12px; cursor: pointer; }
        `;
        const el = document.createElement('style');
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
    }

    // ===== 標記 ============================================================
    function apply(a) {
        const k = keyOf(a.href);
        const hit = enabled && k && !!store[k];
        if (hit) a.setAttribute('data-seen', '1');
        else a.removeAttribute('data-seen');

        if (CONFIG.DIM_ROW) {
            const row = a.closest(CONFIG.ROW_SELECTOR);
            if (row) {
                if (hit) row.setAttribute('data-seen-row', '1');
                else if (!row.querySelector('a[data-seen="1"]')) row.removeAttribute('data-seen-row');
            }
        }
    }

    let scanTimer = null;
    function scan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            document.querySelectorAll('a[href]').forEach(apply);
        }, 60);
    }

    function watch() {
        new MutationObserver(muts => {
            for (const m of muts) {
                if (m.addedNodes.length) { scan(); return; }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    // ===== 選取範圍 ========================================================
    function anchorsInSelection() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
        const range = sel.getRangeAt(0);
        return [...document.querySelectorAll('a[href]')]
            .filter(a => a.href && range.intersectsNode(a));
    }

    // ===== 頁內開啟（第二種思路）============================================
    function openInPage(links) {
        const todo = links.slice(0, CONFIG.OPEN_MAX);
        todo.forEach((a, i) => setTimeout(() => {
            const t = a.getAttribute('target');
            const r = a.getAttribute('rel');
            a.setAttribute('target', '_blank');
            // rel="noopener" 會切斷 opener 鏈，順便拿掉，讓來源資訊得以保留
            if (r && /noopener/i.test(r)) {
                const cleaned = r.replace(/noopener/ig, '').trim();
                if (cleaned) a.setAttribute('rel', cleaned); else a.removeAttribute('rel');
            }
            a.click();
            if (t === null) a.removeAttribute('target'); else a.setAttribute('target', t);
            if (r === null) a.removeAttribute('rel'); else a.setAttribute('rel', r);
        }, i * CONFIG.OPEN_DELAY_MS));

        if (links.length > CONFIG.OPEN_MAX) {
            toast(`選到 ${links.length} 個，這次只開前 ${CONFIG.OPEN_MAX} 個`);
        } else {
            toast(`開啟 ${todo.length} 個連結`);
        }
    }

    // ===== 小提示與面板 ====================================================
    let toastEl = null, toastTimer = null;
    function toast(msg) {
        if (!document.body) return;
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'vm-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
    }

    function panel(title, text, onSave) {
        const wrap = document.createElement('div');
        wrap.id = 'vm-panel';
        wrap.innerHTML = `
            <div>
                <b></b>
                <textarea spellcheck="false"></textarea>
                <div style="text-align:right">
                    <button data-act="close">關閉</button>
                    ${onSave ? '<button data-act="save">匯入</button>' : ''}
                </div>
            </div>`;
        wrap.querySelector('b').textContent = title;
        const ta = wrap.querySelector('textarea');
        ta.value = text;
        wrap.addEventListener('click', e => {
            const act = e.target.dataset && e.target.dataset.act;
            if (act === 'close' || e.target === wrap) wrap.remove();
            if (act === 'save') { onSave(ta.value); wrap.remove(); }
        });
        document.body.appendChild(wrap);
        ta.select();
    }

    // ===== 事件 ============================================================
    function bind() {
        // Alt + 點擊：單獨切換標記，不開啟頁面
        document.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            if (e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                const k = keyOf(a.href);
                if (!k) return;
                if (store[k]) { forget([k]); toast('取消標記'); }
                else { commit([k]); toast('標記為已開'); }
                scan();
                return;
            }
            if (CONFIG.RECORD_ON_CLICK) {
                const k = keyOf(a.href);
                if (k && !ignored(a.href)) { commit([k]); apply(a); }
            }
        }, true);

        // 中鍵開新分頁
        document.addEventListener('auxclick', e => {
            if (e.button !== 1 || !CONFIG.RECORD_ON_CLICK) return;
            const a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            const k = keyOf(a.href);
            if (k && !ignored(a.href)) { commit([k]); apply(a); }
        }, true);

        document.addEventListener('keydown', e => {
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            const code = e.code;
            if (code === 'KeyM' || code === 'KeyU') {
                const links = anchorsInSelection();
                if (!links.length) return toast('先用滑鼠選取一段範圍');
                e.preventDefault();
                const keys = links.map(a => keyOf(a.href)).filter(Boolean);
                if (code === 'KeyM') { commit(keys); toast(`標記 ${keys.length} 個連結`); }
                else { forget(keys); toast(`取消 ${keys.length} 個連結`); }
                scan();
            } else if (code === 'KeyO') {
                const links = anchorsInSelection().filter(a => {
                    const k = keyOf(a.href);
                    return k && !store[k];
                });
                if (!links.length) return toast('選取範圍內沒有未開過的連結');
                e.preventDefault();
                openInPage(links);
            }
        }, true);
    }

    // ===== 選單 ============================================================
    function menu() {
        GM_registerMenuCommand(enabled ? '關閉標記顯示' : '開啟標記顯示', () => {
            enabled = !enabled;
            GM_setValue(ENABLED_KEY, enabled);
            scan();
            toast(enabled ? '標記已開啟' : '標記已關閉');
            location.reload();
        });

        GM_registerMenuCommand('把本頁所有連結標記為已開', () => {
            const keys = [...document.querySelectorAll('a[href]')]
                .map(a => keyOf(a.href)).filter(Boolean);
            commit([...new Set(keys)]);
            scan();
            toast(`標記 ${new Set(keys).size} 個連結`);
        });

        GM_registerMenuCommand('匯出記錄', () => {
            panel(`匯出（共 ${Object.keys(store).length} 筆，全選複製後自行保存）`,
                  JSON.stringify(store), null);
        });

        GM_registerMenuCommand('匯入記錄（與現有合併）', () => {
            panel('把先前匯出的內容貼進來', '', txt => {
                try {
                    const obj = JSON.parse(txt);
                    const fresh = read();
                    Object.assign(fresh, obj);
                    prune(fresh);
                    store = fresh;
                    GM_setValue(STORE_KEY, fresh);
                    scan();
                    toast(`匯入完成，共 ${Object.keys(fresh).length} 筆`);
                } catch (err) {
                    toast('內容不是有效的 JSON，沒有匯入');
                }
            });
        });

        GM_registerMenuCommand('清除全部記錄', () => {
            if (!confirm('確定要清除全部已開記錄？此動作無法復原。')) return;
            store = {};
            GM_setValue(STORE_KEY, {});
            scan();
            toast('記錄已清除');
        });

        GM_registerMenuCommand('顯示本頁的比對鍵值（除錯用）', () => {
            panel('本頁的 key。若同一篇文章在不同頁面算成兩筆，就是這裡需要調整 keyOf()',
                  keyOf(location.href) || '(無法解析)', null);
        });

        GM_registerMenuCommand('重跑舊網域記錄轉換', () => {
            GM_setValue(MIGRATED_KEY, false);
            migrateHosts();
            scan();
            toast('已重跑轉換');
        });
    }

    // ===== 啟動 ============================================================
    injectCSS();
    migrateHosts();

    if (CONFIG.RECORD_ON_LOAD && !ignored(location.href)) {
        const k = keyOf(location.href);
        if (k) commit([k]);
    }

    function start() {
        watch();
        bind();
        menu();
        scan();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
