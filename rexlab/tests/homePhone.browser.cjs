// Contract test: Home controls, full names and tile browsing on small phones in Chromium.
require('./homeBrowser.cjs').runHome([[320, 568], [390, 664], [430, 932]])
  .catch(error => { console.error(`FAIL Home browser checks: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
