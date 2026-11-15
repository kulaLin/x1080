// ==UserScript==
// @name         [x1080] 下載｜磁力連結面板＋Notion
// @namespace    https://github.com/kulaLin/x1080
// @version      4.7.0
// @description  自動提取 1080xin.com「BT綜合區」與「LTX無碼破解BT區」文章內的 magnet 連結，以「下載地址」面板顯示於網頁右側，可一鍵傳送到 Notion（自動略過重複，並同步「純 magnet 連結」子頁面，附不會被複製的時間戳記）；搭配 x1080-tab-switcher 擴充功能可在送出後立刻切到下一個分頁
// @match        *://1080xin.com/*
// @match        *://*.1080xin.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        window.close
// @connect      api.notion.com
// @homepageURL  https://github.com/kulaLin/x1080
// @updateURL    https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-magnet-notion.user.js
// @downloadURL  https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-magnet-notion.user.js
// ==/UserScript==

(function () {
    'use strict';

    // 只在最上層頁面執行，避免在 iframe 內重複出現面板
    if (window.top !== window.self) return;

    const HOST_ID = 'magnet-panel-host';
    // ★ 只在這些板塊內的文章顯示面板（板塊網址 /boards/ 後面那段）
    const BOARD_IDS = [
        '7RHPO2w4jFUYiDhDsxz0wE', // BT綜合區
        '1xkjWeK81SqdZnAwF0lg35', // LTX無碼破解BT區
    ];
    // btih 為 40 位 hex 或 32 位 base32；後面的參數必須以 & 開頭，避免把緊鄰的文字吃進來
    const MAGNET_RE = /magnet:\?xt=urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})(?:&[A-Za-z0-9%._~:\/?#\[\]@!$&()*+,;=-]*)?/gi;
    const NOTION_VERSION = '2022-06-28';
    // 留言 API 的 block_id 寫法以新版 API 文件為準，所以留言另外用新版
    const NOTION_COMMENT_VERSION = '2026-03-11';
    const SUB_PAGE_TITLE = '純 magnet 連結';
    const APP_NAME = '[x1080] 磁力連結面板';

    // ★ 送 Notion 成功後是否自動關閉分頁（true = 關閉 / false = 不關閉）
    const AUTO_CLOSE_TAB = true;
    // ★ 送 Notion 成功後等幾毫秒再關閉分頁（3000 = 3 秒）；倒數期間可按「取消關閉」或 Esc 取消
    const CLOSE_DELAY_MS = 3000;
    // ★ 按下 Notion 按鈕後立刻切到右邊的分頁（true = 切換 / false = 不切換）
    //   需安裝 repo 內的 x1080-tab-switcher 擴充功能；沒裝就維持原本行為（停在本頁倒數關閉）
    //   切走後本頁仍會在背景寫完 Notion；失敗時跳出桌面通知，點通知可回到本頁
    const SWITCH_TO_NEXT_TAB = true;
    // ★ 「純 magnet 連結」子頁面是否加上時間戳記（true = 加 / false = 不加）
    //   時間戳記以 Notion「留言」掛在每批的第一條 magnet 上，複製頁面文字時不會被帶到
    //   需在 Notion integration 的「功能」開啟「插入留言」（Insert comments），否則會略過並提示
    const SUB_PAGE_TIMESTAMP = true;

    let lastKey = null;
    let collapsed = false;
    let shadow = null;

    /* ---------- 提取 ---------- */

    function collectFrom(text, map) {
        if (!text || text.indexOf('magnet:') === -1) return;
        const matches = text.match(MAGNET_RE);
        if (!matches) return;
        matches.forEach(m => {
            const hash = m.match(/btih:([a-z0-9]+)/i)[1].toLowerCase();
            // 同一個 hash 保留資訊較完整（較長）的那條
            if (!map.has(hash) || map.get(hash).length < m.length) map.set(hash, m);
        });
    }

    function extractMagnets() {
        const map = new Map();

        // 1. <a href="magnet:...">
        document.querySelectorAll('a[href^="magnet:" i]').forEach(a => {
            collectFrom(a.getAttribute('href'), map);
        });

        // 2. 程式碼區塊（.discuz-code-box、Discuz 常見的 .blockcode 等）
        document.querySelectorAll('.discuz-code-box, .blockcode, code, pre').forEach(el => {
            collectFrom(el.textContent, map);
        });

        // 3. 其餘純文字（例如「下載地址：magnet:?xt=...」直接寫在內文）
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentNode;
                if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')) return NodeFilter.FILTER_REJECT;
                return node.nodeValue.indexOf('magnet:') !== -1
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            }
        });
        let n;
        while ((n = walker.nextNode())) collectFrom(n.nodeValue, map);

        // 4. input / textarea 內的值
        document.querySelectorAll('input[value*="magnet:"], textarea').forEach(el => {
            collectFrom(el.value, map);
        });

        return Array.from(map.values());
    }

    function getDisplayName(magnetUrl) {
        try {
            const params = new URLSearchParams(magnetUrl.split('?')[1]);
            const dn = params.get('dn');
            if (dn) return dn;
        } catch (e) { /* ignore */ }
        const m = magnetUrl.match(/btih:([a-z0-9]+)/i);
        return m ? m[1] : magnetUrl;
    }

    function getPageTitle() {
        const subject = document.querySelector('#thread_subject');
        const t = (subject ? subject.textContent : document.title).trim();
        return t || location.href;
    }

    /* ---------- Notion ---------- */

    function parsePageId(input) {
        if (!input) return null;
        const s = input.trim().split(/[?#]/)[0].replace(/\/+$/, '');
        const m = s.match(/([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i);
        return m ? m.slice(1).join('-').toLowerCase() : null;
    }

    function configureNotion() {
        const hasToken = !!GM_getValue('notionToken', '');
        const tokenInput = prompt(
            '請輸入 Notion integration token（ntn_ 或 secret_ 開頭）' +
            (hasToken ? '\n留空則沿用目前已儲存的 token' : ''),
            ''
        );
        if (tokenInput === null) return false;
        const token = tokenInput.trim() || GM_getValue('notionToken', '');
        if (!/^(ntn_|secret_)/.test(token)) {
            alert('token 格式不正確，應以 ntn_ 或 secret_ 開頭');
            return false;
        }

        const pageInput = prompt('請貼上要寫入的 Notion 頁面網址（或頁面 ID）：', GM_getValue('notionPageUrl', ''));
        if (pageInput === null) return false;
        const pageId = parsePageId(pageInput);
        if (!pageId) {
            alert('找不到頁面 ID，請確認貼上的是 Notion 頁面網址');
            return false;
        }

        GM_setValue('notionToken', token);
        GM_setValue('notionPageUrl', pageInput.trim());
        GM_setValue('notionPageId', pageId);
        setStatus('Notion 設定已儲存');
        return true;
    }

    function clearNotionConfig() {
        GM_deleteValue('notionToken');
        GM_deleteValue('notionPageUrl');
        GM_deleteValue('notionPageId');
        GM_deleteValue('notionSubPage');
        GM_deleteValue('notionSentCache');
        GM_deleteValue('timestampWarned');
        setStatus('已清除 Notion 設定');
    }

    function getNotionConfig() {
        let token = GM_getValue('notionToken', '');
        let pageId = GM_getValue('notionPageId', '');
        if (!token || !pageId) {
            if (!configureNotion()) return null;
            token = GM_getValue('notionToken', '');
            pageId = GM_getValue('notionPageId', '');
        }
        return { token, pageId };
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function notionRequestOnce(token, method, path, body, version) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url: 'https://api.notion.com' + path,
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Notion-Version': version || NOTION_VERSION,
                    'Content-Type': 'application/json'
                },
                data: body ? JSON.stringify(body) : undefined,
                onload(res) {
                    let json = null;
                    try { json = JSON.parse(res.responseText); } catch (e) { /* ignore */ }
                    if (res.status >= 200 && res.status < 300) return resolve(json);
                    let msg = (json && json.message) || ('HTTP ' + res.status);
                    if (res.status === 401) msg = 'token 無效，請從油猴選單重新設定';
                    if (res.status === 404) msg = '找不到頁面：請確認該頁面已在 integration 的「內容存取權限」中勾選';
                    const err = new Error(msg);
                    err.status = res.status;
                    const m = /retry-after:\s*(\d+)/i.exec(res.responseHeaders || '');
                    err.retryAfter = m ? parseInt(m[1], 10) : 1;
                    reject(err);
                },
                onerror() { reject(new Error('無法連線到 Notion')); },
                ontimeout() { reject(new Error('連線逾時')); },
                timeout: 20000
            });
        });
    }

    // 遇到 Notion 限流（429）時自動等待後重試
    async function notionRequest(token, method, path, body, version) {
        for (let attempt = 0; ; attempt++) {
            try {
                return await notionRequestOnce(token, method, path, body, version);
            } catch (e) {
                if (e.status === 429 && attempt < 3) {
                    await sleep((e.retryAfter || 1) * 1000);
                    continue;
                }
                throw e;
            }
        }
    }

    // 同一時間只跑一個 Notion 工作，避免連按造成重複寫入
    let notionQueue = Promise.resolve();
    function enqueue(fn) {
        const p = notionQueue.then(fn, fn);
        notionQueue = p.catch(() => {});
        return p;
    }

    async function listChildren(token, blockId) {
        const all = [];
        let cursor = null;
        do {
            const q = '?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : '');
            const res = await notionRequest(token, 'GET', `/v1/blocks/${blockId}/children${q}`);
            all.push(...res.results);
            cursor = res.has_more ? res.next_cursor : null;
        } while (cursor);
        return all;
    }

    // 回傳新建立的區塊（用來在第一條 magnet 上掛時間戳記留言）
    async function appendBlocks(token, blockId, blocks) {
        const created = [];
        // API 每次最多 100 個區塊
        for (let i = 0; i < blocks.length; i += 100) {
            const res = await notionRequest(token, 'PATCH', `/v1/blocks/${blockId}/children`, {
                children: blocks.slice(i, i + 100)
            });
            if (res && Array.isArray(res.results)) created.push(...res.results);
        }
        return created;
    }

    /* 時間戳記：以留言掛在區塊上。留言不屬於頁面文字，選取複製「純 magnet 連結」時不會被帶到 */
    async function addTimestampComment(token, blockId, stamp, count) {
        const content = '🕒 ' + stamp + (count > 1 ? `（本次 ${count} 條）` : '');
        try {
            await notionRequest(token, 'POST', '/v1/comments', {
                parent: { block_id: blockId },
                rich_text: [{ type: 'text', text: { content } }]
            }, NOTION_COMMENT_VERSION);
        } catch (e) {
            if (e.status === 403) throw new Error('時間戳記未加入：integration 尚未開啟「插入留言」權限');
            throw new Error('時間戳記未加入：' + e.message);
        }
    }

    function blockText(b) {
        const data = b[b.type];
        if (!data || !Array.isArray(data.rich_text)) return '';
        return data.rich_text.map(t => t.plain_text || '').join('');
    }

    function hashOf(text) {
        const m = /btih:([a-z0-9]{32,40})/i.exec(text || '');
        return m ? m[1].toLowerCase() : null;
    }

    function magnetOf(text) {
        const m = (text || '').match(MAGNET_RE);
        return m ? m[0] : null;
    }

    // 主頁面中由腳本寫入的標題列（帖子標題 + 時間，帶網址連結）
    function isGroupHeader(b) {
        if (b.type !== 'paragraph') return false;
        const rt = b.paragraph.rich_text || [];
        return rt.some(t => t.href && /^https?:/i.test(t.href)) && !hashOf(blockText(b));
    }

    // 找主頁面底下的「純 magnet 連結」子頁面，沒有就自動建立
    async function findOrCreateSubPage(cfg, mainChildren) {
        const cached = getCachedSubId(cfg.pageId);
        const subs = mainChildren.filter(b => b.type === 'child_page');
        const found = subs.find(b => b.id === cached) || subs.find(b => b.child_page.title === SUB_PAGE_TITLE);
        if (found) {
            GM_setValue('notionSubPage', { pageId: cfg.pageId, subId: found.id });
            return found.id;
        }
        const page = await notionRequest(cfg.token, 'POST', '/v1/pages', {
            parent: { page_id: cfg.pageId },
            icon: { type: 'emoji', emoji: '🔗' },
            properties: { title: { title: [{ type: 'text', text: { content: SUB_PAGE_TITLE } }] } }
        });
        GM_setValue('notionSubPage', { pageId: cfg.pageId, subId: page.id });
        return page.id;
    }

    function plainMagnetBlock(m) {
        return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(m) } };
    }

    // Notion 單一文字物件上限 2000 字，超過就切段
    function richText(str) {
        const out = [];
        for (let i = 0; i < str.length; i += 2000) {
            out.push({ type: 'text', text: { content: str.slice(i, i + 2000) } });
        }
        return out;
    }

    function buildBlocks(magnets, now) {
        const header = {
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [
                    {
                        type: 'text',
                        text: { content: getPageTitle().slice(0, 2000), link: { url: location.href } },
                        annotations: { bold: true }
                    },
                    {
                        type: 'text',
                        text: { content: '　' + now },
                        annotations: { color: 'gray' }
                    }
                ]
            }
        };
        // 每條 magnet 放在程式碼區塊，Notion 內滑過即可一鍵複製；名稱放在區塊說明
        const codes = magnets.map(m => ({
            object: 'block',
            type: 'code',
            code: {
                language: 'plain text',
                rich_text: richText(m),
                caption: richText(getDisplayName(m)).slice(0, 1)
            }
        }));
        return [header, ...codes];
    }

    /* 已送出 magnet 的本機快取（依主頁面區分）
       傳送時直接比對快取，不必每次讀取整個 Notion 頁面，速度才能控制在 1 秒內；
       「整理 Notion」會以 Notion 實際內容重建快取 */
    function getSentCache(pageId) {
        const c = GM_getValue('notionSentCache', null);
        return c && c.pageId === pageId ? new Set(c.hashes) : null;
    }
    function saveSentCache(pageId, set) {
        GM_setValue('notionSentCache', { pageId, hashes: [...set] });
    }

    // 子頁面 ID 也記在本機（依主頁面區分）
    function getCachedSubId(pageId) {
        const c = GM_getValue('notionSubPage', null);
        return c && c.pageId === pageId ? c.subId : '';
    }

    // 回傳子頁面新建立的區塊
    async function appendToSub(cfg, subId, magnets) {
        const blocks = magnets.map(plainMagnetBlock);
        try {
            return await appendBlocks(cfg.token, subId, blocks);
        } catch (e) {
            if (e.status !== 404) throw e;
            // 子頁面被刪除或搬走：重新尋找或建立後再寫一次
            GM_deleteValue('notionSubPage');
            const mainChildren = await listChildren(cfg.token, cfg.pageId);
            const newSubId = await findOrCreateSubPage(cfg, mainChildren);
            return await appendBlocks(cfg.token, newSubId, blocks);
        }
    }

    // 傳送：已送過的 magnet（同 hash）一律略過；主頁面與子頁面同時寫入
    // 回傳的 note 是不影響傳送結果的附註（例如時間戳記沒加上）
    async function doSend(cfg, magnets) {
        let sent = getSentCache(cfg.pageId);
        let subId = getCachedSubId(cfg.pageId);

        // 第一次使用（或換了頁面）才讀取一次 Notion 建立快取
        if (!sent || !subId) {
            const mainChildren = await listChildren(cfg.token, cfg.pageId);
            if (!sent) {
                sent = new Set(mainChildren.map(b => hashOf(blockText(b))).filter(Boolean));
                saveSentCache(cfg.pageId, sent);
            }
            if (!subId) subId = await findOrCreateSubPage(cfg, mainChildren);
        }

        const fresh = magnets.filter(m => !sent.has(hashOf(m)));
        if (!fresh.length) return { added: 0, skipped: magnets.length, note: '' };

        // 主頁面標題列與子頁面時間戳記用同一個時間
        const stamp = new Date().toLocaleString('zh-TW', { hour12: false });
        const [mainRes, subRes] = await Promise.allSettled([
            appendBlocks(cfg.token, cfg.pageId, buildBlocks(fresh, stamp)),
            appendToSub(cfg, subId, fresh)
        ]);
        if (mainRes.status === 'rejected') throw mainRes.reason;

        fresh.forEach(m => sent.add(hashOf(m)));
        saveSentCache(cfg.pageId, sent);

        if (subRes.status === 'rejected') {
            throw new Error('主頁面已寫入，子頁面失敗：' + subRes.reason.message + '（可按「整理 Notion」補齊）');
        }

        // 時間戳記失敗不算傳送失敗，只附註原因
        let note = '';
        const first = subRes.value[0];
        if (SUB_PAGE_TIMESTAMP && first) {
            try {
                await addTimestampComment(cfg.token, first.id, stamp, fresh.length);
            } catch (e) {
                note = e.message;
            }
        }
        return { added: fresh.length, skipped: magnets.length - fresh.length, note };
    }

    function sendToNotion(magnets, btn) {
        const cfg = getNotionConfig();
        if (!cfg) return;

        // 設定已確認（不會再跳輸入框）才切走，本頁留在背景繼續寫入
        if (SWITCH_TO_NEXT_TAB) requestTab('next');

        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '傳送中…';
        return enqueue(async () => {
            try {
                const { added, skipped, note } = await doSend(cfg, magnets);
                btn.textContent = added ? '已傳送 ✓' : '已存在';
                if (note) {
                    // 時間戳記的問題只提醒一次，成功加上後才會再提醒
                    if (!GM_getValue('timestampWarned', false)) {
                        GM_setValue('timestampWarned', true);
                        notifyIfAway(note + '（連結已正常送出）');
                    }
                } else if (added) {
                    GM_deleteValue('timestampWarned');
                }
                // 確認 Notion 寫入成功後倒數關閉分頁（失敗時保留分頁）
                scheduleClose((added
                    ? `已新增 ${added} 條到 Notion` + (skipped ? `，略過重複 ${skipped} 條` : '')
                    : 'Notion 已有這些連結') + (note ? `（${note}）` : ''));
            } catch (e) {
                btn.textContent = '失敗';
                setStatus('傳送失敗：' + e.message, true);
                notifyIfAway('傳送 Notion 失敗：' + e.message);
            } finally {
                btn.disabled = false;
                setTimeout(() => { btn.textContent = oldText; }, 2000);
            }
        });
    }

    // 整理：刪除主頁面與子頁面中重複的 magnet，並把主頁面有、子頁面沒有的補進子頁面
    async function doTidy(cfg) {
        let removed = 0;

        const mainChildren = await listChildren(cfg.token, cfg.pageId);
        const seen = new Map(); // hash -> magnet 文字（保留第一次出現的）
        const toDelete = [];
        let header = null, had = 0, kept = 0;
        const closeGroup = () => {
            // 整組 magnet 都是重複的，就連同該組標題列一起刪掉
            if (header && had > 0 && kept === 0) toDelete.push(header.id);
        };
        for (const b of mainChildren) {
            const text = blockText(b);
            const h = hashOf(text);
            if (h) {
                had++;
                if (seen.has(h)) toDelete.push(b.id);
                else { seen.set(h, magnetOf(text) || text.trim()); kept++; }
            } else if (isGroupHeader(b)) {
                closeGroup();
                header = b; had = 0; kept = 0;
            }
        }
        closeGroup();

        const subId = await findOrCreateSubPage(cfg, mainChildren);
        const subChildren = await listChildren(cfg.token, subId);
        const subSeen = new Set();
        for (const b of subChildren) {
            const h = hashOf(blockText(b));
            if (!h) continue;
            if (subSeen.has(h)) toDelete.push(b.id);
            else subSeen.add(h);
        }

        for (const id of toDelete) {
            setStatus(`整理中…刪除重複 ${++removed}/${toDelete.length}`);
            await notionRequest(cfg.token, 'DELETE', `/v1/blocks/${id}`);
            await sleep(350); // Notion 每秒約 3 次請求的限制
        }

        const missing = [...seen.entries()].filter(([h]) => !subSeen.has(h)).map(([, m]) => m);
        if (missing.length) await appendBlocks(cfg.token, subId, missing.map(plainMagnetBlock));

        // 以 Notion 實際內容重建本機快取（在 Notion 手動刪除的連結之後可再次傳送）
        saveSentCache(cfg.pageId, new Set(seen.keys()));

        return { removed: toDelete.length, synced: missing.length };
    }

    function tidyNotion(btn) {
        const cfg = getNotionConfig();
        if (!cfg) return;
        if (btn) btn.disabled = true;
        setStatus('整理中…');
        return enqueue(async () => {
            try {
                const { removed, synced } = await doTidy(cfg);
                setStatus(
                    (removed ? `已刪除 ${removed} 個重複區塊` : '沒有重複的連結') +
                    (synced ? `，子頁面補上 ${synced} 條` : '')
                );
            } catch (e) {
                setStatus('整理失敗：' + e.message, true);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    /* ---------- 分頁切換（需 x1080-tab-switcher 擴充功能） ---------- */

    // 油猴腳本本身無法切換分頁；擴充功能裝好後會在 <html> 加上這個屬性，
    // 腳本發出 DOM 事件，由擴充功能代為切換（兩者共用 DOM，事件不帶資料以免跨環境讀不到）
    function hasTabSwitcher() {
        return document.documentElement.hasAttribute('data-x1080-tab-switcher');
    }

    // action：'next' = 切到右邊的分頁；'focus' = 回到本分頁
    function requestTab(action) {
        if (!hasTabSwitcher()) return false;
        document.dispatchEvent(new CustomEvent('x1080-tab-switcher:' + action));
        return true;
    }

    // 已切到其他分頁時，用桌面通知告知結果；點通知回到本分頁
    function notifyIfAway(text) {
        if (!document.hidden) return;
        GM_notification({
            title: APP_NAME,
            text: text + '\n點此回到該分頁',
            onclick: () => { if (!requestTab('focus')) window.focus(); }
        });
    }

    GM_registerMenuCommand('設定 Notion（token 與頁面）', configureNotion);
    GM_registerMenuCommand('整理 Notion（去除重複＋同步子頁面）', () => tidyNotion());
    GM_registerMenuCommand('清除 Notion 設定', clearNotionConfig);

    /* ---------- 面板 ---------- */

    function ensurePanel() {
        let host = document.getElementById(HOST_ID);
        if (host && shadow) return;
        if (host) host.remove();

        host = document.createElement('div');
        host.id = HOST_ID;
        // [已知問題] 2026-11-15 記錄，待實際確認後調整
        // 與 x1080-attachment-panel 位置重疊：本面板在右側 top:200px、寬 340px；
        // 附件懸浮區塊在右側 top:260px（TOP_OFFSET）、寬 280px、z-index 999999。
        // 同一篇文章同時有 magnet 與附件時，兩者會疊在一起，本面板 z-index 較高，會蓋住附件區塊。
        // 調整方向：把其中一個往下移、改到左側，或依附件區塊實際高度自動錯開。
        host.style.cssText = 'position:fixed;top:200px;right:0;z-index:2147483647;';
        // 使用 Shadow DOM：樣式不受網站 CSS 影響，面板內容也不會被自己再掃描到
        shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
                .panel { width: 340px; max-height: 70vh; display: flex; flex-direction: column;
                         background: #fff; color: #222; border: 1px solid #ccc; border-right: none;
                         border-radius: 8px 0 0 8px; box-shadow: -2px 2px 10px rgba(0,0,0,.2);
                         font: 13px/1.5 "Microsoft JhengHei", "PingFang TC", sans-serif; }
                .panel.collapsed { width: auto; }
                .panel.collapsed .list, .panel.collapsed .copy-all,
                .panel.collapsed .send-all, .panel.collapsed .foot { display: none; }
                .head { display: flex; align-items: center; gap: 6px; padding: 8px 10px;
                        background: #2d6cdf; color: #fff; border-radius: 8px 0 0 0; cursor: pointer;
                        user-select: none; }
                .panel.collapsed .head { border-radius: 8px 0 0 8px; }
                .title { flex: 1; font-weight: bold; white-space: nowrap; }
                button { cursor: pointer; border: none; border-radius: 4px; padding: 2px 8px;
                         font-size: 12px; background: #eef3fd; color: #2d6cdf; white-space: nowrap;
                         flex-shrink: 0; }
                button:hover { background: #dbe6fb; }
                button:disabled { opacity: .6; cursor: default; }
                button.notion { background: #f1f1ef; color: #37352f; }
                button.notion:hover { background: #e3e2df; }
                .list { overflow-y: auto; padding: 6px 10px; }
                .item { display: flex; align-items: center; gap: 6px; padding: 6px 0;
                        border-bottom: 1px dashed #ddd; }
                .item:last-child { border-bottom: none; }
                .item a { flex: 1; color: #2d6cdf; text-decoration: none; word-break: break-all; }
                .item a:hover { text-decoration: underline; }
                .empty { color: #888; padding: 6px 0; }
                .foot { display: flex; align-items: center; gap: 8px; padding: 6px 10px;
                        border-top: 1px solid #eee; }
                .status { flex: 1; font-size: 12px; color: #2a7a2a; word-break: break-all; }
                .status.error { color: #c0392b; }
                button.cancel-close { background: #fdecea; color: #c0392b; font-weight: bold; }
                button.cancel-close:hover { background: #f9d6d2; }
                button[hidden] { display: none; }
            </style>
            <div class="panel">
                <div class="head" title="點擊收合 / 展開">
                    <button class="copy-all">全部複製</button>
                    <button class="send-all notion">全部送 Notion</button>
                    <span class="title">下載地址：</span>
                </div>
                <div class="list"></div>
                <div class="foot">
                    <button class="tidy notion" title="刪除 Notion 中重複的 magnet，並同步子頁面">整理 Notion</button>
                    <button class="cancel-close" hidden title="也可以按 Esc">取消關閉</button>
                    <span class="status"></span>
                </div>
            </div>`;

        shadow.querySelector('.head').addEventListener('click', e => {
            if (e.target.closest('button')) return;
            collapsed = !collapsed;
            shadow.querySelector('.panel').classList.toggle('collapsed', collapsed);
        });

        const tidyBtn = shadow.querySelector('.tidy');
        tidyBtn.addEventListener('click', () => tidyNotion(tidyBtn));
        shadow.querySelector('.cancel-close').addEventListener('click', () => cancelClose('已取消關閉分頁'));

        document.body.appendChild(host);
    }

    /* ---------- 倒數關閉分頁 ---------- */

    let closeTimer = null;
    let closeTick = null;

    function onEscCancel(e) {
        if (e.key === 'Escape') cancelClose('已取消關閉分頁');
    }

    function cancelClose(msg) {
        clearTimeout(closeTimer);
        clearInterval(closeTick);
        closeTimer = closeTick = null;
        document.removeEventListener('keydown', onEscCancel, true);
        if (shadow) shadow.querySelector('.cancel-close').hidden = true;
        if (msg) setStatus(msg);
    }

    function scheduleClose(baseMsg) {
        if (!AUTO_CLOSE_TAB) {
            setStatus(baseMsg);
            return;
        }
        cancelClose();
        // 面板收合時先展開，才看得到倒數與「取消關閉」
        if (shadow && collapsed) {
            collapsed = false;
            shadow.querySelector('.panel').classList.remove('collapsed');
        }
        const end = Date.now() + CLOSE_DELAY_MS;
        const render = () => {
            const left = Math.max(0, (end - Date.now()) / 1000).toFixed(1);
            setStatus(`${baseMsg}，${left} 秒後關閉分頁`);
        };
        render();
        if (shadow) shadow.querySelector('.cancel-close').hidden = false;
        closeTick = setInterval(render, 100);
        document.addEventListener('keydown', onEscCancel, true);
        closeTimer = setTimeout(() => {
            cancelClose();
            setStatus(`${baseMsg}，關閉分頁…`);
            window.close();
        }, CLOSE_DELAY_MS);
    }

    let statusTimer = null;
    function setStatus(msg, isError) {
        if (!shadow) return;
        const el = shadow.querySelector('.status');
        el.textContent = msg;
        el.classList.toggle('error', !!isError);
        clearTimeout(statusTimer);
        if (!isError) statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
    }

    function copyText(text, btn) {
        const done = () => {
            const old = btn.textContent;
            btn.textContent = '已複製';
            setTimeout(() => { btn.textContent = old; }, 1200);
        };
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
            ta.remove();
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    }

    function render(magnets) {
        ensurePanel();
        const list = shadow.querySelector('.list');
        const title = shadow.querySelector('.title');
        const copyAll = shadow.querySelector('.copy-all');
        const sendAll = shadow.querySelector('.send-all');

        title.textContent = `下載地址：（${magnets.length}）`;
        list.textContent = '';

        if (magnets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = '本頁尚未找到 magnet 連結';
            list.appendChild(empty);
            copyAll.style.display = 'none';
            sendAll.style.display = 'none';
            return;
        }

        copyAll.style.display = '';
        sendAll.style.display = '';
        copyAll.onclick = () => copyText(magnets.join('\n'), copyAll);
        sendAll.onclick = () => sendToNotion(magnets, sendAll);

        magnets.forEach(m => {
            const item = document.createElement('div');
            item.className = 'item';

            const copyBtn = document.createElement('button');
            copyBtn.textContent = '複製';
            copyBtn.addEventListener('click', () => copyText(m, copyBtn));

            const sendBtn = document.createElement('button');
            sendBtn.className = 'notion';
            sendBtn.textContent = 'Notion';
            sendBtn.title = '傳送這一條到 Notion';
            sendBtn.addEventListener('click', () => sendToNotion([m], sendBtn));

            const a = document.createElement('a');
            a.href = m;
            a.textContent = getDisplayName(m);
            a.title = m;

            item.appendChild(copyBtn);
            item.appendChild(sendBtn);
            item.appendChild(a);
            list.appendChild(item);
        });
    }

    /* ---------- 更新 ---------- */

    // 文章網址為 /resources/xxx，所屬板塊由麵包屑或文章標題旁的板塊連結判斷
    function isTargetPage() {
        if (!/^\/resources\//.test(location.pathname)) return false;
        const sel = BOARD_IDS
            .map(id => `.breadcrumb a[href*="/boards/${id}"], .thread-header a[href*="/boards/${id}"]`)
            .join(', ');
        return !!document.querySelector(sel);
    }

    function removePanel() {
        cancelClose(); // 換到其他頁面就不再自動關閉
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
        shadow = null;
        lastKey = null;
    }

    function update() {
        if (!document.body) return;
        // 網站是單頁應用，換頁不會重新載入，所以每次內容變動都重新判斷
        if (!isTargetPage()) {
            removePanel();
            return;
        }
        const magnets = extractMagnets();
        const key = magnets.join('\n');
        if (key === lastKey && document.getElementById(HOST_ID)) return;
        lastKey = key;
        render(magnets);
    }

    let timer = null;
    function scheduleUpdate() {
        clearTimeout(timer);
        timer = setTimeout(update, 400);
    }

    update();

    // 內容為動態載入（或換頁不重新整理）時也能更新
    new MutationObserver(scheduleUpdate).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
})();
