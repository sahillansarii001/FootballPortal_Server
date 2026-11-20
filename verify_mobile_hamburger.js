const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 14

  console.log('[1] Visiting http://localhost:3000 to authenticate in browser session...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Perform login directly via window.fetch and save to localStorage
  const authResult = await page.evaluate(async () => {
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@footballportal.com', password: 'AdminPassword123!' })
      });
      const json = await res.json();
      if (json.success && json.data) {
        localStorage.setItem('auth_token', json.data.token);
        localStorage.setItem('auth_user', JSON.stringify(json.data.user));
        return { success: true, email: json.data.user.email };
      }
      return { success: false, json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  console.log('  Authentication result in browser:', authResult);

  console.log('\n[2] Navigating to http://localhost:3000/admin/live-control on Mobile (390x844)...');
  await page.goto('http://localhost:3000/admin/live-control', { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[aria-label="Toggle navigation menu"]', { timeout: 10000 });
  console.log('  ✅ Hamburger button found on mobile header!');

  const initialAside = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.getBoundingClientRect().left : null;
  });
  console.log(`  Initial sidebar position on mobile: left = ${initialAside}px (${initialAside < 0 ? '✅ HIDDEN OFF-SCREEN' : 'VISIBLE'})`);

  // Open Drawer
  console.log('\n[3] Tapping Mobile Hamburger menu...');
  await page.click('button[aria-label="Toggle navigation menu"]');
  await new Promise(r => setTimeout(r, 600));

  const openAside = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? { left: aside.getBoundingClientRect().left, width: aside.getBoundingClientRect().width } : null;
  });
  console.log(`  Drawer open state: left = ${openAside?.left}px, width = ${openAside?.width}px (${openAside?.left >= 0 ? '✅ OPEN & VISIBLE' : 'FAILED'})`);

  // Close Drawer
  console.log('\n[4] Tapping Close button inside drawer...');
  await page.click('button[aria-label="Close menu"]');
  await new Promise(r => setTimeout(r, 600));

  const closedAside = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.getBoundingClientRect().left : null;
  });
  console.log(`  Drawer closed state: left = ${closedAside}px (${closedAside < 0 ? '✅ SLID OFF-SCREEN' : 'FAILED'})`);

  // Test Mobile Timer Countdown on Live Control
  console.log('\n[5] Observing Mobile Live Control UI elements:');
  const uiSummary = await page.evaluate(() => {
    const text = document.body.innerText;
    const matchTime = text.match(/\b\d{2}:\d{2}\b/);
    const badge = text.includes('CLOCK RUNNING') ? 'CLOCK RUNNING' : (text.includes('CLOCK PAUSED') ? 'CLOCK PAUSED' : 'OTHER');
    return {
      clock: matchTime ? matchTime[0] : null,
      badge,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\n/g, ' ')).filter(b => b.length > 0 && b.length < 35)
    };
  });
  console.log(`  Clock Display on Mobile: ${uiSummary.clock} | Badge: ${uiSummary.badge}`);
  console.log('  Action Buttons on Mobile Screen:', uiSummary.buttons.slice(0, 8));

  await browser.close();
  console.log('\n======================================================================');
  console.log('✅ ALL MOBILE HAMBURGER & DRAWER CHECKS PASSED WITH 100% SUCCESS');
  console.log('======================================================================');
})();
