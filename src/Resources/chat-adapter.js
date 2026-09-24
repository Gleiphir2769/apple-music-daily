// DOM-only adapter. No cookies, tokens, network interception, or application-private state.
(() => {
  const key = '__dailyMusicDOMAdapter';
  if (window[key]?.version === 15) return;
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
  // Only trust text inserted in this page session and never submitted. A matching
  // marker alone is not ownership: restored or user-written drafts stay protected.
  let ownedDraft = null;
  const sameDraft = (e, snapshot) => {
    const current=editorTexts(e);
    return current.length===snapshot.length && current.every((text,i)=>text===snapshot[i]);
  };
  const rememberDraft = e => { ownedDraft={url:location.href,texts:editorTexts(e)}; };
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
      return {length:actual.length,firstDifference:i,
        expectedCodePoint:i<expected.length ? expected.codePointAt(i) : null,
        actualCodePoint:i<actual.length ? actual.codePointAt(i) : null};
    })};
    return false;
  };
  let oldUsers = new Set(), receipt = false, receiptEvidence = '', expansionAttempted = false;
  let oldFrames = new Set(), oldReplies = new Set(), opened = false, submitted = false, prepared = false, request = '', marker = '', saved = [], focused = null, isolationObserver = null, lastCardCheck = null, nativePresentation = false;
  const restore = () => { isolationObserver?.disconnect(); isolationObserver=null; for (const [e, style] of saved) { if (style === null) e.removeAttribute('style'); else e.setAttribute('style', style); } saved=[]; focused=null; nativePresentation=false; };
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
    for(let i=0; panel && i<9; i++,panel=panel.parentElement) {
      if (panel === document.body || panel.matches('main')) break;
      if (panel.querySelectorAll('iframe').length !== 1) continue;
      const heading=[...panel.querySelectorAll('h1,h2,h3,[role="heading"],span,div')].some(h=>(h.matches('h1,h2,h3,[role="heading"]') || h.children.length===0) && label(h)==='Apple Music');
      if(heading) return true;
    }
    return false;
  });
  // Observed ChatGPT DOM: search-unit containers replace the old role
  // attribute. Keep both layouts and discard nested message duplicates.
  const messages = role => {
    const selector = role==='assistant'
      ? '[data-message-author-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"], [data-markdown-text-style="assistant-message"]'
      : '[data-message-author-role="user"], [data-chatgpt-search-unit-key$=":user"]';
    const nodes=[...document.querySelectorAll(selector)];
    return nodes.filter(e=>!nodes.some(parent=>parent!==e && parent.contains?.(e)));
  };
  const currentReply = () => messages('assistant').some(e=>!oldReplies.has(e));
  const receiptState = frames => {
    if(!submitted || !marker) return false;
    const users=messages('user');
    const prefix=normalize(request).slice(0,100);
    if(users.some(e=>e.textContent.includes(marker))) {receipt=true;receiptEvidence='marker';}
    else if(users.some(e=>!oldUsers.has(e) && prefix.length>=60 && normalize(e.textContent).startsWith(prefix))) {receipt=true;receiptEvidence='new-user-prefix';}
    else {
      const e=editors();
      if(e.length===1 && !hasDraft(e[0]) && (currentReply() || frames.length>0)) {
        receipt=true;receiptEvidence='composer-consumed-and-new-result';
      }
    }
    return receipt;
  };
  const panelFor = frame => {
    let panel=frame.parentElement;
    for(let i=0;panel && i<9;i++,panel=panel.parentElement) {
      if(panel===document.body || panel.matches('main')) break;
      if([...panel.querySelectorAll('h1,h2,h3,[role="heading"],span,div')].some(h=>(h.matches('h1,h2,h3,[role="heading"]') || h.children.length===0) && label(h)==='Apple Music')) return panel;
    }
    return null;
  };
  const nativeFullscreen = () => [...document.querySelectorAll('button')].some(b=>visible(b) &&
    /^(退出全屏|Exit full screen|Exit fullscreen)$/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '')) &&
    document.querySelectorAll('[role="tabpanel"][aria-label="Apple Music"]').length===1;
  const chooseFrame = frames => frames.map(frame=>{
    const panel=panelFor(frame), box=frame.getBoundingClientRect?.() || {width:0,height:0,left:0};
    // Prefer the titled side panel over the smaller duplicate in the conversation.
    return {frame,panel,score:(panel?1e12:0)+box.width*box.height, left:box.left};
  }).sort((a,b)=>b.score-a.score || b.left-a.left)[0];
  window[key] = {
    version: 15,
    status,
    diagnostics() {
      const extraction=this.recommendations();
      return {lastCardCheck,extraction:{state:extraction.state,reason:extraction.reason || null,counts:extraction.counts || null},adapterVersion:15,fillDiagnostic,pageHost:location.hostname, ...status(), result:this.result(), frames:[...document.querySelectorAll('iframe')].map(f=>{
        let host='';try{host=new URL(f.src,location.href).hostname}catch{}
        return {title:f.title || '',host,visible:visible(f),prior:oldFrames.has(f)};
      })};
    },
    async prepare(text, requestMarker) {
      prepared=false;
      restore();
      if (running()) return {state:'generating'};
      const e=editors();
      if(e.length!==1) return {state:'need-page',editorCount:e.length};
      const reusable=ownedDraft && !submitted && ownedDraft.url===location.href && sameDraft(e[0],ownedDraft.texts);
      if(hasDraft(e[0]) && !reusable) {
        ownedDraft=null;
        return {state:'draft-exists'};
      }
      const previousDraft=reusable ? {url:location.href,texts:editorTexts(e[0])} : null;
      ownedDraft=null;
      oldUsers=new Set(messages('user')); receipt=false; receiptEvidence=''; expansionAttempted=false;
      oldFrames=new Set(document.querySelectorAll('iframe')); oldReplies=new Set(messages('assistant')); opened=false; submitted=false; prepared=false;
      request=text; marker=requestMarker; fillDiagnostic=null;
      e[0].focus();
      let filled=false;
      if(e[0] instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e[0],text);
        e[0].dispatchEvent(new Event('input',{bubbles:true}));
        filled=await checkFill(text);
      } else {
        const selectContents = editor => {
          editor.focus();
          const selection=window.getSelection(), range=document.createRange();
          range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
        };
        selectContents(e[0]);
        // Let the editor's paste handler insert literal text. Simulated typing via
        // insertText may apply WebKit smart quotes to the final JSON quote.
        try {
          const data=new DataTransfer();data.setData('text/plain',text);
          e[0].dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
        } catch { /* Unsupported synthetic paste: use the empty-editor fallback below. */ }
        filled=await checkFill(text);
        if(!filled) {
          const current=editors();
          // A rejected paste can leave our own unchanged draft in place.
          // Revalidate ownership before replacing it; protect partial/user input.
          const unchanged=current.length===1 && previousDraft && previousDraft.url===location.href && sameDraft(current[0],previousDraft.texts);
          if(current.length===1 && (!hasDraft(current[0]) || unchanged) && !(current[0] instanceof HTMLTextAreaElement)) {
            selectContents(current[0]);
            document.execCommand('insertText',false,text);
            filled=await checkFill(text);
          }
        }
      }
      if(!filled) return {state:'fill-unconfirmed'};
      fillDiagnostic=null;
      rememberDraft(editors()[0]);
      prepared=true;
      return {state:'prepared'};
    },
    submit() {
      if(submitted) return {state:'already-submitted'};
      if(!prepared) return {state:'not-prepared'};
      const e=editors();
      if(e.length!==1 || !matchesRequest(e[0],request)) {
        ownedDraft=null;
        return {state:'draft-changed'};
      }
      const buttons=[...document.querySelectorAll('button')].filter(b=>visible(b) && !b.disabled && b.getAttribute('aria-disabled')!=='true' &&
        (b.dataset.testid==='send-button' || /^(Send prompt|Send message|发送提示|发送消息|发送)$/i.test(label(b))));
      if(buttons.length!==1) return {state:'send-unavailable',count:buttons.length};
      ownedDraft=null;
      submitted=true; // At most one click, even if the host later reports an error.
      buttons[0].click();
      return {state:'clicked'};
    },
    result() {
      const frames=candidates();
      const acknowledged=receiptState(frames);
      return {acknowledged,receiptEvidence,generating:running(),cards:frames.length,submitted,newReply:currentReply()};
    },
    recommendations() {
      if(running()) return {state:'not-ready',reason:'not-ready'};
      let expectedMarker=marker;
      let replies=messages('assistant').filter(e=>!oldReplies.has(e));
      if(!submitted) {
        // Read-only recovery after app/adapter reload. Only the latest user
        // message may anchor a result, and only assistant replies after it.
        const users=messages('user'), user=users[users.length-1];
        const match=user?.textContent.trim().match(/^每日推荐请求编号[：:]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s|$)/i);
        if(!match) return {state:'not-ready',reason:'not-ready'};
        expectedMarker=match[1];
        replies=replies.filter(e=>!!(user.compareDocumentPosition?.(e)&4));
      } else if(!receiptState(candidates())) return {state:'not-ready',reason:'not-ready'};
      const counts={replies:replies.length,texts:0,objects:0};
      let reason='no-json';
      // Code blocks may use divs/spans rather than pre > code. Scan only the
      // new assistant replies, and respect JSON string escapes while finding
      // object boundaries; braces in a recommendation reason are ordinary text.
      function* objects(raw) {
        if(!raw || raw.length>200000) return;
        let start=-1,depth=0,quoted=false,escaped=false;
        for(let i=0;i<raw.length;i++) {
          const c=raw[i];
          if(start<0) {if(c==='{'){start=i;depth=1;} continue;}
          if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
          if(c==='"')quoted=true;
          else if(c==='{')depth++;
          else if(c==='}' && --depth===0){yield raw.slice(start,i+1);start=-1;}
        }
      }
      const requestID=v=>typeof v==='string' ? v.trim().replace(/^每日推荐请求编号[：:]\s*/, '').trim() : '';
      for(const reply of replies.reverse()) {
        const blocks=[...reply.querySelectorAll('pre, code, [class*="code-block"], [class*="codeblock"]'),reply];
        const texts=new Set(blocks.flatMap(block=>[block.textContent || '',block.innerText || '']));
        for(const raw of texts) {
          counts.texts++;
          for(const json of objects(raw)) {
            let data;try {data=JSON.parse(json);} catch {reason='invalid-json';continue;}
            if(!data || !('tracks' in data)) continue;
            counts.objects++;
            if(data.schemaVersion!==1){reason='schema';continue;}
            if(!requestID(data.requestId) || requestID(data.requestId)!==requestID(expectedMarker)){reason='request-id';continue;}
            if(!Array.isArray(data.tracks) || data.tracks.length!==10){reason='count';continue;}
            const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
            if(!data.tracks.every((t,i)=>t && t.position===i+1 && text(t.title,500) && text(t.artist,500) && text(t.reason,3000) &&
              (t.album==null || text(t.album,500)))) {reason='fields';continue;}
            return {state:'complete',counts,tracks:data.tracks.map(t=>({position:t.position,title:t.title,artist:t.artist,album:t.album ?? null,reason:t.reason}))};
          }
        }
      }
      return {state:'missing-or-invalid',reason,counts};
    },
    openCard() {
      if(opened || !submitted || running()) return {state:'not-ready'};
      const replies=messages('assistant').filter(e=>!oldReplies.has(e));
      const buttons=replies.flatMap(r=>[...r.querySelectorAll('button')]).filter(b=>visible(b) && !b.disabled && /^(Apple Music|Open Apple Music|打开 Apple Music|展开 Apple Music)$/i.test(label(b)));
      if(buttons.length!==1) return {state:'no-unique-opener'};
      opened=true; buttons[0].click(); return {state:'opened'};
    },
    focusCard() {
      if(running()) return {state:'generating'};
      const frames=candidates();
      if(!frames.length) return {state:'card-not-found',count:0};
      // Native fullscreen is already a working, interactive card view. Do not
      // restyle its portaled iframe or transcript ancestors after expansion.
      if(nativeFullscreen()) {
        restore(); nativePresentation=true; focused=chooseFrame(frames).frame;
        return {state:'card-focused',mode:'native-fullscreen'};
      }
      const selected=chooseFrame(frames);
      const frame=selected.frame, panel=selected.panel;
      // The real iframe is portaled under body. Its Apple Music tabpanel
      // remains elsewhere in the DOM, so the toolbar is not an ancestor.
      let toolbar=panel;
      if(!toolbar) {
        const panes=[...document.querySelectorAll('[role="tabpanel"][aria-label="Apple Music"]')];
        if(panes.length===1) {
          let ancestor=panes[0].parentElement;
          while(ancestor && ancestor!==document.body) {
            if([...ancestor.querySelectorAll('button')].some(b=>/^(全屏显示|Full screen|Fullscreen|Enter full screen|Expand)$/i.test(label(b)))) {toolbar=ancestor;break;}
            ancestor=ancestor.parentElement;
          }
        }
      }
      if(toolbar) {
        const expand=[...toolbar.querySelectorAll('button')].filter(b=>visible(b) && !b.disabled &&
          /^(Expand|Expand view|Enter full screen|Enter fullscreen|Full screen|Fullscreen|展开|展开视图|全屏|进入全屏|全屏显示|放大)$/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || ''));
        if(expand.length===1 && !expansionAttempted) {
          expansionAttempted=true; expand[0].click(); return {state:'expanding'};
        }
      }
      restore();
      // Preserve the geometry of hidden host placeholders: ChatGPT measures
      // them to position portaled widgets. display:none collapses that anchor.
      // Keep the live iframe, its origin and host bridge intact.
      let branch=frame;
      while(branch && branch!==document.body) {
        remember(branch);
        branch.style.setProperty('display','block','important');
        branch.style.setProperty('position','static','important');
        branch.style.setProperty('width','100%','important');
        branch.style.setProperty('height','100%','important');
        branch.style.setProperty('max-width','none','important');
        branch.style.setProperty('max-height','none','important');
        branch.style.setProperty('min-height','0','important');
        branch.style.setProperty('flex','1 1 auto','important');
        branch.style.setProperty('min-width','0','important');
        branch.style.setProperty('margin','0','important');
        branch.style.setProperty('padding','0','important');
        branch.style.setProperty('transform','none','important');
        // The real transcript has inline-size containers and clipping scroll
        // ancestors. Neutralize their fixed-position containing blocks too.
        for(const [property,value] of Object.entries({
          'container-type':'normal','contain':'none','content-visibility':'visible',
          'overflow':'visible','clip-path':'none','filter':'none','perspective':'none',
          'will-change':'auto','visibility':'visible','opacity':'1'
        })) branch.style.setProperty(property,value,'important');
        if(branch.parentElement) for(const sibling of branch.parentElement.children) if(sibling!==branch) {remember(sibling);sibling.style.setProperty('visibility','hidden','important');}
        branch=branch.parentElement;
      }
      for(const root of [document.documentElement,document.body]) {remember(root);root.style.setProperty('height','100%','important');root.style.setProperty('overflow','hidden','important');root.style.setProperty('margin','0','important');}
      remember(frame);
      frame.style.setProperty('position','fixed','important');
      frame.style.setProperty('inset','0','important');
      frame.style.setProperty('width','100vw','important');
      frame.style.setProperty('height','100vh','important');
      frame.style.setProperty('border','0','important');
      frame.style.setProperty('z-index','2147483647','important');
      frame.style.setProperty('pointer-events','auto','important');
      focused=frame;
      // React can insert a second card after the initial layout pass. Keep
      // isolating the selected live frame, without removing or cloning it.
      const isolate = () => {
        if(frame.isConnected===false) {restore();return;}
        let child=frame;
        while(child && child!==document.body) {
          if(child.parentElement) for(const sibling of child.parentElement.children) {
            if(sibling!==child) {remember(sibling);sibling.style.setProperty('visibility','hidden','important');}
          }
          child=child.parentElement;
        }
        for(const other of document.querySelectorAll('iframe')) {
          if(other!==frame) {remember(other);other.style.setProperty('visibility','hidden','important');}
        }
      };
      isolate();
      if(typeof MutationObserver!=='undefined') {
        isolationObserver=new MutationObserver(isolate);
        isolationObserver.observe(document.body,{childList:true,subtree:true});
      }
      return {state:'card-focused'};
    },
    cardVisibility() {
      if(nativePresentation) {
        const ready=nativeFullscreen() && candidates().length>0;
        return lastCardCheck={state:ready?'card-visible':'card-not-visible',reason:ready?'native-fullscreen':'native-panel-closed',mode:'native-fullscreen'};
      }
      if(!focused || focused.isConnected===false) return lastCardCheck={state:'card-not-visible',reason:'detached'};
      const rect=focused.getBoundingClientRect();
      const width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;
      const x=Math.max(0,rect.left)+Math.max(0,Math.min(width,rect.right)-Math.max(0,rect.left))/2;
      const y=Math.max(0,rect.top)+Math.max(0,Math.min(height,rect.bottom)-Math.max(0,rect.top))/2;
      const hit=document.elementFromPoint(x,y);
      const visible=rect.width>50 && rect.height>50 && rect.right>0 && rect.bottom>0 && rect.left<width && rect.top<height && hit===focused;
      return lastCardCheck={state:visible?'card-visible':'card-not-visible',reason:visible?'ok':'clipped-or-covered',x:rect.left,y:rect.top,width:rect.width,height:rect.height,viewportWidth:width,viewportHeight:height,hitTag:hit?.tagName || null,hitClass:hit?.className || null,hitStyle:hit?.getAttribute('style') || null,hitContainsFrame:!!hit?.contains(focused),hitParentClass:hit?.parentElement?.className || null,framePointerEvents:getComputedStyle(focused).pointerEvents};
    },
    restore() {restore(); return {state:'restored'};}
  };
})();
