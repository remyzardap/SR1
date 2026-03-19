import { chromium } from 'playwright';

(async () => {
  // Launch Chromium browser (visible)
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 50  // Slow down by 50ms for better visibility
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to a website
  await page.goto('https://example.com');
  
  console.log('✅ Chromium browser is open!');
  console.log('Close the browser to end the script.');
  
  // Keep the browser open
  await new Promise(() => {});
})();
