// x1080 分頁切換：背景程式
// 只用 chrome.tabs / chrome.windows 切換分頁，不讀取網址、標題或網頁內容，也不連網，
// 所以不需要宣告任何權限。

chrome.runtime.onMessage.addListener((msg, sender) => {
    const tab = sender.tab;
    if (!tab || !msg) return;
    if (msg.action === 'next') switchToNext(tab).catch(() => {});
    else if (msg.action === 'focus') focusTab(tab).catch(() => {});
});

// 切到同一視窗中右邊的分頁；已經是最右邊就不動
async function switchToNext(tab) {
    // 只在使用者還停在這個分頁時切換，避免已經手動切走後又被帶到別處
    if (!tab.active) return;
    const [next] = await chrome.tabs.query({ windowId: tab.windowId, index: tab.index + 1 });
    if (next) await chrome.tabs.update(next.id, { active: true });
}

// 回到指定分頁，並把它所在的視窗帶到最前面
async function focusTab(tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
}
