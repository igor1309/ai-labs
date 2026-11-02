// Contract test: Home's rendered sky and ground in Chromium.
require('./homeBrowser.cjs').runHome([[1180, 820], [1133, 744], [744, 1133], [393, 852], [375, 667], [852, 393], [1440, 900]])
  .catch(error => { console.error(`FAIL Home browser checks: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
