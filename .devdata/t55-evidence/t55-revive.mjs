const PORT=9222
const list=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const main=list.find(t=>t.type==='page'&&!t.url.includes('#mini'))
const ws=new WebSocket(main.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0;const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const raw=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,m=>res(m));ws.send(JSON.stringify({id:i,method,params}))})
const ev=async x=>(await raw('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
console.log('before: '+await ev(`JSON.stringify({hidden:document.hidden,cls:document.querySelector('.chat')?.className})`))
console.log('bringToFront: '+JSON.stringify(await raw('Page.bringToFront')))
await sleep(1500)
console.log('after bringToFront: '+await ev(`JSON.stringify({hidden:document.hidden,vis:document.visibilityState,cls:document.querySelector('.chat')?.className,empty:!!document.querySelector('.chat-empty')})`))
console.log('emulation focus: '+JSON.stringify(await raw('Emulation.setFocusEmulationEnabled',{enabled:true})))
await sleep(1500)
console.log('after focus emulation: '+await ev(`JSON.stringify({hidden:document.hidden,cls:document.querySelector('.chat')?.className,empty:!!document.querySelector('.chat-empty')})`))
ws.close()
