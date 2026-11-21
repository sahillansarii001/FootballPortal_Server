const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyDetailPages() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('Testing Match Detail (/matches/6b0116f88bc5478b405cf27d)...');
  await page.goto('https://football.mediaiofficial.in/matches/6b0116f88bc5478b405cf27d', { waitUntil: 'networkidle2' });
  const matchText = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' '));
  console.log('Match Detail:', matchText);

  console.log('\nTesting Team Detail (/teams/6aff107421c5df6a752390cc - United)...');
  await page.goto('https://football.mediaiofficial.in/teams/6aff107421c5df6a752390cc', { waitUntil: 'networkidle2' });
  const teamText = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' '));
  console.log('Team Detail:', teamText);

  console.log('\nTesting Team Detail (/teams/6aff109321c5df6a752390ef - Atlatico FC)...');
  await page.goto('https://football.mediaiofficial.in/teams/6aff109321c5df6a752390ef', { waitUntil: 'networkidle2' });
  const atlaticoText = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' '));
  console.log('Atlatico Detail:', atlaticoText);

  await browser.close();
}

verifyDetailPages().catch(e => {
  console.error(e);
  process.exit(1);
});
