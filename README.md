# x1080

**English** | [繁體中文](README.zh-TW.md)

Tampermonkey userscripts for 1080xin (x1080x).

![Tampermonkey](https://img.shields.io/badge/Tampermonkey-userscript-00485B?logo=tampermonkey&logoColor=white)
![scripts](https://img.shields.io/badge/scripts-6-blue)
![browser](https://img.shields.io/badge/browser-Chrome-4285F4?logo=googlechrome&logoColor=white)
![Notion](https://img.shields.io/badge/Notion-API-000000?logo=notion&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20繁體中文-orange)
![last commit](https://img.shields.io/github/last-commit/kulaLin/x1080)

> The scripts' user interface (Tampermonkey names, buttons, menus, notifications) is in Traditional Chinese. This README gives the original Chinese label followed by an English translation where helpful.

## Scripts

| Tampermonkey name | File | Description | Install |
|---|---|---|---|
| [x1080] 下載｜磁力連結面板＋Notion<br>(Download · Magnet panel + Notion) | [x1080-magnet-notion](#x1080-magnet-notion) | Right-side "download links" panel on posts in BT綜合區 (BT board) and LTX無碼破解BT區 (LTX BT board): copy magnet links, send them to Notion in one click (with timestamps on the sub-page), then auto-close the tab; with the companion extension it jumps to the next tab right away | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-magnet-notion.user.js) |
| [x1080] 下載｜附件連結一鍵提取<br>(Download · One-click attachment link extractor) | [x1080-attachment-extract](#x1080-attachment-extract) | Clicks every "download by count" attachment button, intercepts the real download URLs and tokens, then auto-closes the tab | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-extract.user.js) |
| [x1080] 版面｜附件區塊右側懸浮<br>(Layout · Floating attachment panel) | [x1080-attachment-panel](#x1080-attachment-panel) | Turns the attachment section into a floating, vertical, transparent panel on the right, with the download button at the bottom | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-attachment-panel.user.js) |
| [x1080] 版面｜精簡（隱藏數據／簽名檔／回覆區）<br>(Layout · Clean-up: hide stats / signature / replies) | [x1080-clean-layout](#x1080-clean-layout) | Hides the stats under the title, signature ads, the action bar and the reply area | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-clean-layout.user.js) |
| [x1080] 瀏覽｜已開連結標記<br>(Browse · Visited-link marker) | [x1080-visited-marker](#x1080-visited-marker) | Keeps its own record of opened links and dims them with a ✓, without relying on the browser's `:visited` (works with Linkclump bulk opening) | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-visited-marker.user.js) |
| [x1080] 瀏覽｜板塊新文章通知<br>(Browse · New-post notifier for boards) | [x1080-board-watch](#x1080-board-watch) | Checks watched boards on a schedule and notifies new posts via Telegram and desktop notifications | [Install](https://raw.githubusercontent.com/kulaLin/x1080/main/x1080-board-watch.user.js) |

How to install: install [Tampermonkey](https://www.tampermonkey.net/) in your browser first, then click an "Install" link above. Tampermonkey updates the scripts automatically when a new version is pushed to this repo.

### Chrome extension

| Name | Folder | Description |
|---|---|---|
| x1080 分頁切換<br>(x1080 tab switcher) | [x1080-tab-switcher](#x1080-tab-switcher) | Switches tabs on behalf of the userscripts (Tampermonkey cannot); currently lets x1080-magnet-notion jump to the next tab after "Send to Notion" |

The extension is loaded by hand and does not update automatically — see its section for install and update steps.

### Naming and versioning rules

Every new or changed script follows these rules.

| Item | Rule | Example |
|---|---|---|
| Tampermonkey name (`@name`) | `[x1080] category｜feature`, feature in about 12 characters; details go in `@description` | `[x1080] 下載｜附件連結一鍵提取` |
| Category | Only three: **下載** (Download: get links, download, send), **版面** (Layout: change look, hide, move), **瀏覽** (Browse: mark, navigate, reading aids) | |
| File name | `x1080-target-feature.user.js`, lowercase English joined with `-` | `x1080-attachment-extract.user.js` |
| `@namespace` | Always `https://github.com/kulaLin/x1080` | |
| Version | major.minor.patch: bug fix → patch +1; new feature or name/appearance change → minor +1; major rewrite → major +1; comment-only changes keep the version | 4.4 → 4.4.1 / 4.5 / 5.0 |
| Known issues | Mark in code with `// [已知問題] YYYY-MM-DD` (known issue) comments and record them in the matching README section | |
| README badges | Update the `scripts-N` badge at the top when a script is added or removed | `scripts-6` → `scripts-7` |
| README languages | Keep English `README.md` (default) and Traditional Chinese `README.zh-TW.md` in sync | |
| Settings | Live in constants or `CONFIG` at the top of each script; change them in this repo (edits made in the Tampermonkey editor are overwritten by auto-update) | |

> Tampermonkey identifies a script by `@name` + `@namespace`. Changing either one makes it a new script, and data stored by the old one (Notion token, visited records, etc.) does not carry over — back it up first.

### Known conflict between scripts (to be confirmed)

- **x1080-magnet-notion and x1080-attachment-panel overlap** (recorded 2026-11-15): both are fixed to the right side of the screen. The "download links" panel sits at top 200px, width 340px; the floating attachment panel at top 260px, width 280px. On a post that has both magnets and attachments they overlap, and the download-links panel (higher z-index) covers the attachment panel. To be decided once it actually happens: move one down, move one to the left, or offset them automatically. Both scripts mark the position setting with a `[已知問題]` comment.

---

## x1080-magnet-notion

File: `x1080-magnet-notion.user.js` (Tampermonkey name: [x1080] 下載｜磁力連結面板＋Notion)

> Known conflict: overlaps the right-side panel of x1080-attachment-panel — see "Known conflict between scripts" above.

Shown only on posts in BT綜合區 (BT board, `boards/7RHPO2w4jFUYiDhDsxz0wE`) and LTX無碼破解BT區 (LTX BT board, `boards/1xkjWeK81SqdZnAwF0lg35`); the board list is `BOARD_IDS` at the top of the script. Extracts the magnet links in the post and shows them in a 「下載地址」 (download links) panel on the right.

### Features

- Finds every magnet link on the page (`<a>` links, code blocks, plain text in the post); duplicates with the same hash are merged
- Each link has 「複製」 (Copy) and 「Notion」 (send to Notion) buttons; the header has 「全部複製」 (Copy all) and 「全部送 Notion」 (Send all to Notion)
- Links already sent to Notion are skipped automatically (matched by btih hash using a local cache, so the Notion page does not need to be read every time)
- After a successful send, the tab closes after a 3-second countdown; press 「取消關閉」 (Cancel close) or Esc to keep it open. If the send fails, the tab stays open and shows the reason
- With the [x1080-tab-switcher](#x1080-tab-switcher) extension installed, pressing a Notion button switches to the tab on the right immediately; this tab finishes writing to Notion in the background and then closes as above. If the send fails after you have switched away, a desktop notification appears — click it to return to that tab. Without the extension, behaviour is unchanged
- Also writes to the 「純 magnet 連結」 (plain magnet links) sub-page under the main page — magnets only, one per line; the sub-page is created if missing
- Sub-page timestamps: the first magnet of each batch gets a comment such as 「🕒 2026/11/16 04:04:12（本次 2 條）」 (time, plus how many links were in the batch). Comments are not part of the page text, so they are not included when you select and copy the page; the time matches the main page's header line
- 「整理 Notion」 (Tidy Notion) at the bottom of the panel: removes duplicate links on the main page and the sub-page (a whole group's header line is removed too when all its links are duplicates), fills in links missing from the sub-page, and rebuilds the local cache from Notion (links deleted by hand in Notion can be sent again afterwards)
- Click the header to collapse the panel
- Keeps working when the site changes pages without a full reload

### Settings (constants at the top of the script)

| Constant | Default | Description |
|---|---|---|
| `AUTO_CLOSE_TAB` | `true` | Close the tab after a successful send to Notion |
| `CLOSE_DELAY_MS` | `3000` | Milliseconds to wait before closing (can be cancelled during the countdown) |
| `SWITCH_TO_NEXT_TAB` | `true` | Switch to the tab on the right as soon as a Notion button is pressed (needs x1080-tab-switcher) |
| `SUB_PAGE_TIMESTAMP` | `true` | Add timestamp comments to the 「純 magnet 連結」 sub-page |

> Note: change settings in this repo. Edits made in the Tampermonkey editor are overwritten by the next auto-update.

### Notion setup (first use)

1. Create an Internal integration at <https://www.notion.so/profile/integrations> and copy its token (starts with `ntn_`)
2. In the integration's "Content access" tab, grant access to the Notion page to write to (or add the integration via the page's "⋯ → Connections")
3. In the integration's Capabilities, turn on **Insert comments** — the sub-page timestamps need it, and it is off by default. Without it, links are still sent, just without timestamps, and you are told once
4. The first time you press "Send to Notion", paste the token and the page URL when prompted; change them later from the Tampermonkey menu 「設定 Notion」 (Set up Notion)
5. When Tampermonkey asks whether to allow connecting to `api.notion.com`, choose "Always allow"

The token is stored only in Tampermonkey's local storage in your browser, never in this repo.

Each send appends to the bottom of the main page: the post title (linking back to the post) with a timestamp, then one code block per new magnet (name in the block caption). The sub-page only gets the magnet links themselves, with the timestamp attached as a comment on the first link of each batch. Links that 「整理 Notion」 (Tidy Notion) fills into the sub-page get no timestamp.

---

## x1080-tab-switcher

Folder: `x1080-tab-switcher/` (Chrome extension name: x1080 分頁切換 / x1080 tab switcher)

Userscripts cannot switch to another tab, so this extension does it for them: the script fires an event on the page and the extension switches tabs. It runs only on 1080xin.com, only switches tabs, and does not read URLs, titles or page content or make any network requests.

### Features

- When a Notion button is pressed in x1080-magnet-notion, switches to the tab on the right in the same window (does nothing if it is already the rightmost tab)
- When the "send failed" desktop notification is clicked, returns to the original tab and brings its window to the front

### Install

1. Download this repo ("Code → Download ZIP" and unzip, or git clone) and keep the `x1080-tab-switcher` folder somewhere permanent — do not move or delete it afterwards
2. Open `chrome://extensions` in Chrome and turn on "Developer mode" (top right)
3. Click "Load unpacked" and choose the `x1080-tab-switcher` folder
4. Reload any 1080xin tabs that are already open (the extension only applies to pages loaded after it is installed)

### Update

The extension does not update automatically. When the repo has a new version, overwrite the folder's files, press the extension's reload button in `chrome://extensions`, then reload any open 1080xin tabs.

### How it works

- On load it adds a `data-x1080-tab-switcher` attribute to the page's `<html>`; the userscript only asks to switch tabs when it sees this attribute, otherwise it behaves as before
- The userscript fires an `x1080-tab-switcher:next` (switch to the tab on the right) or `x1080-tab-switcher:focus` (return to this tab) DOM event; the content script passes it to the background script
- It only switches when the requesting tab is still the active tab, so you are not pulled away after switching tabs yourself

> Note: Developer mode must stay on. If the computer's Chrome policy blocks Developer mode or unpacked extensions (common on work computers), it cannot be installed.

---

## x1080-attachment-extract

File: `x1080-attachment-extract.user.js` (Tampermonkey name: [x1080] 下載｜附件連結一鍵提取)

When the page has 「按次數下載」 (download by count) buttons, a 「⚡ 一鍵提取下載連結 (N)」 (one-click extract download links) button appears on the right edge of the screen, a little above the middle.

### Features

- Clicks every 「按次數下載」 button on the page in turn (1.5 seconds apart)
- Intercepts the site's download API responses to capture the real download URLs and download tokens, shown in a panel directly below the extract button (collapsed by default into a 「🎯 已攔截 N 筆」 / "N intercepted" button) with a copy-all button
- Closes the tab automatically once every attachment has a download token; press the button again during the countdown to cancel
- If some attachments are still not done after 20 seconds, the tab is not closed and the button shows how many finished

### Settings (constants at the top of the script)

| Constant | Default | Description |
|---|---|---|
| `BLOCK_AUTO_DOWNLOAD` | `false` | `true` = only capture URLs, do not let the browser download |
| `SHOW_PANEL_BY_DEFAULT` | `false` | Show the intercept panel expanded by default |
| `AUTO_CLOSE_TAB` | `true` | Close the tab when done |
| `CLOSE_DELAY_MS` | `100` | Milliseconds to wait before closing after everything is done |
| `WAIT_TIMEOUT_MS` | `20000` | Maximum milliseconds to wait for all attachments; on timeout the tab is not closed |
| `BUTTON_TOP` | `'calc(35vh - 10px)'` | Distance of the extract button from the top of the screen (`35vh` = 35% of the screen height, `- 10px` = 10 pixels higher; smaller = higher); the intercept panel follows below it |

> Note: change settings in this repo. Edits made in the Tampermonkey editor are overwritten by the next auto-update.

### Known issues (to be fixed)

- **The extract button does not refresh when switching posts in the same tab** (recorded 2026-11-15): the site does not reload when changing pages, and the floating button remembers only the download buttons of the first page it appeared on. After moving to another post, the count and click targets still belong to the first post, so a click waits until the timeout; on pages without attachments the button does not disappear. Not affected when each post is opened in a new tab. See the `[已知問題]` comment in the script for the cause and the planned fix.

---

## x1080-clean-layout

File: `x1080-clean-layout.user.js` (Tampermonkey name: [x1080] 版面｜精簡（隱藏數據／簽名檔／回覆區）)

Domains: 1080xin.com and x1080x.com (including subdomains). Hides elements with CSS before the page renders, so nothing flashes.

### Hidden elements

| Element | CSS selector |
|---|---|
| View/reply counts, favourite and reply buttons in the title area | `.thread-header-nums` |
| 「論壇VIP」 (forum VIP) signature ad under the post | `.author-signature` |
| Reply / quote / report button bar under the post | `.post-foot` |
| Bottom interaction area (reply box, editor, publish button) | `.thread-interactions` |
| Every floor except the first (the main post), including 「還沒有回覆」 (no replies yet) | `.post-list > *:nth-child(n+2)` |

The spacing of `.thread-header` is also reduced so the post moves up. If the site's redesign changes class names, update the selectors using the table above.

---

## x1080-attachment-panel

File: `x1080-attachment-panel.user.js` (Tampermonkey name: [x1080] 版面｜附件區塊右側懸浮)

> Known conflict: overlaps the right-side panel of x1080-magnet-notion — see "Known conflict between scripts" above.

Pins the post's attachment section (`section.attachments-section`) to the right side of the screen, arranged vertically with a transparent background. The site's own download buttons are kept intact, just moved to the bottom.

### Features

- The attachment section floats on the right (280px wide) and scrolls inside itself when too long
- All inner containers become a single vertical column; file names show in full instead of being squeezed into a narrow strip
- The 「按次數下載／下載」 (download) button moves to the bottom of the panel and fills the full width
- Hides the 「各身份價格」 (price per member level) button and the price-tier list (`.price-tiers` — points / free / not eligible per member level), the 「下載說明」 (download help) link and the RAR icon
- Re-applies automatically when the site loads content dynamically or changes pages

### Settings (constants at the top of the script)

| Constant | Default | Description |
|---|---|---|
| `TOP_OFFSET` | `'260px'` | Distance of the panel from the top of the screen; larger = lower |
| `BG_OPACITY` | `0` | Background opacity: `0` = fully transparent, `0.2` = light dark tint |
| `BLUR_PX` | `'8px'` | Frosted-glass blur: `'0px'` = none, `'8px'` = light frosted glass |

> Note: change settings in this repo. Edits made in the Tampermonkey editor are overwritten by the next auto-update.

---

## x1080-visited-marker

File: `x1080-visited-marker.user.js` (Tampermonkey name: [x1080] 瀏覽｜已開連結標記)

Instead of asking the browser whether a link was visited, each page records its own URL in the script's storage when it loads, and list pages compare their links against that record — matches are dimmed and get a ✓. It is therefore unaffected by Chromium's `:visited` partitioning, and tabs opened in bulk with Linkclump, middle-click or Ctrl+click are marked too.

Domains: 1080xin.com and agaghhh.cc (old domain; records are shared).

### Shortcuts

| Keys | Action |
|---|---|
| Alt + click a link | Toggle that link's visited mark (does not open it) |
| Alt + M | Mark every link in the current mouse selection as visited |
| Alt + U | Unmark every link in the selection |
| Alt + O | Open the unmarked links in the selection via in-page clicks (pop-ups must be allowed for the site; at most 60 at a time) |

### Tampermonkey menu

Toggle mark display, mark all links on this page as visited, export records, import records (merged with existing), clear all records, show this page's match key (debugging), re-run old-domain record conversion.

### Settings

The `CONFIG` object at the top of the script controls the mark appearance (opacity, colour, ✓ badge, row dimming), URL normalisation rules (`DROP_PARAMS`, etc.), recording rules and the record limit (20,000 by default).

> Note: change settings in this repo. Edits made in the Tampermonkey editor are overwritten by the next auto-update.

> Records are stored in this script's Tampermonkey storage. If an install from GitHub is treated as a new script rather than an update (for example after `@name` or `@namespace` changed), it starts with an empty record — use the menu's export first, and import again after installing.

### Known issues (to be fixed)

- **The same post can be recorded more than once because of different URL parameters** (recorded 2026-11-15): post URLs are `/resources/<id>`, but list links carry `?return=…` (different for each source list), and after opening a post the address bar becomes `?page=1&order=asc`. The match key includes these parameters, so a post opened from one list may not show as visited on another. The planned fix is to match on the post id only and convert existing records once. See the `[已知問題]` comment above `keyOf()` in the script for details.

---

## x1080-board-watch

File: `x1080-board-watch.user.js` (Tampermonkey name: [x1080] 瀏覽｜板塊新文章通知)

The site has no RSS and no "follow board" feature, and requests without a logged-in browser session are blocked by Cloudflare (403), so a scheduled check on a server is not an option. This script runs in your logged-in browser instead: it reads the watched boards on a schedule, compares them with posts already seen, and notifies you of new ones.

### How it works

- Reads the watched boards every 10 minutes (3 seconds between boards)
- When there is more than one page of new posts, it keeps reading the following pages (20 posts per page, 2 seconds between pages) until it reaches posts already seen, up to page 30, so a backlog after the computer slept or a site verification blocked it for hours is caught up in one go (since v1.1.0; earlier versions read only page 1, and the site-wide pinned posts on page 1 broke the "whole page is new" check, so large batches were under-reported)
- Tries these read methods in order: ① the page's own fetch ② Tampermonkey's GM_xmlhttpRequest ③ loading the board in a hidden iframe. 「顯示監控狀態」 (Show monitor status) shows which one was used (v1.0 fetched directly from the script context and was blocked with 403; v1.0.1 switched to this approach)
- The first run only records existing posts without notifying; afterwards only unseen posts are notified (site-wide pinned posts never count as new)
- Notifications: Telegram (titles with clickable links; above 30 new posts on one board only the newest 30 are listed, with a link to the board) and Windows desktop notifications (click to open the post); more than 3 new posts on one board are merged into a single desktop notification
- With several 1080xin tabs open, only one tab does the checking, so there are no duplicate notifications
- If reading fails (for example an expired login or a site verification) or the site layout changes, you are alerted at most once every 6 hours

### Limitations

- **At least one 1080xin tab must stay open** (pinning it is recommended); nothing is checked while the computer sleeps or Chrome is closed, and the next check after resuming catches up
- If more than 30 pages (600 posts) of new posts appear on a board between two checks, only the newest 600 are notified and the notification says the page limit was reached; if a later page fails to load, that is noted too and the posts already read are still notified

### First use

1. Install it from the script list above
2. Tampermonkey menu → 「設定 Telegram（bot token 與 chat id）」 (Set up Telegram: bot token and chat id), then paste the bot token (from @BotFather) and your own chat id
3. Menu → 「測試 Telegram 通知」 (Test Telegram notification) and check that your phone receives it
4. Menu → 「立即檢查」 (Check now). The first run records each board's existing posts; after that it checks automatically every 10 minutes

The Telegram token and chat id are stored only in your local Tampermonkey, never in this repo.

### Tampermonkey menu

Check now, show monitor status, pause/resume monitoring, set up Telegram, test Telegram notification, reset seen posts (the next check records only, without notifying).

### Settings (constants at the top of the script)

| Constant | Default | Description |
|---|---|---|
| `BOARDS` | 高清有碼 (HD censored), 外挂字幕 (external subtitles), 亞洲SM (Asian SM), LTX無碼破解BT區 (LTX uncensored-leak BT board) | Names and URLs of the watched boards; a `category_id` filter may be included |
| `CHECK_INTERVAL_MIN` | `10` | Minutes between checks |
| `NOTIFY_TELEGRAM` | `true` | Notify via Telegram |
| `NOTIFY_DESKTOP` | `true` | Notify via desktop notifications |
| `TELEGRAM_SHOW_TITLES` | `true` | List post titles in Telegram; `false` sends only "board X has N new posts", so titles are less likely to appear on the phone's lock screen |
| `TELEGRAM_MAX_TITLES` | `30` | Maximum titles listed per board in Telegram, with a board link for the rest; `0` = list all |
| `GAP_BETWEEN_BOARDS_MS` | `3000` | Delay between reading each board |
| `MAX_PAGES_PER_CHECK` | `30` | How many pages to read at most when there is more than one page of new posts |
| `GAP_BETWEEN_PAGES_MS` | `2000` | Delay before reading the next page of the same board |

> Note: change settings in this repo. Edits made in the Tampermonkey editor are overwritten by the next auto-update.
