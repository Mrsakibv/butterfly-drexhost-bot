const { chromium } = require('playwright');
const path = require('node:path');

const WEBSITE = 'https://dash.drexhost.in/afk';
const STATE_PATH = path.join(__dirname, 'storage-state.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  await page.goto(WEBSITE, { waitUntil: 'domcontentloaded' });

  console.log('\nBrowser-এ website-এর Login with Discord button চাপো।');
  console.log('Discord OAuth শেষ করে AFK page-এ ফিরে এলে VS Code terminal-এ ENTER চাপো।');
  console.log('এই state ফাইলটি password/token-এর মতো গোপন রাখবে; কাউকে পাঠাবে না।\n');

  await new Promise(resolve => process.stdin.once('data', resolve));
  await context.storageState({ path: STATE_PATH });
  console.log(`Saved login state to ${STATE_PATH}`);
  await browser.close();
})().catch(error => {
  console.error('Login setup failed:', error);
  process.exit(1);
});
