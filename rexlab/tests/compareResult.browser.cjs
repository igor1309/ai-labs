// Contract test: the result's actual CSS fit, whole-page scroll, safe areas and resize in Chromium.
const assert = require('node:assert/strict');
const {join, resolve, extname} = require('node:path');
const {mkdtemp, rm, readFile, mkdir} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {chromium} = require('playwright');
const sizes = [[1180,820,false], [1133,744,false], [744,1133,false], [393,852,false], [852,393,false], [1440,900,false], [375,667,true], [320,568,true], [568,200,true], [567,360,true], [568,360,false], [667,375,false], [932,430,false], [393,759,false], [430,932,false], [700,700,false], [500,500,true], [600,800,false], [600,1000,false], [768,1024,false], [820,1180,false], [1024,1366,false]];
const rewards = [
  {score:4,best:4,beaten:undefined,celebration:'first-best'},
  {score:10,best:10,beaten:9,celebration:'new-best'},
  {score:5,best:7,beaten:undefined,celebration:null},
  {score:7,best:7,beaten:undefined,celebration:null},
  {score:0,best:0,beaten:undefined,celebration:null},
  {score:4,best:undefined,beaten:undefined,celebration:null}
];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(img => img.src).map(img => img.decode().catch(() => {})));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function show(page, props, loading = false) {
  await page.evaluate(({props,loading}) => { scrollTo(0,0); window.showResult(props,loading); }, {props,loading});
  await settle(page);
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = el => {const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const get = sel => box(document.querySelector(sel));
    const textBox = el => {const range=document.createRange();range.selectNodeContents(el);return box(range);};
    const scroll=document.scrollingElement;
    return {
      size:document.documentElement.dataset.size,
      scrolls:scroll.scrollHeight>innerHeight+1,
      horizontal:scroll.scrollWidth>innerWidth,
      hero:get('.result-hero'), sky:get('.compare-result-sky'), content:get('.result-content'), sand:get('.compare-result-sand'),
      actions:[...document.querySelectorAll('.result-actions button')].map(box),
      taps:[...document.querySelectorAll('.result button')].map(box),
      levelNames:[...document.querySelectorAll('.level-switch-name')].map(el=>({box:box(el.parentElement),text:textBox(el),hidden:getComputedStyle(el).clipPath==='inset(50%)',font:parseFloat(getComputedStyle(el.parentElement).fontSize)})),
      stars:get('.result-stars'),
      text:[...document.querySelectorAll('.result-title, .celebration, .best-score, .result-actions button')].map(el=>({name:el.className,box:box(el),text:textBox(el),scroll:el.scrollWidth})),
      nested:[...document.querySelectorAll('.result, .result *')].filter(el=>/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.className)
    };
  });
}
function fit(g,width,height,scrolls,label) {
  if(scrolls !== undefined) assert.equal(g.scrolls,scrolls,`${label}: scrolling ${JSON.stringify(g)}`);
  assert(!g.horizontal,`${label}: horizontal overflow`);
  assert.deepEqual(g.nested,[],`${label}: nested scroll`);
  assert(g.sand.bottom>=height-1,`${label}: sand reaches the bottom of the window`);
  assert(g.hero.height>=120-.5,`${label}: dinosaur minimum`);
  assert(g.stars.x>=0 && g.stars.right<=width+1,`${label}: ten stars fit`);
  if(g.size==='wide-short') assert(g.hero.right<=g.content.x+1,`${label}: dinosaur beside rewards`);
  else assert(g.hero.bottom<=g.content.y+1,`${label}: dinosaur above rewards`);
  for(const name of g.levelNames) {
    const phone=['tall-narrow','wide-short'].includes(g.size);
    assert.equal(name.hidden,phone,`${label}: level name visibility`);
    if(!phone) assert(name.text.x>=name.box.x-1 && name.text.right<=name.box.right+1 && name.font>=14,`${label}: readable level name`);
  }
  for(const b of g.taps) assert(b.width>=44 && b.height>=44 && b.x>=0 && b.right<=width+1,`${label}: tap ${JSON.stringify(b)}`);
  for(const t of g.text) {
    assert(t.text.width<=t.box.width+1 && t.scroll<=t.box.width+1,`${label}: ${t.name} text clipped`);
    assert(t.box.x>=0 && t.box.right<=width+1,`${label}: ${t.name} outside page`);
  }
  assert.equal(g.actions[0].y<g.actions[1].y-1,g.size==='tall-narrow',`${label}: action arrangement`);
}
(async()=>{
  let browser;
  const output=await mkdtemp(join(tmpdir(),'rexlab-result-'));
  try {
    const {build}=await import('vite');
    const root=resolve(__dirname,'..');
    await build({root,logLevel:'error',build:{outDir:output,rolldownOptions:{input:{main:join(root,'index.html'),result:join(__dirname,'compareResult.fixture.html'),sw:join(root,'src/offline/sw.ts')}}}});
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
    const page=await browser.newPage({reducedMotion:'reduce'});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
    await page.route('http://result.test/**',async route=>{
      const file=new URL(route.request().url()).pathname.slice(1);
      try {await route.fulfill({body:await readFile(join(output,file)),contentType:types[extname(file)]||'application/octet-stream'});} catch {await route.fulfill({status:404});}
    });
    await page.goto('http://result.test/tests/compareResult.fixture.html');
    await page.waitForFunction(()=>!!window.showResult);
    let checked=0;
    for(const [width,height,scrolls] of sizes) for(const language of ['en','ru']) for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height});
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const reward of rewards) {
        await show(page,{language,...reward});
        fit(await geometry(page),width,height,reward.celebration==='new-best'?scrolls:undefined,`${width}x${height}/${language}/${theme}/${reward.score}/${reward.celebration}`);
        checked++;
      }
      await show(page,{language,...rewards[1]},true);
      fit(await geometry(page),width,height,scrolls,`${width}x${height}/loading`);
      if(scrolls) {
        const before=await page.locator('.compare-result-sky').boundingBox();
        await page.evaluate(()=>scrollTo(0,document.scrollingElement.scrollHeight));
        const after=await page.locator('.compare-result-sky').boundingBox();
        assert(after.y<before.y,'sky scrolls with the whole page');
        const home=await page.locator('.result-actions button').last().boundingBox();
        assert(home.y>=0 && home.y+home.height<=height,'HOME reachable by scrolling');
      }
    }
    // Insets are CSS environment inputs; inject the same stylesheet with
    // controlled notch and home-indicator values for browser measurement.
    const css=await readFile(join(root,'src/app.css'),'utf8');
    for(const [width,height,insets] of [[852,393,{top:0,right:59,bottom:21,left:59}],[744,1133,{top:24,right:13,bottom:20,left:19}]]) {
      await page.setViewportSize({width,height});
      const sheet=await page.addStyleTag({content:css.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g,(_,side)=>`${insets[side]}px`)});
      await show(page,{language:'ru',...rewards[1]});
      const g=await geometry(page);fit(g,width,height,false,'safe areas');
      assert(g.hero.y>=insets.top && g.actions.every(b=>b.x>=insets.left+20 && b.right<=width-insets.right-20 && b.bottom<=height-insets.bottom),'controls clear safe areas');
      await sheet.evaluate(el=>el.remove());
    }
    await page.setViewportSize({width:600,height:1000});
    const gutter=await page.addStyleTag({content:'html { scrollbar-gutter: stable; }'});
    for(const language of ['en','ru']) {
      await show(page,{language,...rewards[1]});
      const g=await geometry(page);fit(g,600,1000,false,`${language}/scrollbar`);
      assert(g.stars.width>=440,'ten stars at least 44 pixels each');
    }
    await gutter.evaluate(el=>el.remove());
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:1180,height:820});
    await show(page,rewards[1]);
    const score=await page.locator('.result-score-value').elementHandle();
    const star=await page.locator('.star-won').first().elementHandle();
    for(const [width,height] of [[820,1180],[393,852],[852,393],[700,700],[1180,820]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>window.showResult({score:10,best:10,beaten:9,celebration:'new-best'}));
      assert(await score.evaluate(el=>el===document.querySelector('.result-score-value')),'score identity across resize');
      assert(await star.evaluate(el=>el===document.querySelector('.star-won')),'star identity across resize');
      assert(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.target?.matches('.result-score-value, .star-won, .celebration')).every(a=>a.playState==='finished')),'completed rewards do not replay');
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    const screenshots=process.env.REXLAB_RESULT_SCREENSHOTS;
    if(screenshots) {
      await mkdir(screenshots,{recursive:true});
      for(const [width,height] of sizes.slice(0,8)) for(const level of ['hatchling','explorer','paleontologist']) {
        await page.setViewportSize({width,height});
        await show(page,{...rewards[1],level});
        await page.screenshot({path:join(screenshots,`${width}x${height}-${level}.png`),fullPage:true});
      }
    }
    console.log(`PASS ${checked} result configurations: rewards, fit, scrolling, safe areas, loading and resize`);
  } finally {
    if(browser) await browser.close();
    await rm(output,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
