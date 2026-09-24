const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('outputs/musickit-probe/Resources/chat-adapter.js','utf8');
function fixture(options={}) {
 let clicks=0,frames=[],users=[],replies=[],pastes=0;
 class Element {
  constructor(){this.attrs={};this.dataset={};this.childNodes=[];this.nodeType=1;this.tagName='DIV';this.textContent='';this.innerText='';}
  getAttribute(k){return this.attrs[k]??null}getClientRects(){return[1]}closest(){return null}focus(){}
  dispatchEvent(event){if(event.type==='paste'){pastes++;fill(editor,event.clipboardData.text);}}
 }
 class Textarea extends Element {constructor(){super();this._value=''}get value(){return this._value}set value(v){this._value=v}}
 let editor=options.rich?new Element():new Textarea();
 function fill(e,text){e.innerText=options.flat?text.replace(/\n/g,''):text;e.childNodes=text.split('\n').map(line=>({nodeType:1,tagName:'P',childNodes:[{nodeType:3,nodeValue:line}]}));}
 const send=new Element();send.dataset.testid='send-button';send.click=()=>{clicks++;if(editor instanceof Textarea)editor.value='';else fill(editor,'')};
 const doc={querySelectorAll(q){if(q==='button')return[send];if(q==='iframe')return frames;if(q.includes('data-message-author-role="user"'))return users;if(q.includes('data-message-author-role="assistant"'))return replies;if(q.includes('prompt-textarea'))return[editor];return[]},createRange:()=>({selectNodeContents(){}}),execCommand(_a,_b,text){
  if(options.emptyInsert)return false;
  if(options.replaceNode)setTimeout(()=>{editor=new Element();fill(editor,text)},150);
  else fill(editor,options.partial?text.slice(0,4):text);
  return true;
 }};
 class Transfer{setData(_t,text){this.text=text}}
 class Event{constructor(type,opts={}){this.type=type;Object.assign(this,opts)}}
 const context={window:{getSelection:()=>({removeAllRanges(){},addRange(){}})},document:doc,HTMLTextAreaElement:Textarea,Event,ClipboardEvent:Event,DataTransfer:Transfer,setTimeout,getComputedStyle:()=>({visibility:'visible'}),location:{href:'https://chatgpt.com/',hostname:'chatgpt.com'},URL};
 vm.runInNewContext(source,context);
 return{a:context.window.__dailyMusicDOMAdapter,get editor(){return editor},send,clicks:()=>clicks,pastes:()=>pastes,frames,users,replies,Textarea,fill};
}
(async()=>{
let f=fixture();f.editor.value='user draft';assert.equal((await f.a.prepare('new','marker')).state,'draft-exists');assert.equal(f.editor.value,'user draft');assert.equal(f.clicks(),0);
f=fixture();assert.equal((await f.a.prepare('request marker','marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');assert.equal(f.a.submit().state,'already-submitted');assert.equal(f.clicks(),1);
f=fixture();await f.a.prepare('new','marker');f.editor.value='changed';assert.equal(f.a.submit().state,'draft-changed');assert.equal(f.clicks(),0);
f=fixture();await f.a.prepare('new','marker');f.send.disabled=true;assert.equal(f.a.submit().state,'send-unavailable');assert.equal(f.clicks(),0);
f=fixture();const frame=new f.Textarea();frame.title='Apple Music';frame.src='https://music.apple.com/';f.frames.push(frame);await f.a.prepare('new','marker');assert.equal(f.a.result().cards,0);
f=fixture();await f.a.prepare('new','marker');const other=new f.Textarea();other.title='Other';other.src='https://example.com';f.frames.push(other);assert.equal(f.a.result().cards,0);f.users.push({textContent:'request marker'});assert.equal(f.a.result().acknowledged,true);
const multiline='请推荐歌曲\n<library_sample_json>\n[{"title":"爱 错","artist":"王力宏"}]\n</library_sample_json>\nmarker';
f=fixture({rich:true,flat:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,replaceNode:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,partial:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'fill-unconfirmed');assert.equal(f.pastes(),0);assert.equal(f.a.submit().state,'not-prepared');assert.equal(f.clicks(),0);assert.equal(f.a.diagnostics().fillDiagnostic.expectedLength>0,true);
f=fixture({rich:true,emptyInsert:true});assert.equal((await f.a.prepare(multiline,'marker')).state,'prepared');assert.equal(f.pastes(),1);assert.equal(f.a.submit().state,'clicked');
f=fixture({rich:true,flat:true});await f.a.prepare(multiline,'marker');f.fill(f.editor,multiline.replace('爱 错','爱错'));assert.equal(f.a.submit().state,'draft-changed');assert.equal(f.clicks(),0);
console.log('PASS: rich-text paragraphs, delayed node replacement, empty insertion paste fallback, partial insertion refusal, significant text-change refusal, draft protection, one-send limit, disabled send and old-frame exclusion. Mock DOM only.');
})().catch(e=>{console.error(e);process.exitCode=1});
