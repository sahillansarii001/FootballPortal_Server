const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'admin@footballportal.com');
  await page.type('input[type="password"]', 'AdminPassword123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);
  await page.goto('http://localhost:3000/admin/live-control', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const res = await page.evaluate(() => {
    return {
      url: window.location.href,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n/g, ' ')),
      body: document.body.innerText.slice(0, 1000)
    };
  });
  console.log('Current URL:', res.url);
  console.log('Buttons:', res.buttons);
  console.log('Body:', res.body);
  await browser.close();
})();
