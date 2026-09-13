const PORT=9222
const list=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
console.log(JSON.stringify(list.map(t=>({url:t.url,type:t.type})),null,1))
const main=list.find(t=>t.type==='page'&&!t.url.includes('#mini'))
const ws=new WebSocket(main.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0;const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const ev=x=>new Promise(res=>{const i=++id;pend.set(i,m=>res(m.result?.result?.value));ws.send(JSON.stringify({id:i,method:'Runtime.evaluate',params:{expression:x,awaitPromise:true,returnByValue:true}}))})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
console.log('visibility=' + await ev(`JSON.stringify({hidden:document.hidden,vis:document.visibilityState,chats:document.querySelectorAll('.chat').length,cls:document.querySelector('.chat')?.className})`))
await ev(`window.__nebula.chat.getState().setCollapsed(false)`)
console.log('after set, storeCollapsed=' + await ev(`String(window.__nebula.chat.getState().collapsed)`))
for (const ms of [300,1200,2500,4000]) {
  await sleep(ms===300?300:ms-(ms===1200?300:ms===2500?1200:2500))
  console.log(`t+${ms}ms cls=` + await ev(`document.querySelector('.chat')?.className ?? 'null'`))
}
console.log('empty=' + await ev(`JSON.stringify({emptyText:document.querySelector('.chat-empty')?.innerText?.slice(0,160)??null,suggestions:Array.from(document.querySelectorAll('.chat-empty .chip-badge')).map(b=>b.innerText.trim())})`))
ws.close()
