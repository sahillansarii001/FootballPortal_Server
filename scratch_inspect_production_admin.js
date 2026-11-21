const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const ADMIN_PAGES = [
  { name: 'Admin Overview', url: 'https://football.mediaiofficial.in/admin' },
  { name: 'Admin Live Control', url: 'https://football.mediaiofficial.in/admin/live-control' },
  { name: 'Admin Schedule', url: 'https://football.mediaiofficial.in/admin/schedule' },
  { name: 'Admin Teams', url: 'https://football.mediaiofficial.in/admin/teams' },
  { name: 'Admin Players', url: 'https://football.mediaiofficial.in/admin/players' },
  { name: 'Admin Standings', url: 'https://football.mediaiofficial.in/admin/standings' },
  { name: 'Admin Top Scorers', url: 'https://football.mediaiofficial.in/admin/top-scorers' },
  { name: 'Admin Tournaments', url: 'https://football.mediaiofficial.in/admin/tournaments' }
];

async function inspectProductionAdmin() {
  console.log('=== INSPECTING PRODUCTION ADMIN PANEL ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('[STEP 1] Navigating to https://football.mediaiofficial.in/login...');
  await page.goto('https://football.mediaiofficial.in/login', { waitUntil: 'networkidle2', timeout: 30000 });

  console.log('[STEP 2] Logging in via API / login form...');
  const loginRes = await page.evaluate(async () => {
    try {
      const res = await fetch('https://api.football.mediaiofficial.in/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@footballportal.com', password: 'AdminPassword123!' })
      });
      const data = await res.json();
      if (data.success && data.data) {
        localStorage.setItem('auth_token', data.data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.data.user));
        return { success: true, user: data.data.user };
      }
      return { success: false, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  console.log('Login Result:', loginRes);

  for (const item of ADMIN_PAGES) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`ADMIN PAGE: ${item.name} (${item.url})`);
    console.log(`------------------------------------------------------------`);

    const consoleLogs = [];
    const failedRequests = [];
    const apiCalls = [];

    const onConsole = msg => consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    const onRequestFailed = req => failedRequests.push(`${req.method()} ${req.url()}`);
    const onResponse = async res => {
      const url = res.url();
      if (url.includes('/api/')) {
        let snippet = '';
        try {
          snippet = (await res.text()).slice(0, 120);
        } catch (e) {}
        apiCalls.push(`${res.status()} ${url} -> ${snippet}`);
      }
    };

    page.on('console', onConsole);
    page.on('requestfailed', onRequestFailed);
    page.on('response', onResponse);

    try {
      await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2500));

      const title = await page.title();
      const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' '));
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n+/g, ' ')).filter(Boolean).slice(0, 10));

      console.log(`Title: ${title}`);
      console.log(`Body: ${bodySnippet}`);
      console.log(`Buttons: ${JSON.stringify(buttons)}`);
      console.log(`API Calls (${apiCalls.length}):`);
      apiCalls.forEach(c => console.log(`   ${c}`));
      if (failedRequests.length > 0) {
        console.log(`Failed Requests:`, failedRequests);
      }
      if (consoleLogs.length > 0) {
        console.log(`Console Logs:`, consoleLogs.slice(-5));
      }
    } catch (err) {
      console.error(`Error on ${item.url}:`, err.message);
    } finally {
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    }
  }

  await browser.close();
  console.log('\n=== PRODUCTION ADMIN INSPECTION COMPLETE ===');
}

inspectProductionAdmin().catch(e => {
  console.error(e);
  process.exit(1);
});
