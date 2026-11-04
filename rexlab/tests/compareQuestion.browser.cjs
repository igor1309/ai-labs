// Contract test: the question's actual CSS fit, whole-page scroll and resize in Chromium.
const assert = require('node:assert/strict');
const { join, resolve, extname } = require('node:path');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { chromium } = require('playwright');
const dinosaurs = require('../src/data/dinosaurs.json');
const sizes = [[1180,820,false], [1133,744,false], [744,1133,false], [393,852,false], [852,393,false], [1440,900,false], [375,667,true], [320,568,true], [568,200,true], [567,360,true], [568,360,false], [667,375,false], [932,430,false], [393,759,false], [430,932,false], [700,700,true], [500,500,true]];
const prompts = ['mass', 'height', 'lighter', 'shorter', 'longer'];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function show(page, props, loading = false) {
  await page.evaluate(({props, loading}) => { scrollTo(0,0); window.showQuestion(props, loading); }, {props, loading});
  await settle(page);
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    const get = sel => box(document.querySelector(sel));
    const textWidth = el => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect().width; };
    const cards = [...document.querySelectorAll('.dinosaur-card')];
    const scroll = document.scrollingElement;
    return {
      size: document.documentElement.dataset.size,
      scrolls: scroll.scrollHeight > innerHeight + 1,
      horizontal: scroll.scrollWidth > innerWidth,
      nested: [...document.querySelectorAll('.question, .question *')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(el=>el.className),
      home:get('.home-button'), prompt:get('.prompt'), bar:get('.question-bar'),
      promptContent: document.querySelector('.prompt').scrollWidth,
      pockets: cards.map(box), pictures: [...document.querySelectorAll('.dinosaur-picture')].map(box),
      names: [...document.querySelectorAll('.dinosaur-name')].map(el => ({...box(el),text:textWidth(el)})),
      chips: [...document.querySelectorAll('.dinosaur-value-chip')].map(box),
      versus:get('.versus'),
      minPicture: Number.parseFloat(getComputedStyle(document.querySelector('.question')).getPropertyValue('--min-picture')),
      next: document.querySelector('.next-button') && get('.next-button'),
      best: document.querySelector('.question-best') && getComputedStyle(document.querySelector('.question-best')).display !== 'none'
    };
  });
}
function fit(g,width,height,scrolls,label) {
  assert.equal(g.scrolls,scrolls,`${label}: scroll outcome ${JSON.stringify(g)}`);
  assert(!g.horizontal,`${label}: horizontal overflow`);
  assert.deepEqual(g.nested,[],`${label}: whole-page scroll only`);
  assert(g.promptContent <= g.prompt.width + 1, `${label}: prompt clipped`);
  assert(g.home.width>=48 && g.home.height>=48,`${label}: home target`);
  assert.equal(g.best,['wide','tall'].includes(g.size),`${label}: larger-window best`);
  for (let i=0;i<2;i++) {
    const pocket=g.pockets[i], picture=g.pictures[i], name=g.names[i], chip=g.chips[i];
    assert(picture.height >= g.minPicture - .5,`${label}: picture minimum`);
    assert(Math.abs(picture.height-g.pictures[0].height)<.5 && Math.abs(picture.width-g.pictures[0].width)<.5,`${label}: equal pictures`);
    assert(name.text<=name.width+1 && name.x>=pocket.x && name.right<=pocket.right+1,`${label}: name clipped`);
    assert(name.y>=picture.bottom-1 && name.bottom<=pocket.bottom,`${label}: name below picture inside pocket`);
    if(chip) assert(chip.x>=pocket.x && chip.right<=pocket.right+1 && chip.bottom<=picture.bottom+1,`${label}: value outside picture`);
  }
  const stacked=['tall','tall-narrow'].includes(g.size);
  assert.equal(Math.abs(g.pockets[0].x-g.pockets[1].x)<1,stacked,`${label}: arrangement`);
  assert(g.versus.width>0 && g.versus.x>=0 && g.versus.right<=width,`${label}: VS`);
  if(g.next) assert(g.next.height>=48 && g.next.x>=0 && g.next.right<=width,`${label}: next target`);
}
(async()=>{
  let browser;
  const output=await mkdtemp(join(tmpdir(), "rexlab-question-"));
  try {
    const {build}=await import('vite');
    const root=resolve(__dirname,'..');
    await build({root,logLevel:'error',build:{outDir:output,rolldownOptions:{input:{main:join(root,'index.html'),question:join(__dirname,'compareQuestion.fixture.html'),sw:join(root,'src/offline/sw.ts')}}}});
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
    const page=await browser.newPage({reducedMotion:'reduce'});
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
    await page.route('http://question.test/**',async route=>{
      const file=new URL(route.request().url()).pathname.slice(1);
      try {await route.fulfill({body:await readFile(join(output,file)),contentType:types[extname(file)]||'application/octet-stream'});} catch {await route.fulfill({status:404});}
    });
    await page.goto('http://question.test/tests/compareQuestion.fixture.html');
    await page.waitForFunction(()=>!!window.showQuestion);
    let checked=0;
    for(const [width,height,scrolls] of sizes) for(const language of ['en','ru']) for(const theme of ['light','dark']) {
      await page.setViewportSize({width,height});
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const prompt of prompts) {
        const pair=dinosaurs.filter(d=>d.attributes.massKg).slice(0,2);
        // Long shipped names and wide value strings exercise each box.
        const names=dinosaurs.map(d=>d.name[language]).sort((a,b)=>b.length-a.length);
        const left={id:pair[0].id,name:names[0],picture:`/src/assets/dinos/${pair[0].id}/body.webp`,value:undefined,mark:undefined,chosen:false};
        const right={id:pair[1].id,name:names[1],picture:`/src/assets/dinos/${pair[1].id}/body.webp`,value:undefined,mark:undefined,chosen:false};
        const props={language,prompt,left,right};
        const label=`${width}x${height}/${language}/${theme}/${prompt}`;
        await show(page,props);
        const before=await geometry(page); fit(before,width,height,scrolls,label);
        const fitsNames=await page.locator('.dinosaur-name').first().evaluate((el,names)=>{
          const style=getComputedStyle(el);
          const canvas=document.createElement('canvas');
          const context=canvas.getContext('2d');
          context.font=style.font;
          context.letterSpacing=style.letterSpacing;
          return names.every(name=>context.measureText(name.toLocaleUpperCase()).width<=el.getBoundingClientRect().width+1);
        },dinosaurs.map(d=>d.name[language]));
        assert(fitsNames,`${label}: every shipped name fits`);
        for(const wrong of [false,true]) {
          await show(page,{...props,answered:true,last:wrong,left:{...left,value:language==='en'?'15,000 KG':'15 000 КГ',mark:'correct',chosen:!wrong},right:{...right,value:language==='en'?'1,500 KG':'1 500 КГ',mark:wrong?'wrong':undefined,chosen:wrong}});
          const answered=await geometry(page); fit(answered,width,height,scrolls,label);
          assert.deepEqual(answered.pockets,before.pockets,`${label}: answering moves pockets`);
          assert.deepEqual(answered.pictures,before.pictures,`${label}: answering moves pictures`);
          await page.locator('.next-button').scrollIntoViewIfNeeded();
          const action=await page.locator('.next-button').boundingBox();
          assert(action.y>=0 && action.y+action.height<=height+1,`${label}: action reachable`);
        }
        checked++;
      }
    }
    // Resizing preserves the supplied answered state and makes a square upright.
    for(const [width,height,size] of [[1180,820,'wide'],[820,1180,'tall'],[700,700,'tall'],[567,360,'tall-narrow'],[568,360,'wide-short'],[852,600,'wide'],[568,600,'tall-narrow'],[600,600,'tall']]) {
      await page.setViewportSize({width,height});
      await show(page,{answered:true,left:{id:'a',name:'TRICERATOPS',picture:'/src/assets/dinos/triceratops/body.webp',value:'7 T',mark:'correct',chosen:true}});
      assert.equal(await page.locator('html').getAttribute('data-size'),size);
      assert.equal(await page.locator('[data-mark="correct"]').count(),1);
      assert.equal(await page.locator('.next-button').count(),1);
    }
    for(const reduced of [false,true]) {
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      for(const mark of ['correct','wrong']) {
        await show(page,{answered:true,right:{id:'b',name:'VELOCIRAPTOR',picture:'/src/assets/dinos/velociraptor/body.webp',value:'15 KG',mark,chosen:true}});
        const motion=await page.locator(`[data-mark="${mark}"]`).evaluate(el=>getComputedStyle(el).animationName);
        assert.equal(motion,reduced?'fade-in':mark==='correct'?'squish':'pocket-shake','answer motion respects reduced motion');
      }
      await page.locator('.home-button').focus();
      assert.equal(await page.locator('.home-button').evaluate(el=>getComputedStyle(el).outlineStyle),'solid','visible keyboard focus');
    }
    await show(page,{},true);
    assert.equal(await page.locator('[data-picture="loading"]').count(),2);
    assert.equal(await page.locator('.next-button').count(),0);
    console.log(`PASS ${checked} question configurations: prompts, pockets, values, scroll, loading, motion and resize`);
  } finally {await browser?.close();await rm(output,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
