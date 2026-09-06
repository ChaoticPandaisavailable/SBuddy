import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},resolve:{alias:{'@':process.cwd()}}});
const originalFetch=globalThis.fetch;
const saved={provider:process.env.AI_PROVIDER,key:process.env.OPENAI_API_KEY};
let count=0;
const check=async(name,fn)=>{await fn();console.log('PASS '+name);count++;};
try{
 const state=await server.ssrLoadModule('/lib/sbuddy-state.ts');
 const api=await server.ssrLoadModule('/app/api/ai/avatar/route.ts');
 const {portraitBounds}=await server.ssrLoadModule('/lib/portrait-image.ts');
 const {portraitGenerationPrompt}=await server.ssrLoadModule('/lib/avatar-generation.ts');
 await check('V4 static portraits retain their asset reference on reload and backup',()=>{
  const d=state.createAppData();d.buddies[0].appearance={preset:'female',rigVersion:4,atlasKey:'static-photo',photoMode:'head-only'};
  const restored=state.validateAppData(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(restored.buddies[0].appearance,d.buddies[0].appearance);
  assert.equal(restored.buddies[1].appearance.rigVersion,3);
  delete d.buddies[0].appearance.atlasKey;
  assert.throws(()=>state.validateAppData(d),/引用缺失/);
 });
 await check('Applying a late portrait to its owner never changes the selected companion',()=>{
  const d=state.createAppData(),owner=d.buddies[0].id;
  d.activeBuddyId=d.buddies[1].id;
  const next=state.updateBuddy(d,owner,b=>({...b,appearance:{preset:'female',rigVersion:4,atlasKey:'portrait'}}));
  assert.equal(next.activeBuddyId,d.buddies[1].id);
  assert.equal(next.buddies[0].appearance.rigVersion,4);
  assert.deepEqual(next.buddies[1],d.buddies[1]);
 });
 await check('Portrait bounds accept one silhouette without imposing 48-frame rules',()=>{
  const p=new Uint8Array(16*16*4);
  for(let y=2;y<14;y++)for(let x=5;x<11;x++)p.set([255,255,255,255],(y*16+x)*4);
  assert.deepEqual(portraitBounds(p,16,16),{left:5,top:2,width:6,height:12});
  assert.throws(()=>portraitBounds(new Uint8Array(16*16*4),16,16),/没有可显示/);
  assert.throws(()=>portraitBounds(new Uint8Array(16*16*4).fill(255),16,16),/背景/);
 });
 process.env.AI_PROVIDER='openai';process.env.OPENAI_API_KEY='test-only-key';
 await check('Static mode generates only one image and never requests sprite semantics or pose sheets',async()=>{
  let generated=0,analyzed=0;
  globalThis.fetch=async(url,options)=>{
   assert.equal(typeof url,'string');
   if(url.endsWith('/responses')){
    analyzed++;
    assert.equal(JSON.parse(options.body).text.format.name,'study_buddy_person_detection');
    return Response.json({output_text:JSON.stringify({personCount:1,usable:true,framing:'head-only',appearance:'短发',reason:''})});
   }
   assert.ok(url.endsWith('/images/edits'));generated++;
   assert.equal(options.body.getAll('image[]').length,1);
   assert.match(options.body.get('prompt'),/Only ONE front-facing/);
   return Response.json({data:[{b64_json:'fixture'}]});
  };
  const form=new FormData();form.set('mode','portrait');form.set('image',new File(['photo'],'photo.png',{type:'image/png'}));
  const response=await api.POST(new Request('https://local/api/ai/avatar',{method:'POST',body:form}));
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.rigVersion,4);assert.equal(body.displayMode,'static');assert.equal(body.spriteManifest,undefined);
  assert.equal(generated,1);assert.equal(analyzed,1);
 });
 await check('Static mode still rejects group photos before incurring image generation',async()=>{
  globalThis.fetch=async(url)=>{
   assert.ok(url.endsWith('/responses'));
   return Response.json({output_text:JSON.stringify({personCount:2,usable:false,framing:'full-body',appearance:'两人',reason:'多人'})});
  };
  const form=new FormData();form.set('mode','portrait');form.set('image',new File(['photo'],'photo.png',{type:'image/png'}));
  const response=await api.POST(new Request('https://local/api/ai/avatar',{method:'POST',body:form}));
  assert.equal(response.status,422);assert.equal((await response.json()).code,'person_not_detected');
 });
 await check('Static prompt reconstructs missing body honestly without requesting an animation sheet',()=>{
  const prompt=portraitGenerationPrompt({personCount:1,usable:true,framing:'head-only',appearance:'蓝色眼镜',reason:''},'male');
  assert.match(prompt,/蓝色眼镜/);assert.match(prompt,/unseen body/);assert.doesNotMatch(prompt,/48 frames|six columns/);
 });
 console.log(count+' static portrait checks passed.');
}finally{
 globalThis.fetch=originalFetch;
 if(saved.provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=saved.provider;
 if(saved.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved.key;
 await server.close();
}
