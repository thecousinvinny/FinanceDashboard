// Decides, before the first paint, whether the daily brief shows on this load
// — and when it doesn't, covers the page for the load screen (BootSplash)
// instead, so the server-rendered skeletons never show and the first real
// paint is one clean reveal.
//
// The greeting used to decide in a React effect, so the server-rendered Hoard
// screen painted (and started animating) first and the greeting landed on top
// of it. This runs as an inline <head> script instead: when the brief is due
// it adds `greet-boot` to <html>, and globals.css covers the page with a solid
// layer until GreetingOverlay's own backdrop is up and removes the class.
//
// Rule: once per app launch (browser session), never twice within 30 minutes.
// The overlay lives in the dashboard layout, so anything that remounts it — a
// reload, a deploy refreshing the page, a bounce through /login — used to
// bring it back, which on desktop looked random.

export const GREET_BOOT_CLASS  = 'greet-boot'
export const BOOT_SPLASH_CLASS = 'boot-splash'
const SS_SHOWN = 'hoardr-greeting-session'
const LS_LAST  = 'hoardr-greeting-at'      // ms timestamp of the last showing
const COOLDOWN = 30 * 60_000

export const GREETING_BOOT_SCRIPT = `(function(){try{
var p=location.pathname;
if(p==='/'||p.indexOf('/login')===0||p.indexOf('/auth')===0)return;
var g=true;
try{
if(sessionStorage.getItem('${SS_SHOWN}')||Date.now()-Number(localStorage.getItem('${LS_LAST}')||0)<${COOLDOWN})g=false;
else{sessionStorage.setItem('${SS_SHOWN}','1');localStorage.setItem('${LS_LAST}',String(Date.now()))}
}catch(e){}
var c=g?'${GREET_BOOT_CLASS}':'${BOOT_SPLASH_CLASS}',r=document.documentElement;r.classList.add(c);
setTimeout(function(){r.classList.remove(c)},8000);
}catch(e){}})()`
