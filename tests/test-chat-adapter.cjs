const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('src/Resources/chat-adapter.js','utf8');
function fixture(options={}) {
 let clicks=0,frames=[],users=[],replies=[],pastes=0,inserts=0, observer;
 class MutationObserver {constructor(callback){this.callback=callback;observer=this}observe(){this.active=true}disconnect(){this.active=false}}
 class Element {
  constructor(){this.attrs={};this.dataset={};this.childNodes=[];this.nodeType=1;this.tagName='DIV';this.textContent='';this.innerText='';}
  contains(e){return e===this || this.childNodes.some(c=>c===e || c.contains?.(e))}
  getAttribute(k){return this.attrs[k]??null}getClientRects(){return[1]}closest(){return null}focus(){}
  dispatchEvent(event){if(event.type==='paste'){pastes++;if(options.paste || options.emptyInsert)fill(editor,options.partialPaste?event.clipboardData.text.slice(0,4):event.clipboardData.text);}}
 }
 class Textarea extends Element {constructor(){super();this._value=''}get value(){return this._value}set value(v){this._value=v}}
 let editor=options.rich?new Element():new Textarea();
 function fill(e,text){e.innerText=options.flat?text.replace(/\n/g,''):text;e.childNodes=text.split('\n').map(line=>({nodeType:1,tagName:'P',childNodes:[{nodeType:3,nodeValue:line}]}));}
 const send=new Element();send.dataset.testid='send-button';send.click=()=>{clicks++;if(editor instanceof Textarea)editor.value='';else fill(editor,'')};
 const doc={querySelectorAll(q){if(q==='button')return[send];if(q==='iframe')return frames;if(q.includes('data-message-author-role="user"'))return users;if(q.includes('data-message-author-role="assistant"'))return replies;if(q.includes('prompt-textarea'))return[editor];return[]},createRange:()=>({selectNodeContents(){}}),execCommand(_a,_b,text){
  inserts++;
  if(options.smartQuotes)text=text.replace(/"(?=\}\]\n)/,'”');
  if(options.emptyInsert)return false;
  if(options.replaceNode)setTimeout(()=>{editor=new Element();fill(editor,text)},150);
  else fill(editor,options.partial?text.slice(0,4):text);
  return true;
 }};
 class Transfer{setData(_t,text){this.text=text}}
 class Event{constructor(type,opts={}){this.type=type;Object.assign(this,opts)}}
 const context={MutationObserver,window:{getSelection:()=>({removeAllRanges(){},addRange(){}})},document:doc,HTMLTextAreaElement:Textarea,Event,ClipboardEvent:Event,DataTransfer:Transfer,setTimeout,getComputedStyle:()=>({visibility:'visible'}),location:{href:'https://chatgpt.com/',hostname:'chatgpt.com'},URL};
 vm.runInNewContext(source,context);
 return{get observer(){return observer},doc,Element,a:context.window.__dailyMusicDOMAdapter,get editor(){return editor},send,clicks:()=>clicks,pastes:()=>pastes,inserts:()=>inserts,location:context.location,frames,users,replies,Textarea,fill};
}
(async()=>{
let f=fixture();assert.equal(f.a.configureMedium,undefined);f.editor.value='user draft';assert.equal((await f.a.prepare('new','marker')).state,'draft-exists');assert.equal(f.editor.value,'user draft');assert.equal(f.clicks(),0);
f=fixture();assert.equal((await f.a.prepare('request marker','marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');assert.equal(f.a.submit().state,'already-submitted');assert.equal(f.clicks(),1);
f=fixture();await f.a.prepare('new','marker');f.editor.value='changed';assert.equal(f.a.submit().state,'draft-changed');assert.equal(f.clicks(),0);
f=fixture();await f.a.prepare('new','marker');f.send.disabled=true;assert.equal(f.a.submit().state,'send-unavailable');assert.equal(f.clicks(),0);
f=fixture();const frame=new f.Textarea();frame.title='Apple Music';frame.src='https://music.apple.com/';f.frames.push(frame);await f.a.prepare('new','marker');assert.equal(f.a.result().cards,0);
f=fixture();await f.a.prepare('new','marker');const other=new f.Textarea();other.title='Other';other.src='https://example.com';f.frames.push(other);assert.equal(f.a.result().cards,0);f.a.submit();f.users.push({textContent:'request marker'});assert.equal(f.a.result().acknowledged,true);
const multiline='请推荐歌曲\n<library_sample_json>\n[{"title":"爱 错","artist":"王力宏"}]\n</library_sample_json>\nmarker';
f=fixture({rich:true,flat:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,replaceNode:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,partial:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'fill-unconfirmed');assert.equal(f.pastes(),1);assert.equal(f.a.submit().state,'not-prepared');assert.equal(f.clicks(),0);assert.equal(f.a.diagnostics().fillDiagnostic.expectedLength>0,true);
f=fixture({rich:true,emptyInsert:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.pastes(),1);assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,flat:true});await f.a.prepare(multiline,'marker');f.fill(f.editor,multiline.replace('爱 错','爱错'));assert.equal(f.a.submit().state,'draft-changed');assert.equal(f.clicks(),0);
// Literal paste avoids simulated typing substitutions without relaxing equality.
f=fixture({rich:true,paste:true,smartQuotes:true});
assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.inserts(),0);assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,paste:true,partialPaste:true});
assert.equal((await f.a.prepare(multiline,'marker')).state,'fill-unconfirmed');assert.equal(f.inserts(),0);assert.equal(f.clicks(),0);
// If paste is unavailable, a changed closing quote must still block sending.
f=fixture({rich:true,smartQuotes:true});
assert.equal((await f.a.prepare(multiline,'marker')).state,'fill-unconfirmed');
assert.equal(f.a.diagnostics().fillDiagnostic.observed[0].expectedCodePoint,34);
assert.equal(f.a.diagnostics().fillDiagnostic.observed[0].actualCodePoint,8221);
assert.equal(f.a.submit().state,'not-prepared');assert.equal(f.clicks(),0);
// An explicit retry may replace our own confirmed, unmodified, unsent draft.
for(const rich of [false,true]) {
 f=fixture({rich});
 await f.a.prepare('old generated request','old');
 f.send.disabled=true;assert.equal(f.a.submit().state,'send-unavailable');
 assert.equal((await f.a.prepare('new generated request','new')).state,'prepared');
 f.send.disabled=false;assert.equal(f.a.submit().state,'clicked');assert.equal(f.clicks(),1);
}
// User edits, even whitespace-only changes, must not be replaced on retry.
f=fixture();await f.a.prepare('old request','old');f.editor.value+=' ';
assert.equal((await f.a.prepare('new request','new')).state,'draft-exists');assert.equal(f.editor.value,'old request ');
// A click with an unknown outcome must never allow the leftover text to be resent.
f=fixture();await f.a.prepare('old request','old');f.send.click=()=>{};
assert.equal(f.a.submit().state,'clicked');assert.equal((await f.a.prepare('new request','new')).state,'draft-exists');
// Do not claim a restored draft on another conversation as our own.
f=fixture();await f.a.prepare('old request','old');f.location.href='https://chatgpt.com/c/other';
assert.equal((await f.a.prepare('new request','new')).state,'draft-exists');
// Partially inserted requests remain unconfirmed and protected.
f=fixture({rich:true,partial:true});await f.a.prepare(multiline,'old');
assert.equal((await f.a.prepare('new request','new')).state,'draft-exists');
// Collapsed messages no longer require a marker at the end of the long prompt.
f=fixture();const longRequest='根据我的音乐资料库推荐歌曲。'.repeat(12)+'marker';
await f.a.prepare(longRequest,'marker');f.a.submit();f.users.push({textContent:longRequest.slice(0,120)+'… 显示更多'});
assert.equal(f.a.result().acknowledged,true);assert.equal(f.a.result().receiptEvidence,'new-user-prefix');
// Missing/virtualized user-message DOM: emptied composer plus new card confirms receipt.
f=fixture();await f.a.prepare('request marker','marker');f.a.submit();
const musicFrame=new f.Element();musicFrame.title='Apple Music';musicFrame.src='https://music.apple.com/';
f.frames.push(musicFrame);assert.equal(f.a.result().acknowledged,true);assert.equal(f.a.result().receiptEvidence,'composer-consumed-and-new-result');
// Empty composer alone is never a receipt. Unsent requests cannot be acknowledged.
f=fixture();await f.a.prepare('request marker','marker');f.editor.value='';assert.equal(f.a.result().acknowledged,false);
f=fixture();await f.a.prepare('request marker','marker');f.a.submit();assert.equal(f.a.result().acknowledged,false);
// Duplicate inline and sidebar cards: focus the larger card, and restore its styles.
f=fixture();await f.a.prepare('request marker','marker');f.a.submit();
function styled(e){e.style={values:{},setProperty(k,v){this.values[k]=v}};e.removeAttribute=k=>{delete e.attrs[k];if(k==='style')e.style.values={}};e.setAttribute=(k,v)=>e.attrs[k]=v;return e}
f.doc.body=styled(new f.Element());f.doc.documentElement=styled(new f.Element());
const small=styled(new f.Element()),large=styled(new f.Element());
for(const e of [small,large]){e.title='Apple Music';e.src='https://music.apple.com/';e.parentElement=f.doc.body;}
small.getBoundingClientRect=()=>({width:300,height:200,left:0});large.getBoundingClientRect=()=>({width:900,height:700,left:500});
f.doc.body.children=[small,large];f.frames.push(small,large);
assert.equal(f.a.result().cards,2);assert.equal(f.a.focusCard().state,'card-focused');
assert.equal(large.style.values['container-type'],'normal');
assert.equal(large.style.values.overflow,'visible');
f.doc.documentElement.clientWidth=900;f.doc.documentElement.clientHeight=700;
large.getBoundingClientRect=()=>({left:0,top:0,right:900,bottom:700,width:900,height:700});
f.doc.elementFromPoint=()=>large;
assert.equal(f.a.cardVisibility().state,'card-visible');
f.doc.elementFromPoint=()=>small;
assert.equal(f.a.cardVisibility().state,'card-not-visible');
assert.equal(large.style.values.position,'fixed');assert.equal(large.style.values.height,'100vh');assert.equal(small.style.values.visibility,'hidden');
const late=styled(new f.Element());late.parentElement=f.doc.body;f.doc.body.children.push(late);
f.observer.callback();assert.equal(late.style.values.visibility,'hidden');assert.equal(late.style.values.display,undefined);
f.a.restore();assert.equal(f.observer.active,false);assert.equal(late.style.values.visibility,undefined);assert.equal(large.style.values.position,undefined);assert.equal(small.style.values.visibility,undefined);
// The native Apple Music toolbar lives outside the portaled iframe ancestry.
let expanded=0;
const expandButton={disabled:false,textContent:'全屏显示',getAttribute:()=>null,getClientRects:()=>[1],closest:()=>null};
expandButton.click=()=>expanded++;
const paneParent={parentElement:f.doc.body,querySelectorAll:()=>[expandButton]};
const beforePaneQuery=f.doc.querySelectorAll;
f.doc.querySelectorAll=q=>q==='[role="tabpanel"][aria-label="Apple Music"]' ? [{parentElement:paneParent}] : beforePaneQuery(q);
assert.equal(f.a.focusCard().state,'expanding');assert.equal(expanded,1);
f.doc.querySelectorAll=beforePaneQuery;
// A running response is never focused, even when a card already exists.
f.send.dataset.testid='stop-button';assert.equal(f.a.focusCard().state,'generating');
// Structured output must belong to this submitted request and a new assistant reply.
f=fixture();
const payload={schemaVersion:1,requestId:'marker',tracks:Array.from({length:10},(_,i)=>({position:i+1,title:'Song '+i,artist:'Artist',album:null,reason:'A specific reason'}))};
const reply=()=>({textContent:'',querySelectorAll:()=>[{textContent:JSON.stringify(payload)}]});
f.replies.push(reply());
await f.a.prepare('request marker','marker');
assert.equal(f.a.recommendations().state,'not-ready');f.a.submit();
f.users.push({textContent:'request marker'});
assert.equal(f.a.recommendations().state,'missing-or-invalid');
f.replies.push(reply());
assert.equal(f.a.recommendations().tracks.length,10);
payload.requestId='old-request';assert.equal(f.a.recommendations().state,'missing-or-invalid');payload.requestId='marker';
payload.tracks[9].position=1;assert.equal(f.a.recommendations().state,'missing-or-invalid');payload.tracks[9].position=10;
payload.tracks[9].reason='';assert.equal(f.a.recommendations().state,'missing-or-invalid');payload.tracks[9].reason='Reason';
f.send.dataset.testid='stop-button';assert.equal(f.a.recommendations().state,'not-ready');
f.send.dataset.testid='send-button';payload.tracks.pop();assert.equal(f.a.recommendations().state,'missing-or-invalid');
// Modern code blocks need not contain pre/code; surrounding prose is ignored.
payload.tracks.push({position:10,title:'Last',artist:'Artist',album:null,reason:'Braces {inside} and a "quote" are valid.'});
f.replies.length=0;
f.replies.push({textContent:'说明文字\nJSON\n'+JSON.stringify(payload)+'\n后续文字',querySelectorAll:()=>[]});
assert.equal(f.a.recommendations().tracks.length,10);
// Rendered line boundaries may exist only in innerText.
f.replies[0]={textContent:'JSON copied code',innerText:JSON.stringify(payload,null,2),querySelectorAll:()=>[]};
assert.equal(f.a.recommendations().tracks[9].position,10);
payload.requestId='每日推荐请求编号：marker';f.replies[0].innerText=JSON.stringify(payload);
assert.equal(f.a.recommendations().state,'complete');
payload.requestId='different';f.replies[0].innerText=JSON.stringify(payload);
assert.equal(f.a.recommendations().reason,'request-id');
f.replies[0].innerText=JSON.stringify(payload).slice(0,-10);
assert.equal(f.a.recommendations().state,'missing-or-invalid');
console.log('PASS: div-based JSON, surrounding prose, rendered line breaks, escaped braces, ID prefix normalization and actionable errors.');
// Regression for the inspected ChatGPT page: no legacy role attributes.
f=fixture();
const originalQuery=f.doc.querySelectorAll;
f.doc.querySelectorAll=q=>{
 if(q.includes('data-message-author-role="assistant"')) return q.includes('data-chatgpt-search-unit-key$=":assistant"') ? f.replies : [];
 if(q.includes('data-message-author-role="user"')) return q.includes('data-chatgpt-search-unit-key$=":user"') ? f.users : [];
 return originalQuery(q);
};
await f.a.prepare('每日推荐请求编号：actual-id\nrequest','每日推荐请求编号：actual-id');f.a.submit();
f.users.push({textContent:'每日推荐请求编号：actual-id\nrequest'});
payload.requestId='actual-id';
const markdown={textContent:JSON.stringify(payload),querySelectorAll:()=>[{textContent:JSON.stringify(payload)}]};
const searchUnit={textContent:JSON.stringify(payload),contains:e=>e===markdown,querySelectorAll:markdown.querySelectorAll};
f.replies.push(searchUnit,markdown);
assert.equal(f.a.result().acknowledged,true);
assert.equal(f.a.recommendations().counts.replies,1);
assert.equal(f.a.recommendations().tracks.length,10);
console.log('PASS: observed search-unit message containers, nested markdown deduplication and UUID-only response ID.');
// Native fullscreen must not rewrite iframe/anchor styles.
f=fixture();
const nativeFrame=styled(new f.Element());nativeFrame.title='Apple Music';nativeFrame.src='https://music.apple.com/';
f.frames.push(nativeFrame);
const exitButton=new f.Element();exitButton.textContent='退出全屏';
const nativeQuery=f.doc.querySelectorAll;
f.doc.querySelectorAll=q=>q==='button'?[exitButton]:q==='[role="tabpanel"][aria-label="Apple Music"]'?[{}]:nativeQuery(q);
assert.equal(f.a.focusCard().mode,'native-fullscreen');
assert.equal(Object.keys(nativeFrame.style.values).length,0);
assert.equal(f.a.cardVisibility().state,'card-visible');
exitButton.textContent='全屏显示';assert.equal(f.a.cardVisibility().state,'card-not-visible');
// Recover only a complete response after the latest explicitly marked user request.
f=fixture();payload.requestId='12345678-1234-1234-1234-123456789abc';
const recovered={textContent:JSON.stringify(payload),querySelectorAll:()=>[]};
f.users.push({textContent:'每日推荐请求编号：'+payload.requestId+'\nrequest',compareDocumentPosition:e=>e===recovered?4:2});
f.replies.push(recovered);assert.equal(f.a.recommendations().tracks.length,10);
f.users.push({textContent:'another unmarked request'});assert.equal(f.a.recommendations().state,'not-ready');
console.log('PASS: native fullscreen preserves DOM layout; read-only recovery is scoped to the latest marked request.');
console.log('PASS: structured recommendation scope, completeness and validation; late duplicate isolation and reversible restore.');
console.log('PASS: safe explicit retry of owned unsent drafts; edited, partial, navigated and already-clicked drafts protected; rich-text paragraphs, delayed node replacement, empty insertion paste fallback, partial insertion refusal, significant text-change refusal, draft protection, one-send limit, disabled send and old-frame exclusion. Mock DOM only.');
})().catch(e=>{console.error(e);process.exitCode=1});
