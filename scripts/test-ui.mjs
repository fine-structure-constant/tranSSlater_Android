import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Snapshot of the common desktop IPC fixture; this project can test independently.
const fixture = await readFile(new URL('./fixtures/ipc.js', import.meta.url), 'utf8');
await mkdir('test-results/android', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); console.log(`PASS ${++checks}: ${message}`); };
try {
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [800, 1024]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    await context.addInitScript({ content: fixture });
    await context.addInitScript(() => {
      window.fakeSettings.autoTranslate = false;
      window.externalInput = { text: 'cold selection' };
      window.fakeHistory = Array.from({ length: 120 }, (_, i) => ({
        id: i + 1, query: `word${i + 1}`, fromLang: 'en', toLang: 'zh-CN',
        engine: 'youdao', translation: `词条${i + 1}`, isWord: true, createdAt: 1760000000000 + i,
      }));
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'take_external_input') { const pending = window.externalInput ?? {}; window.externalInput = null; return pending; }
        if (command === 'app_info') return { version: '0.1.0', dataDir: '/data/user/0/com.transslater.app/files', configDir: '/data/user/0/com.transslater.app/files', settingsPath: '/data/user/0/com.transslater.app/files/settings.json', historyPath: '/data/user/0/com.transslater.app/files/history.db' };
        if (command === 'plugin:dialog|save') return 'content://com.android.providers.downloads.documents/document/1234';
        if (command === 'export_history') { window.exportedTo = args; return window.fakeHistory.length; }
        if (command === 'translate' && window.fakeNetworkError) throw window.fakeNetworkError;
        const result = await invoke(command, args);
        if (command === 'translate' && args.text === '中文') {
          result.sourceLang = 'zh-CN'; result.targetLang = 'en'; result.translation = 'Chinese';
        }
        return result;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:1426');
    await page.waitForFunction(() => !document.querySelector('#input').disabled);
    check(await page.title() === 'tranSSlater', `${width}: application name`);
    await page.waitForFunction(() => document.querySelector('.main-trans')?.textContent === '译文：cold selection');
    check(await page.locator('#input').inputValue() === 'cold selection', `${width}: cold-start selection is received after boot`);
    check(await page.evaluate(() => window.calls.filter(c => c.cmd === 'translate' && c.args.text === 'cold selection').length) === 1, `${width}: cold-start selection is translated once`);
    check(await page.locator('#lang-pair option[value="auto|zh-CN"]').innerText() === '自动互译', `${width}: automatic bilingual mode is available`);
    check(await page.locator('#menubar').isHidden(), `${width}: desktop menu bar is absent from the mobile surface`);
    check(await page.locator('.mobile-nav').isVisible(), `${width}: mobile navigation is available`);
    check(await page.locator('[data-cmd="window"], #settings-window, #select-translate').count() === 0, `${width}: desktop-only controls removed`);
    await page.locator('#input').fill('hello');
    await page.locator('#input').press('Control+Enter');
    await page.waitForFunction(() => document.querySelector('.main-trans')?.textContent === '译文：hello');
    check(await page.locator('#result').isVisible(), `${width}: translation result`);
    check(await page.locator('[data-act="go"]').innerText() === '翻译', `${width}: translation has an explicit action label`);
    check(await page.locator('#input-count').innerText() === '5 / 5000', `${width}: character counter follows input`);
    for (const theme of ['plain', 'meridian']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const escaped = await page.evaluate(() => [...document.querySelectorAll('.chrome button, .toolbar select, #input')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && (r.left < -1 || r.right > innerWidth + 1);
      }).map(el => el.id || el.className));
      check(!escaped.length, `${width}/${theme}: controls fit viewport (${escaped})`);
      await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-${theme}.png` });
    }
    await page.locator('#btn-settings').click();
    check(await page.locator('#btn-settings').getAttribute('aria-current') === 'page', `${width}: settings navigation has active state`);
    check(await page.evaluate(() => document.activeElement.id !== 'proxy'), `${width}: opening settings does not summon the proxy keyboard`);
    await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-settings-v3.png` });
    await page.locator('#settings-font').selectOption('xl');
    await page.locator('#btn-save-settings').click();
    await page.waitForFunction(() => document.querySelector('#mask').hidden);
    check(await page.evaluate(() => document.documentElement.dataset.font) === 'xl', `${width}: touch settings save`);
    await page.locator('#engine').selectOption('youdao');
    await page.locator('#input').fill('translateor');
    await page.locator('#input').press('Control+Enter');
    await page.waitForFunction(() => document.querySelectorAll('.suggestion-option').length === 2);
    check(await page.locator('#input').inputValue() === 'translateor' && await page.locator('#alert').isHidden(), `${width}: misspelling shows suggestions and preserves the query`);
    check((await page.locator('.suggestion-option').allInnerTexts()).every(t => t.includes('n.')), `${width}: spelling suggestions include glosses`);
    check(await page.locator('.main-trans').count() === 0, `${width}: suggestions are not presented as a fake translation`);
    check(await page.locator('.suggestion-option').first().evaluate(el => el.getBoundingClientRect().height >= 44), `${width}: spelling candidates have touch-sized buttons`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: spelling candidates fit with the largest font`);
    await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-spelling.png` });
    await page.locator('.suggestion-option').first().click();
    await page.waitForFunction(() => document.querySelector('.main-trans')?.textContent === '译文：translator');
    check(await page.locator('#input').inputValue() === 'translator' && await page.locator('#engine').inputValue() === 'youdao', `${width}: choosing a candidate queries it with the selected engine`);
    await page.locator('#input').fill('中文');
    await page.locator('#input').press('Control+Enter');
    await page.waitForFunction(() => document.querySelector('.main-trans')?.textContent === 'Chinese');
    check((await page.locator('.result-head').innerText()).includes('中文 → 英语'), `${width}: metadata displays the actual automatic direction`);
    await page.locator('#btn-swap').click();
    await page.waitForFunction(() => document.querySelector('#lang-pair').value === 'en|zh-CN');
    check(await page.locator('#input').inputValue() === 'Chinese', `${width}: swap reverses the actual automatic target`);
    await page.evaluate(() => { window.externalInput = { text: 'warm selection' }; window.dispatchEvent(new Event('external-input-ready')); });
    await page.waitForFunction(() => document.querySelector('.main-trans')?.textContent === '译文：warm selection');
    check(await page.locator('#input').inputValue() === 'warm selection', `${width}: running app receives a new shared selection`);
    const requests = await page.evaluate(() => window.calls.filter(c => c.cmd === 'translate').length);
    await page.evaluate(() => window.dispatchEvent(new Event('external-input-ready')));
    await page.waitForTimeout(120);
    check(await page.evaluate(() => window.calls.filter(c => c.cmd === 'translate').length) === requests, `${width}: duplicate signal does not translate consumed content`);
    await page.evaluate(() => { window.externalInput = { error: '文件超过 512 KB' }; window.dispatchEvent(new Event('external-input-ready')); });
    await page.waitForFunction(() => !document.querySelector('#alert').hidden);
    check(await page.locator('#input').inputValue() === 'warm selection' && (await page.locator('#alert').innerText()).includes('512 KB'), `${width}: failed incoming file keeps the existing input`);
    await page.evaluate(() => { window.fakeNetworkError = '网络请求失败：无法解析 dict.youdao.com，请检查手机网络或私人 DNS 设置'; });
    await page.locator('[data-act="go"]').click();
    await page.waitForFunction(() => document.querySelector('#alert').textContent.includes('无法解析'));
    check((await page.locator('#alert').innerText()).includes('私人 DNS'), `${width}: network error retains the actionable cause`);
    await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-error-v3.png` });
    await page.evaluate(() => { delete window.fakeNetworkError; });
    await page.locator('#alert button').click();
    await page.waitForFunction(() => document.querySelector('#alert').hidden);
    check(await page.locator('#input').inputValue() === 'warm selection', `${width}: retry recovers without clearing the draft`);
    await page.locator('#btn-settings').click();
    check(await page.evaluate(() => window.__transslaterBack()) === true && await page.locator('#mask').isHidden(), `${width}: Android Back closes settings before leaving`);
    await page.locator('#btn-history').click();
    await page.waitForFunction(() => document.querySelectorAll('.history-item').length > 0);
    check(await page.locator('.history-item').count() === 50, `${width}: first history page`);
    await page.locator('#btn-history-more').click();
    check(await page.locator('.history-item').count() === 100, `${width}: history pagination`);
    await page.locator('#history-search').fill('word120');
    await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 1);
    check((await page.locator('.history-item').innerText()).includes('word120'), `${width}: older history search`);
    await page.locator('#export-format').selectOption('json');
    await page.locator('#btn-export').click();
    await page.waitForFunction(() => document.querySelector('#history-msg').textContent.includes('已导出'));
    check(await page.evaluate(() => window.exportedTo.path.startsWith('content://')) && (await page.locator('#history-msg').innerText()).includes('120'), `${width}: system document export includes full history despite filter`);
    await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-history.png` });
    await page.locator('#btn-close-history').click();
    await page.locator('#btn-settings').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#btn-celebrate').click();
    await page.waitForFunction(() => document.querySelector('.celebration-bouquet'));
    check(await page.locator('.celebration-bouquet').isVisible(), `${width}: word celebration supports reduced motion on mobile`);
    await page.locator('#btn-close-settings').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-act="clear"]').click();
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(240);
    await page.screenshot({ path: `test-results/android/${width}-empty-v3.png` });
    check(errors.length === 0, `${width}: no uncaught script errors ${errors}`);
    check(await page.evaluate(() => !window.calls.some(c => ['resize_window', 'toggle_maximize'].includes(c.cmd))), `${width}: no desktop window IPC`);
    await context.close();
  }
  console.log(`Completed ${checks} Android UI checks (Edge Chromium, touch emulation, mocked IPC).`);
} finally { await browser.close(); }
