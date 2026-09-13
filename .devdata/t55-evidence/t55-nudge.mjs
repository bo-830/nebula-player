const PORT=9222
const list=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const main=list.find(t=>t.type==='page'&&!t.url.includes('#mini'))
const ws=new WebSocket(main.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0;const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const raw=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,m=>res(m));ws.send(JSON.stringify({id:i,method,params}))})
const ev=async x=>(await raw('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true,userGesture:true})).result?.result?.value
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
await raw('Emulation.setFocusEmulationEnabled',{enabled:true})
console.log('hidden='+await ev(`String(document.hidden)`))
await ev(`window.__nebula.chat.getState().setCollapsed(false)`)
for (const t of [500,1500,3000,6000]) { await sleep(t===500?500:1000); console.log(`t+${t}: cls=`+await ev(`document.querySelector('.chat')?.className ?? 'null'`)) }
console.log('empty='+await ev(`JSON.stringify({empty:!!document.querySelector('.chat-empty'),sug:Array.from(document.querySelectorAll('.chat-empty .chip-badge')).map(b=>b.innerText.trim())})`))
ws.close()
