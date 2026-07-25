'use strict';

/* ============================================================================
   JM Digital Office - Service Worker Update Watcher
   ----------------------------------------------------------------------------
   Shared by every module (launcher, WBCYN, Clinic Manager, Trust Manager).
   Each page registers the service worker itself (relative path so scope stays
   correct under any GitHub Pages subfolder), then hands the resulting
   registration to attachSWUpdateWatcher() here.

   What this does:
   - Detects when a NEW service worker has finished installing in the
     background (this only happens after a real deployment change, because
     the browser only re-fetches service-worker.js and treats it as "new"
     when its byte content differs from the currently installed one).
   - Shows a small "New version available. Reload?" banner instead of
     silently swapping content under the user - several of these apps have
     long forms, so an unannounced reload could lose unsaved input.
   - On "Reload", tells the waiting worker to skip waiting and reloads the
     page once it takes control, so the user is instantly on the latest
     version - this is what prevents installed iPhone PWAs from getting
     stuck on an old cached copy.
   - Also catches the case where a new worker was already waiting before this
     page even loaded (e.g. the update installed while the app was closed).
============================================================================ */

(function(){
  if(!('serviceWorker' in navigator)) return;

  let reloadTriggered = false;
  let reloadRequestedByUser = false; // only true after the Reload button is clicked

  function showUpdateBanner(worker){
    if(document.getElementById('swUpdateBanner')) return; // already showing
    const banner = document.createElement('div');
    banner.id = 'swUpdateBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px',
      'background:#0b3d66', 'color:#fff', 'padding:14px 16px',
      'border-radius:10px', 'display:flex', 'align-items:center', 'gap:12px',
      'z-index:99999', 'box-shadow:0 4px 18px rgba(0,0,0,.3)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'font-size:14px', 'flex-wrap:wrap'
    ].join(';');
    banner.innerHTML = `
      <span style="flex:1;min-width:180px;">New version available. Reload?</span>
      <button id="swUpdateReloadBtn" style="background:#fff;color:#0b3d66;border:none;border-radius:6px;padding:8px 14px;font-weight:700;font-size:13.5px;">Reload</button>
      <button id="swUpdateLaterBtn" style="background:transparent;color:#cfe3f7;border:1px solid rgba(255,255,255,.4);border-radius:6px;padding:8px 12px;font-size:13.5px;">Later</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('swUpdateReloadBtn').addEventListener('click', ()=>{
      banner.querySelector('#swUpdateReloadBtn').textContent = 'Reloading…';
      reloadRequestedByUser = true;
      if(worker && worker.postMessage){
        worker.postMessage({type:'SKIP_WAITING'});
      }
      // Fallback: if controllerchange never fires (older browsers), reload anyway shortly after.
      setTimeout(()=>{ if(!reloadTriggered){ reloadTriggered = true; window.location.reload(); } }, 1500);
    });
    document.getElementById('swUpdateLaterBtn').addEventListener('click', ()=>{
      banner.remove();
    });
  }

  // Only reload in response to a controller change that WE asked for (by
  // posting SKIP_WAITING after the user clicked Reload). This deliberately
  // ignores the harmless controllerchange that fires the very first time a
  // brand-new visitor's service worker activates, so nobody gets an
  // unexpected reload on their first visit.
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(!reloadRequestedByUser || reloadTriggered) return;
    reloadTriggered = true;
    window.location.reload();
  });

  window.attachSWUpdateWatcher = function(registration){
    if(!registration) return;

    // Case 1: an update was already installed and waiting before we attached.
    if(registration.waiting && navigator.serviceWorker.controller){
      showUpdateBanner(registration.waiting);
    }

    // Case 2: a new worker starts installing while this page is open.
    registration.addEventListener('updatefound', ()=>{
      const newWorker = registration.installing;
      if(!newWorker) return;
      newWorker.addEventListener('statechange', ()=>{
        if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
          // controller already set => this is an update, not the first install.
          showUpdateBanner(newWorker);
        }
      });
    });

    // Also proactively ask the browser to check for a newer service-worker.js
    // (browsers already do this periodically, but this covers the common
    // case of reopening an installed PWA after a new deployment).
    registration.update().catch(()=>{ /* offline or nothing new - ignore */ });
  };
})();
