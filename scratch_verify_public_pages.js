const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PUBLIC_PAGES = [
  { name: 'Homepage', url: 'https://football.mediaiofficial.in/' },
  { name: 'Fixtures', url: 'https://football.mediaiofficial.in/fixtures' },
  { name: 'Live Matches', url: 'https://football.mediaiofficial.in/live' },
  { name: 'Teams', url: 'https://football.mediaiofficial.in/teams' },
  { name: 'Players', url: 'https://football.mediaiofficial.in/players' },
  { name: 'Standings', url: 'https://football.mediaiofficial.in/standings' },
  { name: 'Results', url: 'https://football.mediaiofficial.in/results' }
];

async function verifyAllPublicPages() {
  console.log('=== VERIFYING ALL PUBLIC PRODUCTION PAGES ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const results = [];

  for (const item of PUBLIC_PAGES) {
    console.log(`Checking ${item.name} (${item.url})...`);
    const consoleLogs = [];
    const failedRequests = [];

    const onConsole = msg => {
      if (msg.type() === 'error' || msg.type() === 'warn') {
        consoleLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    };
    const onRequestFailed = req => failedRequests.push(`${req.method()} ${req.url()}`);

    page.on('console', onConsole);
    page.on('requestfailed', onRequestFailed);

    try {
      const resp = await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));

      const title = await page.title();
      const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' '));
      const hasLoading = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('loading') || text.includes('connecting to live telemetry') || text.includes('verifying administrative');
      });

      console.log(`  -> Status: ${resp.status()}`);
      console.log(`  -> Title: ${title}`);
      console.log(`  -> Content Snippet: ${bodySnippet}`);
      console.log(`  -> Stuck Loading: ${hasLoading ? 'YES (CHECK)' : 'NO (PASSED)'}`);
      if (failedRequests.length > 0) {
        console.log(`  -> Failed Requests:`, failedRequests);
      }
      if (consoleLogs.length > 0) {
        console.log(`  -> Console Logs:`, consoleLogs);
      }

      results.push({
        page: item.name,
        url: item.url,
        status: resp.status(),
        hasLoading,
        snippet: bodySnippet
      });
    } catch (err) {
      console.error(`  -> ERROR on ${item.url}:`, err.message);
      results.push({
        page: item.name,
        url: item.url,
        error: err.message
      });
    } finally {
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
    }
    console.log('');
  }

  await browser.close();
  console.log('=== SUMMARY OF PUBLIC PAGE RESULTS ===');
  console.table(results);
}

verifyAllPublicPages().catch(e => {
  console.error(e);
  process.exit(1);
});
