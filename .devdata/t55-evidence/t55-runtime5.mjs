/** t55 arm 5: confirm (in a LIVE renderer) whether expanding the mini window via
 *  the preload API from the main window mounts the mini chat/search panes. */
import { writeFileSync } from 'fs'
const PORT=9222
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function targets(){return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()}
const isMini=t=>t.type==='page'&&t.url.includes('#mini')
const isMain=t=>t.type==='page'&&!t.url.includes('#mini')
async function cdp(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pend=new Map()
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
 const ev=x=>new Promise((res,rej)=>{const i=++id;pend.set(i,m=>{if(m.result?.exceptionDetails)return rej(new Error(String(m.result.exceptionDetails.exception?.description)));res(m.result?.result?.value)});ws.send(JSON.stringify({id:i,method:'Runtime.evaluate',params:{expression:x,awaitPromise:true,returnByValue:true,userGesture:true}}))})
 return {ev,close:()=>ws.close()}}
const out={}
const main=await cdp((await targets()).find(isMain).webSocketDebuggerUrl)
out.mainVisibleAtBoot = await main.ev(`String(document.hidden)`)
// show the mini window first (real user path), then expand it from the MAIN window
await main.ev(`(async()=>{await window.api.miniToggle();return 1})()`)
await sleep(2500)
const mini=await cdp((await targets()).find(isMini).webSocketDebuggerUrl)
out.miniVisibleAfterShow = await mini.ev(`String(document.hidden)`)
out.miniBeforeExpand = await mini.ev(`JSON.stringify({attr:document.querySelector('.mini-root')?.getAttribute('data-expanded')??null,hasChat:!!document.querySelector('.mini-chat'),hasSearch:!!document.querySelector('.mini-search-zone')})`)
const size=await main.ev(`(async()=>JSON.stringify(await window.api.miniSetExpanded(true)))()`)
await sleep(2500)
out.appliedSize = JSON.parse(size)
out.miniAfterApiExpand = await mini.ev(`JSON.stringify({hidden:document.hidden,attr:document.querySelector('.mini-root')?.getAttribute('data-expanded')??null,hasChat:!!document.querySelector('.mini-chat'),hasSearch:!!document.querySelector('.mini-search-zone'),bodyText:(document.body.innerText||'').slice(0,120)})`)
// now the mini window's OWN button (the path a user actually has)
const click=await mini.ev(`(()=>{const b=Array.from(document.querySelectorAll('.mini-close')).find(x=>(x.getAttribute('aria-label')||'').includes('展开'));if(!b)return 'missing';b.click();return 'clicked'})()`)
await sleep(2500)
out.ownButtonClick = click
out.miniAfterOwnButton = await mini.ev(`JSON.stringify({hidden:document.hidden,attr:document.querySelector('.mini-root')?.getAttribute('data-expanded')??null,hasChat:!!document.querySelector('.mini-chat'),title:document.querySelector('.mini-chat-head')?.innerText?.trim()??null})`)
writeFileSync('.devdata/t55-evidence/t55-runtime5.json',JSON.stringify(out,null,2),'utf8')
console.log(JSON.stringify(out,null,2))
mini.close();main.close()
