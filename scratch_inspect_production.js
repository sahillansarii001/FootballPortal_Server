const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PAGES = [
  { name: 'Homepage', url: 'https://football.mediaiofficial.in/' },
  { name: 'Fixtures', url: 'https://football.mediaiofficial.in/fixtures' },
  { name: 'Live Matches', url: 'https://football.mediaiofficial.in/matches/live' },
  { name: 'Teams', url: 'https://football.mediaiofficial.in/teams' },
  { name: 'Players', url: 'https://football.mediaiofficial.in/players' },
  { name: 'Standings', url: 'https://football.mediaiofficial.in/standings' },
  { name: 'Results', url: 'https://football.mediaiofficial.in/results' },
  { name: 'Admin', url: 'https://football.mediaiofficial.in/admin' },
  { name: 'Login', url: 'https://football.mediaiofficial.in/login' }
];

async function inspectProduction() {
  console.log('=== INSPECTING ACTUAL PRODUCTION SITE: https://football.mediaiofficial.in ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  for (const item of PAGES) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`PAGE: ${item.name} (${item.url})`);
    console.log(`------------------------------------------------------------`);

    const consoleLogs = [];
    const failedRequests = [];
    const apiCalls = [];

    const onConsole = msg => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push(`[${type.toUpperCase()}] ${text}`);
    };

    const onRequestFailed = req => {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure() ? req.failure().errorText : 'failed'}`);
    };

    const onResponse = async res => {
      const url = res.url();
      if (url.includes('/api/')) {
        let snippet = '';
        try {
          const txt = await res.text();
          snippet = txt.slice(0, 150);
        } catch (e) {}
        apiCalls.push(`${res.status()} ${url} -> ${snippet}`);
      }
    };

    page.on('console', onConsole);
    page.on('requestfailed', onRequestFailed);
    page.on('response', onResponse);

    try {
      const resp = await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log(`HTTP Status: ${resp ? resp.status() : 'No response'}`);

      // Wait a bit for client hydration & async fetches
      await new Promise(r => setTimeout(r, 3000));

      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500).replace(/\n+/g, ' '));

      console.log(`Title: ${title}`);
      console.log(`Body snippet: ${bodyText}`);
      console.log(`API Calls (${apiCalls.length}):`);
      apiCalls.forEach(call => console.log(`   ${call}`));
      if (failedRequests.length > 0) {
        console.log(`Failed Requests (${failedRequests.length}):`);
        failedRequests.forEach(req => console.log(`   ❌ ${req}`));
      } else {
        console.log(`Failed Requests: None`);
      }
      if (consoleLogs.length > 0) {
        console.log(`Console Logs (${consoleLogs.length}):`);
        consoleLogs.slice(-10).forEach(log => console.log(`   ${log}`));
      }
    } catch (err) {
      console.error(`Error loading ${item.url}:`, err.message);
    } finally {
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    }
  }

  await browser.close();
  console.log('\n=== PRODUCTION INSPECTION COMPLETE ===');
}

inspectProduction().catch(err => {
  console.error('Fatal inspection error:', err);
  process.exit(1);
});
