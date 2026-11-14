// ==UserScript==
// @name         [x1080] 瀏覽｜板塊新文章通知
// @namespace    https://github.com/kulaLin/x1080
// @version      1.0.1
// @description  定時檢查關注的 1080xin 板塊，有新文章就用 Telegram 與桌面通知提醒；需保留一個 1080xin 分頁開著（建議釘選）
// @match        *://1080xin.com/*
// @match        *://*.1080xin.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      api.telegram.org
// @connect      1080xin.com
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-board-watch.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-board-watch.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ===== 設定 ============================================================
    // ★ 關注的板塊：name 是通知上顯示的名稱，url 是板塊網址（可帶 category_id 篩選分類）
    const BOARDS = [
        { name: '高清有碼', url: '/boards/2SeUSjSuXYiPAfTkWMNc9T' },
        { name: '外挂字幕', url: '/boards/0YB5HUwgTlLJnll5PR3Sxz' },
        { name: '亞洲SM', url: '/boards/5Vq0rCx89xT1rMiJ6ZAw42' },
        { name: 'BT綜合區（無碼HD）', url: '/boards/7RHPO2w4jFUYiDhDsxz0wE?category_id=2lrSOyEwyacrCPS2aN7ZM6' },
    ];
    // ★ 幾分鐘檢查一次（建議 10 以上，對網站比較友善）
    const CHECK_INTERVAL_MIN = 10;
    // ★ 通知方式
    const NOTIFY_TELEGRAM = true;
    const NOTIFY_DESKTOP = true;
    // ★ Telegram 訊息是否列出文章標題（false = 只通知「某板塊有 N 篇新文章」，手機鎖定畫面比較不會露出標題）
    const TELEGRAM_SHOW_TITLES = true;
    // ★ 每個板塊之間間隔幾毫秒再讀下一個
    const GAP_BETWEEN_BOARDS_MS = 3000;
    // 每個板塊最多記住幾篇已看過的文章
    const MAX_SEEN_PER_BOARD = 500;

    // ===== 內部狀態鍵值 =====================================================
    const K_LAST_CHECK = 'lastCheckAt';
    const K_LOCK = 'checkLock';
    const K_PAUSED = 'paused';
    const K_TG_TOKEN = 'telegramToken';
    const K_TG_CHAT = 'telegramChatId';
    const K_LAST_RESULT = 'lastResult';
    const K_LAST_WARN = 'lastWarnAt';
    const seenKey = board => 'seen:' + board.url;

    const TAB_ID = Math.random().toString(36).slice(2);
    const TICK_MS = 60 * 1000;
    const LOCK_MS = 3 * 60 * 1000;
    const WARN_EVERY_MS = 6 * 60 * 60 * 1000;

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const now = () => Date.now();

    // ===== 讀取板塊 ========================================================
    // v1.0 直接在腳本環境呼叫 fetch，實測全部被網站擋下（HTTP 403）：腳本環境發出的請求
    // 不會被當成網頁本身的請求，登入狀態與網站驗證的 cookie 沒有帶上。
    // 改為依序嘗試：① 借用網頁本身的 fetch（與瀏覽網頁時的請求相同）② Tampermonkey 的 GM_xmlhttpRequest
    // ③ 在隱藏的 iframe 載入板塊頁再讀取（等同正常開啟網頁，最穩但最耗資源，只在前兩種都失敗時使用）
    let lastMethod = '';

    function pageFetchText(url) {
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        return w.fetch(url, { credentials: 'include' })
            .then(async r => ({ status: r.status, text: await r.text() }));
    }

    function gmFetchText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: location.origin + url,
                anonymous: false,
                timeout: 20000,
                onload: r => resolve({ status: r.status, text: r.responseText }),
                onerror: () => reject(new Error('GM 請求失敗')),
                ontimeout: () => reject(new Error('GM 請求逾時'))
            });
        });
    }

    function iframeFetchText(url) {
        return new Promise((resolve, reject) => {
            const f = document.createElement('iframe');
            f.setAttribute('aria-hidden', 'true');
            f.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
            let timer = null;
            const finish = fn => {
                clearTimeout(timer);
                setTimeout(() => f.remove(), 0);
                fn();
            };
            timer = setTimeout(() => finish(() => reject(new Error('逾時'))), 30000);
            f.onload = () => {
                try {
                    const doc = f.contentDocument;
                    const html = doc && doc.documentElement ? doc.documentElement.outerHTML : '';
                    finish(() => resolve({ status: html ? 200 : 0, text: html }));
                } catch (e) {
                    finish(() => reject(new Error('無法讀取')));
                }
            };
            f.src = url;
            document.body.appendChild(f);
        });
    }

    const isBlocked = r => r.status !== 200 || /cf-chl|Just a moment/i.test(r.text);

    async function getBoardHtml(board) {
        const tried = [];
        for (const [name, fn] of [['網頁 fetch', pageFetchText], ['GM_xmlhttpRequest', gmFetchText], ['iframe', iframeFetchText]]) {
            try {
                const r = await fn(board.url);
                if (!isBlocked(r)) {
                    lastMethod = name;
                    return r.text;
                }
                tried.push(`${name} HTTP ${r.status}`);
            } catch (e) {
                tried.push(`${name} ${e.message}`);
            }
        }
        const err = new Error(`讀取失敗（${tried.join('；')}），可能需要在瀏覽器重新登入或通過網站驗證`);
        err.needsAttention = true;
        throw err;
    }

    async function fetchBoard(board) {
        const html = await getBoardHtml(board);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = [];
        const seenIds = new Set();
        doc.querySelectorAll('.thread-line').forEach(row => {
            const a = row.querySelector('a.resource-title[href^="/resources/"]');
            if (!a) return;
            const id = a.getAttribute('href').split('?')[0].split('/')[2];
            if (!id || seenIds.has(id)) return;
            seenIds.add(id);
            const cat = row.querySelector('.topic-category');
            items.push({
                id,
                title: a.textContent.trim(),
                category: cat ? cat.textContent.trim() : '',
                url: location.origin + '/resources/' + id
            });
        });
        if (!items.length) {
            const err = new Error('讀到頁面但找不到文章列表，網站版面可能改了');
            err.needsAttention = true;
            throw err;
        }
        return items;
    }

    async function checkBoard(board) {
        const items = await fetchBoard(board);
        const stored = GM_getValue(seenKey(board), null);

        // 第一次檢查：只記錄現有文章，不通知
        if (!Array.isArray(stored)) {
            GM_setValue(seenKey(board), items.map(i => i.id).slice(0, MAX_SEEN_PER_BOARD));
            return { board, fresh: [], firstRun: true, total: items.length };
        }

        // 寫入前重讀一次，降低多分頁同時檢查造成重複通知
        const latest = GM_getValue(seenKey(board), stored);
        const seen = new Set(latest);
        const fresh = items.filter(i => !seen.has(i.id));
        if (fresh.length) {
            GM_setValue(seenKey(board), [...fresh.map(i => i.id), ...latest].slice(0, MAX_SEEN_PER_BOARD));
        }
        // 整頁都是新文章，代表兩次檢查之間可能還有更多被擠到下一頁
        const maybeMore = fresh.length === items.length;
        return { board, fresh, firstRun: false, total: items.length, maybeMore };
    }

    // ===== 通知 ============================================================
    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function telegramSend(text) {
        const token = GM_getValue(K_TG_TOKEN, '');
        const chatId = GM_getValue(K_TG_CHAT, '');
        if (!token || !chatId) return Promise.reject(new Error('尚未設定 Telegram（Tampermonkey 選單 → 設定 Telegram）'));
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://api.telegram.org/bot${token}/sendMessage`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                }),
                timeout: 20000,
                onload(res) {
                    let json = null;
                    try { json = JSON.parse(res.responseText); } catch (e) { /* ignore */ }
                    if (res.status === 200 && json && json.ok) return resolve();
                    reject(new Error('Telegram 傳送失敗：' + ((json && json.description) || 'HTTP ' + res.status)));
                },
                onerror() { reject(new Error('無法連線到 Telegram')); },
                ontimeout() { reject(new Error('Telegram 連線逾時')); }
            });
        });
    }

    // Telegram 單則訊息上限 4096 字，超過就分段
    async function telegramSendLong(lines) {
        let buf = '';
        for (const line of lines) {
            if ((buf + '\n' + line).length > 3800) {
                await telegramSend(buf);
                buf = line;
            } else {
                buf = buf ? buf + '\n' + line : line;
            }
        }
        if (buf) await telegramSend(buf);
    }

    function desktopNotify(title, text, url) {
        GM_notification({
            title,
            text,
            timeout: 15000,
            onclick: () => { if (url) GM_openInTab(url, { active: true }); }
        });
    }

    async function notifyFresh(results) {
        const withNew = results.filter(r => r.fresh && r.fresh.length);
        if (!withNew.length) return;

        if (NOTIFY_DESKTOP) {
            withNew.forEach(r => {
                // 由舊到新（板塊列表是新的在上面）
                const list = [...r.fresh].reverse();
                if (list.length <= 3) {
                    list.forEach(i => desktopNotify(`[${r.board.name}] 新文章`, i.title, i.url));
                } else {
                    desktopNotify(
                        `[${r.board.name}] ${list.length} 篇新文章`,
                        list.slice(-3).map(i => i.title).join('\n') + '\n…',
                        location.origin + r.board.url
                    );
                }
            });
        }

        if (NOTIFY_TELEGRAM) {
            const lines = [];
            withNew.forEach(r => {
                const list = [...r.fresh].reverse();
                lines.push(`<b>[${escapeHtml(r.board.name)}] ${list.length} 篇新文章</b>` +
                    (r.maybeMore ? '（整頁都是新的，可能還有更多）' : ''));
                if (TELEGRAM_SHOW_TITLES) {
                    list.forEach(i => lines.push(`• <a href="${escapeHtml(i.url)}">${escapeHtml(i.title)}</a>`));
                } else {
                    lines.push(`<a href="${escapeHtml(location.origin + r.board.url)}">開啟板塊</a>`);
                }
                lines.push('');
            });
            try {
                await telegramSendLong(lines);
            } catch (e) {
                console.warn('[board-watch]', e.message);
                if (NOTIFY_DESKTOP) desktopNotify('板塊新文章通知', e.message);
            }
        }
    }

    // 讀取失敗等需要處理的狀況，每 6 小時最多提醒一次
    async function warnOnce(msg) {
        if (now() - GM_getValue(K_LAST_WARN, 0) < WARN_EVERY_MS) return;
        GM_setValue(K_LAST_WARN, now());
        if (NOTIFY_DESKTOP) desktopNotify('板塊新文章通知：需要處理', msg);
        if (NOTIFY_TELEGRAM) {
            try { await telegramSend('⚠️ 板塊新文章通知：' + escapeHtml(msg)); } catch (e) { /* ignore */ }
        }
    }

    // ===== 檢查流程（多分頁只讓一個分頁執行）================================
    async function runCheck(force) {
        if (!force && GM_getValue(K_PAUSED, false)) return;

        const lock = GM_getValue(K_LOCK, null);
        if (lock && lock.until > now() && lock.owner !== TAB_ID) return;
        GM_setValue(K_LOCK, { owner: TAB_ID, until: now() + LOCK_MS });
        await sleep(800 + Math.random() * 700);
        const held = GM_getValue(K_LOCK, null);
        if (!held || held.owner !== TAB_ID) return; // 被其他分頁搶先

        const results = [];
        const errors = [];
        try {
            for (let i = 0; i < BOARDS.length; i++) {
                try {
                    results.push(await checkBoard(BOARDS[i]));
                } catch (e) {
                    errors.push(`${BOARDS[i].name}：${e.message}`);
                    if (e.needsAttention) await warnOnce(`${BOARDS[i].name}：${e.message}`);
                }
                if (i < BOARDS.length - 1) await sleep(GAP_BETWEEN_BOARDS_MS);
            }
            await notifyFresh(results);
        } finally {
            GM_setValue(K_LAST_CHECK, now());
            GM_setValue(K_LAST_RESULT, {
                at: now(),
                boards: results.map(r => ({
                    name: r.board.name,
                    fresh: r.fresh.length,
                    firstRun: r.firstRun
                })),
                errors,
                method: lastMethod
            });
            GM_setValue(K_LOCK, null);
        }
    }

    function tick() {
        if (GM_getValue(K_PAUSED, false)) return;
        const due = now() - GM_getValue(K_LAST_CHECK, 0) >= CHECK_INTERVAL_MIN * 60 * 1000;
        if (due) runCheck(false).catch(e => console.warn('[board-watch]', e));
    }

    // ===== 選單 ============================================================
    function configureTelegram() {
        const hasToken = !!GM_getValue(K_TG_TOKEN, '');
        const tokenInput = prompt(
            '請輸入 Telegram bot token（向 @BotFather 取得，格式像 123456789:AA…）' +
            (hasToken ? '\n留空則沿用目前已儲存的 token' : ''),
            ''
        );
        if (tokenInput === null) return;
        const token = tokenInput.trim() || GM_getValue(K_TG_TOKEN, '');
        if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
            alert('bot token 格式不正確');
            return;
        }
        const chatInput = prompt('請輸入你的 chat id（純數字，群組為負數）：', GM_getValue(K_TG_CHAT, ''));
        if (chatInput === null) return;
        const chatId = chatInput.trim();
        if (!/^-?\d+$/.test(chatId)) {
            alert('chat id 格式不正確，應為數字');
            return;
        }
        GM_setValue(K_TG_TOKEN, token);
        GM_setValue(K_TG_CHAT, chatId);
        alert('Telegram 設定已儲存，可用選單「測試 Telegram 通知」確認。');
    }

    function showStatus() {
        const r = GM_getValue(K_LAST_RESULT, null);
        const paused = GM_getValue(K_PAUSED, false);
        const last = GM_getValue(K_LAST_CHECK, 0);
        const next = last ? new Date(last + CHECK_INTERVAL_MIN * 60 * 1000) : null;
        const lines = [
            `狀態：${paused ? '已暫停' : '監控中'}（每 ${CHECK_INTERVAL_MIN} 分鐘）`,
            `上次檢查：${last ? new Date(last).toLocaleString('zh-TW', { hour12: false }) : '尚未檢查'}`,
            `下次檢查：${next && !paused ? next.toLocaleString('zh-TW', { hour12: false }) + ' 之後' : '—'}`,
            `Telegram：${GM_getValue(K_TG_TOKEN, '') && GM_getValue(K_TG_CHAT, '') ? '已設定' : '未設定'}`,
            ''
        ];
        if (r && r.method) lines.push(`讀取方式：${r.method}`, '');
        if (r) {
            r.boards.forEach(b => lines.push(`${b.name}：${b.firstRun ? '首次記錄' : `新文章 ${b.fresh} 篇`}`));
            r.errors.forEach(e => lines.push('⚠️ ' + e));
        }
        lines.push('', '提醒：需保留至少一個 1080xin 分頁開著才會檢查。');
        alert(lines.join('\n'));
    }

    GM_registerMenuCommand('立即檢查', () => {
        GM_setValue(K_LOCK, null);
        runCheck(true).then(showStatus);
    });
    GM_registerMenuCommand('顯示監控狀態', showStatus);
    GM_registerMenuCommand('暫停／恢復監控', () => {
        const p = !GM_getValue(K_PAUSED, false);
        GM_setValue(K_PAUSED, p);
        alert(p ? '已暫停監控' : '已恢復監控');
    });
    GM_registerMenuCommand('設定 Telegram（bot token 與 chat id）', configureTelegram);
    GM_registerMenuCommand('測試 Telegram 通知', () => {
        telegramSend('✅ 板塊新文章通知：Telegram 測試成功')
            .then(() => alert('已送出測試訊息，請到 Telegram 確認'))
            .catch(e => alert(e.message));
    });
    GM_registerMenuCommand('重設已看過的文章（下次只記錄不通知）', () => {
        if (!confirm('確定重設？下次檢查會重新記錄各板塊現有文章，不會通知。')) return;
        BOARDS.forEach(b => GM_deleteValue(seenKey(b)));
        alert('已重設');
    });

    // ===== 啟動 ============================================================
    setTimeout(tick, 5000 + Math.random() * 5000);
    setInterval(tick, TICK_MS);
})();
