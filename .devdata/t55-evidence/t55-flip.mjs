const PORT=9222
const list=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const main=list.find(t=>t.type==='page'&&!t.url.includes('#mini'))
const ws=new WebSocket(main.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0;const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const ev=async x=>{const i=++id;const p=new Promise(res=>pend.set(i,m=>res(m.result?.result?.value)));ws.send(JSON.stringify({id:i,method:'Runtime.evaluate',params:{expression:x,awaitPromise:true,returnByValue:true,userGesture:true}}));return p}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const snap=async(label)=>{
  const s=await ev(`JSON.stringify({hidden:document.hidden,vis:document.visibilityState,cls:document.querySelector('.chat')?.className ?? null,storeCollapsed:window.__nebula.chat.getState().collapsed})`)
  console.log(label+': '+s)
}
await snap('T0 (mini window is currently SHOWN, main untouched)')
await ev(`(async()=>{await window.api.miniToggle();return 1})()`)
await sleep(2500)
await snap('T1 after miniToggle (mini HIDDEN)')
await ev(`(async()=>{await window.api.miniToggle();return 1})()`)
await sleep(2500)
await snap('T2 after miniToggle again (mini SHOWN)')
ws.close()
