const { chromium } = require('playwright');
const { resolve } = require('node:path');
const { mkdir } = require('node:fs/promises');
(async()=>{
 const {preview}=await import('vite');
 const server=await preview({root:resolve(__dirname,'..'),preview:{host:'127.0.0.1',port:0}});
 let browser;
 try {
 browser=await chromium.launch();
 const screenshots = process.env.REXLAB_SCREENSHOTS;
 if (screenshots) await mkdir(screenshots,{recursive:true});
 for(const level of ['hatchling','explorer','paleontologist']) for(const [size,width,height] of [['ipad-landscape',1180,820],['ipad-portrait',820,1180],['iphone-landscape',852,393],['iphone-portrait',393,852],['mac',1440,900]]) {
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 await context.addInitScript(level=>{localStorage.setItem('rexlab-language','en');localStorage.setItem('rexlab-age-level',JSON.stringify({level,revision:'parent'}));},level);
 const page=await context.newPage();await page.goto(server.resolvedUrls.local[0]);
 await page.locator('.parent-menus').waitFor();
 const boxes = await page.locator('.parent-menus .parent-menu-button').evaluateAll(buttons => buttons.map(button => {
   const { x, width } = button.getBoundingClientRect();
   return { x, width };
 }));
 const round = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ds-round')));
 if (boxes.length !== 3 || boxes.some(box => box.width !== round)) throw Error(`Parent controls must each be the design's round ${round}px`);
 const centers = boxes.map(box => box.x + box.width / 2);
 if (Math.abs((centers[1] - centers[0]) - (centers[2] - centers[1])) > 0.5) throw Error('Parent controls must be evenly spaced');
 const button=page.getByRole('button',{name:'Language',exact:true});await button.waitFor();await page.evaluate(()=>document.fonts.ready);
 if(await button.locator('.language-flag-disc').getAttribute('data-language')!=='en') throw Error('Wrong collapsed flag');
 if (screenshots) await page.screenshot({path:`${screenshots}/${level}-${size}-closed.png`});
 await button.click();await page.getByRole('menu',{name:'Language',exact:true}).waitFor();
 await page.getByRole('menu',{name:'Language',exact:true}).evaluate(menu => Promise.all(menu.getAnimations({subtree:true}).map(animation => animation.finished)));
 for(const name of ['English','Русский']) await page.getByRole('menuitemradio',{name,exact:true}).waitFor();
 if (screenshots) await page.screenshot({path:`${screenshots}/${level}-${size}-open.png`});
 await page.getByRole('menuitemradio',{name:'Русский',exact:true}).click();
 if(await page.getByRole('button',{name:'Язык',exact:true}).locator('.language-flag-disc').getAttribute('data-language')!=='ru')throw Error('Wrong switched flag');
 await context.close();
 }
 console.log('PASS: flag states and switching across 15 age/viewport combinations');
 }finally{await browser?.close();await server.httpServer.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
