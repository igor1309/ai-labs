// Contract test: the CARE walk of careWalk.browser.cjs on the phones,
// upright and on their side, as its own job within CI's ten minutes.
process.env.CARE_WALK = "phones";
require("./careWalk.browser.cjs");
