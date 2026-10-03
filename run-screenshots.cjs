const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4188;
const ROOT = path.join(__dirname, 'dist/public');
const OUT_DIR = '/root/kimi-work/design/a1';

const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
};

// 1. Static SPA server
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    f = path.join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
  try {
    await runScreenshots();
  } catch (err) {
    console.error('Screenshot error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

const ok = (v) => ({ result: { data: { json: v } } });
const adminUser = { id: 1, openId: 'o', name: 'Remy', email: 'remy@sutaeru.com', role: 'admin' };

const mockEngines = {
  engines: [
    { id: 'gemini', label: 'Gemini', model: '', qualityModel: '', available: true, defaultEngine: true, supportsReference: true },
    { id: 'openai', label: 'OpenAI', model: '', qualityModel: '', available: true, defaultEngine: false, supportsReference: true },
    { id: 'qwen', label: 'Wan', model: '', qualityModel: '', available: true, defaultEngine: false, supportsReference: true },
  ],
};

async function runScreenshots() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  // Test cases: [pageName, path, colorScheme, width, height]
  const tests = [
    // Standard 390x844 light
    ['01-images-engine.png', '/images?step=engine', 'light', 390, 844],
    ['02-images-prompt.png', '/images?step=prompt&demo=1', 'light', 390, 844],
    ['07-images-generating.png', '/images?step=generating&demo=1', 'light', 390, 844],
    ['08-images-done.png', '/images?step=done&demo=1', 'light', 390, 844],
    ['09-images-failed.png', '/images?step=failed&demo=1', 'light', 390, 844],
    ['04-generate.png', '/generate?running=true', 'light', 390, 844],
    ['04-generate-idle.png', '/generate', 'light', 390, 844],

    // Dark mode
    ['01-images-engine-dark.png', '/images?step=engine', 'dark', 390, 844],
    ['02-images-prompt-dark.png', '/images?step=prompt&demo=1', 'dark', 390, 844],
    ['07-images-generating-dark.png', '/images?step=generating&demo=1', 'dark', 390, 844],
    ['08-images-done-dark.png', '/images?step=done&demo=1', 'dark', 390, 844],
    ['09-images-failed-dark.png', '/images?step=failed&demo=1', 'dark', 390, 844],
    ['04-generate-dark.png', '/generate?running=true', 'dark', 390, 844],

    // Responsive width checks (360 and 430)
    ['01-images-engine-360.png', '/images?step=engine', 'light', 360, 800],
    ['01-images-engine-430.png', '/images?step=engine', 'light', 430, 932],
    ['04-generate-360.png', '/generate?running=true', 'light', 360, 800],
    ['04-generate-430.png', '/generate?running=true', 'light', 430, 932],
  ];

  for (const [filename, urlPath, scheme, width, height] of tests) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: 'block',
      colorScheme: scheme,
    });
    const page = await ctx.newPage();

    // Mock tRPC
    await page.route('**/api/trpc/**', async (route) => {
      const url = route.request().url();
      const pathname = new URL(url).pathname;
      const names = pathname.split('/api/trpc/')[1]?.split(',') || [];
      const out = names.map((n) => {
        if (n === 'auth.me') return ok(adminUser);
        if (n.includes('list') || n.includes('availableModels') || n.includes('approvedSkills')) return ok([]);
        return ok({});
      });
      await route.fulfill({ json: out });
    });

    // Mock function calls
    await page.route('**/api/fn/**', async (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.action === 'engines') {
        await route.fulfill({ json: mockEngines });
        return;
      }
      await route.fulfill({ json: {} });
    });

    // Emulate dark mode token data attribute if needed
    if (scheme === 'dark') {
      await page.addInitScript(() => {
        document.documentElement.dataset.mode = 'dark';
      });
    }

    // Set demo prompt value for prompt screen
    if (urlPath.includes('demo=1') && urlPath.includes('step=prompt')) {
      await page.addInitScript(() => {
        // Will be picked up if needed
      });
    }

    await page.goto(`http://127.0.0.1:${PORT}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    // If on prompt screen and demo is set, set textarea text if empty
    if (urlPath.includes('step=prompt')) {
      const textarea = page.locator('#image-prompt-field');
      if (await textarea.count() > 0) {
        const val = await textarea.inputValue();
        if (!val) {
          await textarea.fill('A ceramic mug on a wooden table in soft morning light');
          await page.waitForTimeout(300);
        }
      }
    }

    // Check for horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    const outPath = path.join(OUT_DIR, filename);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved: ${filename} (scheme: ${scheme}, ${width}x${height}, overflow: ${overflow})`);

    await ctx.close();
  }

  await browser.close();
  console.log('All screenshots completed successfully!');
}
