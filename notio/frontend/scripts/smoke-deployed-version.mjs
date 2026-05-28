const targetUrl = requiredEnv("NOTIO_FRONTEND_URL");
const expectedVersion = requiredEnv("EXPECTED_VERSION");
const playwrightModule = process.env.NOTIO_SMOKE_PLAYWRIGHT_MODULE ?? "playwright";

const { chromium } = await import(playwrightModule);
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(targetUrl, { timeout: 30_000, waitUntil: "networkidle" });

  const versionText = await page.getByLabel("Version").textContent({ timeout: 10_000 });
  const renderedVersion = versionText?.trim() ?? "<missing>";

  if (renderedVersion !== expectedVersion) {
    throw new Error(`Expected deployed version ${expectedVersion}, received ${renderedVersion}`);
  }

  console.log(`Verified deployed Notio frontend version ${expectedVersion}`);
} finally {
  await browser.close();
}

function requiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
