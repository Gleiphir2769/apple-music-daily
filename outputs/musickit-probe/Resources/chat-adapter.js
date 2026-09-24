// DOM-only adapter. No cookies, tokens, network interception, or application-private state.
(() => {
  const key = '__dailyMusicDOMAdapter';
  if (window[key]?.version === 2) return;
  window[key]?.restore?.();
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden="true"]');
  const label = e => (e.getAttribute('aria-label') || e.textContent || '').trim();
  const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
  const running = () => [...document.querySelectorAll('button')].some(e => visible(e) && (e.dataset.testid === 'stop-button' || /^(Stop streaming|Stop generating|停止生成|停止流式传输|停止回复)$/i.test(label(e))));
  const editors = () => [...document.querySelectorAll('#prompt-textarea[contenteditable="true"],textarea#prompt-textarea,[contenteditable="true"][role="textbox"],textarea[placeholder]')].filter(visible);
  // innerText can lag or flatten paragraphs while WebKit updates a rich-text editor.
  const domText = node => {
    if(node.nodeType === 3) return node.nodeValue || '';
    if(node.nodeType !== 1) return '';
    if(node.tagName === 'BR') return '\n';
    const text=[...node.childNodes].map(domText).join('');
    return /^(P|DIV|LI|PRE|BLOCKQUOTE|H[1-6])$/.test(node.tagName) ? '\n'+text+'\n' : text;
  };
  const editorTexts = e => e instanceof HTMLTextAreaElement ? [e.value] : [e.innerText || '', domText(e)];
  const hasDraft = e => editorTexts(e).some(t=>normalize(t).length>0);
  const matchesRequest = (e,text) => editorTexts(e).some(t=>normalize(t)===normalize(text));
  const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
  let fillDiagnostic = null;
  const checkFill = async text => {
    let stable=0;
    for(let i=0;i<20;i++) {
      await delay(100);
      // React/ProseMirror may have replaced the node during the input event.
      const current=editors();
      if(current.length===1 && matchesRequest(current[0],text)) {
        if(++stable>=2) return true;
      } else stable=0;
    }
    const current=editors(), expected=normalize(text);
    fillDiagnostic={expectedLength:expected.length,editorCount:current.length,observed:current.flatMap(editorTexts).map(t=>{
      const actual=normalize(t);let i=0;while(i<Math.min(actual.length,expected.length)&&actual[i]===expected[i])i++;
      return {length:actual.length,firstDifference:i};
    })};
    return false;
  };
  let oldFrames = new Set(), oldReplies = new Set(), opened = false, submitted = false, prepared = false, request = '', marker = '', saved = [], focused = null;
  const restore = () => { for (const [e, style] of saved) { if (style === null) e.removeAttribute('style'); else e.setAttribute('style', style); } saved=[]; focused=null; };
  const remember = e => { if (!saved.some(([x]) => x === e)) saved.push([e,e.getAttribute('style')]); };
  const status = () => {
    const e = editors();
    return {editorCount:e.length, draft:e.some(x=>hasDraft(x)), generating:running(), submitted};
  };
  const candidates = () => [...document.querySelectorAll('iframe')].filter(f => {
    if (!visible(f) || oldFrames.has(f)) return false;
    const identity = `${f.title || ''} ${f.getAttribute('aria-label') || ''}`;
    let host=''; try { host=new URL(f.src,location.href).hostname; } catch {}
    if (/apple\s*music/i.test(identity) || host === 'music.apple.com') return true;
    // Only a bounded panel with an explicit Apple Music heading qualifies.
    let panel=f.parentElement;
    for(let i=0; panel && i<5; i++,panel=panel.parentElement) {
      if (panel === document.body || panel.matches('main')) break;
      if (panel.querySelectorAll('iframe').length !== 1) continue;
      const heading=[...panel.querySelectorAll('h1,h2,h3,[role="heading"],span,div')].some(h=>(h.matches('h1,h2,h3,[role="heading"]') || h.children.length===0) && label(h)==='Apple Music');
      if(heading) return true;
    }
    return false;
  });
  window[key] = {
    version: 2,
    status,
    diagnostics() {
      return {adapterVersion:2,fillDiagnostic,pageHost:location.hostname, ...status(), result:this.result(), frames:[...document.querySelectorAll('iframe')].map(f=>{
        let host='';try{host=new URL(f.src,location.href).hostname}catch{}
        return {title:f.title || '',host,visible:visible(f),prior:oldFrames.has(f)};
      })};
    },
    async prepare(text, requestMarker) {
      restore();
      if (running()) return {state:'generating'};
      const e=editors();
      if(e.length!==1) return {state:'need-page',editorCount:e.length};
      if(hasDraft(e[0])) return {state:'draft-exists'};
      oldFrames=new Set(document.querySelectorAll('iframe')); oldReplies=new Set(document.querySelectorAll('[data-message-author-role="assistant"]')); opened=false; submitted=false; prepared=false;
      request=text; marker=requestMarker; fillDiagnostic=null;
      e[0].focus();
      if(e[0] instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e[0],text);
        e[0].dispatchEvent(new Event('input',{bubbles:true}));
      } else {
        const selection=window.getSelection(), range=document.createRange();
        range.selectNodeContents(e[0]); selection.removeAllRanges(); selection.addRange(range);
        document.execCommand('insertText',false,text);
      }
      if(!await checkFill(text)) {
        // Retry only if nothing was inserted. Never overwrite partial input or a user edit.
        const current=editors();
        if(current.length===1 && !hasDraft(current[0]) && !(current[0] instanceof HTMLTextAreaElement)) {
          const data=new DataTransfer();data.setData('text/plain',text);
          current[0].focus();current[0].dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
          if(!await checkFill(text)) return {state:'fill-unconfirmed'};
        } else return {state:'fill-unconfirmed'};
      }
      fillDiagnostic=null;
      prepared=true;
      return {state:'prepared'};
    },
    submit() {
      if(submitted) return {state:'already-submitted'};
      if(!prepared) return {state:'not-prepared'};
      const e=editors();
      if(e.length!==1 || !matchesRequest(e[0],request)) return {state:'draft-changed'};
      const buttons=[...document.querySelectorAll('button')].filter(b=>visible(b) && !b.disabled && b.getAttribute('aria-disabled')!=='true' &&
        (b.dataset.testid==='send-button' || /^(Send prompt|Send message|发送提示|发送消息|发送)$/i.test(label(b))));
      if(buttons.length!==1) return {state:'send-unavailable',count:buttons.length};
      submitted=true; // At most one click, even if the host later reports an error.
      buttons[0].click();
      return {state:'clicked'};
    },
    result() {
      const acknowledged=[...document.querySelectorAll('[data-message-author-role="user"]')].some(e=>e.textContent.includes(marker));
      const frames=candidates();
      return {acknowledged, generating:running(),cards:frames.length, submitted};
    },
    openCard() {
      if(opened || !submitted || running()) return {state:'not-ready'};
      const replies=[...document.querySelectorAll('[data-message-author-role="assistant"]')].filter(e=>!oldReplies.has(e));
      const buttons=replies.flatMap(r=>[...r.querySelectorAll('button')]).filter(b=>visible(b) && !b.disabled && /^(Apple Music|Open Apple Music|打开 Apple Music|展开 Apple Music)$/i.test(label(b)));
      if(buttons.length!==1) return {state:'no-unique-opener'};
      opened=true; buttons[0].click(); return {state:'opened'};
    },
    focusCard() {
      if(running()) return {state:'generating'};
      const frames=candidates();
      if(frames.length!==1) return {state:'card-not-unique',count:frames.length};
      restore();
      const frame=frames[0];
      // Keep the live iframe, its origin and host bridge intact; change only layout.
      let branch=frame;
      while(branch && branch!==document.body) {
        remember(branch);
        branch.style.setProperty('display','block','important');
        branch.style.setProperty('position','static','important');
        branch.style.setProperty('width','100%','important');
        branch.style.setProperty('height','100%','important');
        branch.style.setProperty('max-width','none','important');
        branch.style.setProperty('min-width','0','important');
        branch.style.setProperty('margin','0','important');
        branch.style.setProperty('padding','0','important');
        branch.style.setProperty('transform','none','important');
        if(branch.parentElement) for(const sibling of branch.parentElement.children) if(sibling!==branch) {remember(sibling);sibling.style.setProperty('display','none','important');}
        branch=branch.parentElement;
      }
      for(const root of [document.documentElement,document.body]) {remember(root);root.style.setProperty('height','100%','important');root.style.setProperty('overflow','hidden','important');root.style.setProperty('margin','0','important');}
      focused=frame;
      return {state:'card-focused'};
    },
    restore() {restore(); return {state:'restored'};}
  };
})();
