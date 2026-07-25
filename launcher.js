'use strict';

/* ================= COMING SOON: populate from query string ================= */
function initComingSoon(){
  const titleEl = document.getElementById('csTitle');
  if(!titleEl) return; // not on the coming-soon page
  const params = new URLSearchParams(window.location.search);
  const title = params.get('title') || 'This App';
  const icon = params.get('icon') || '🚧';
  const desc = params.get('desc') || 'This module is under development and will be available in a future update.';
  titleEl.textContent = title;
  document.getElementById('csIcon').textContent = icon;
  document.getElementById('csDesc').textContent = desc;
  document.title = title + ' · Coming Soon · JM Digital Office';
}

/* ================= PWA: install banner (iOS Safari "Add to Home Screen" hint) ================= */
function isStandalone(){
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return mm || window.navigator.standalone === true;
}
function isiOS(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function renderInstallBanner(){
  const root = document.getElementById('pwaBannerRoot');
  if(!root) return;
  if(isStandalone()) return;
  if(localStorage.getItem('jm_install_banner_dismissed')==='1') return;
  if(!isiOS()) return;
  root.innerHTML = `
    <div class="pwa-install-banner" id="pwaBanner">
      <span>Install JM Digital Office: tap the Share icon, then "Add to Home Screen".</span>
      <button id="pwaBannerDismiss" class="dismiss">✕</button>
    </div>`;
  document.getElementById('pwaBannerDismiss').addEventListener('click', ()=>{
    localStorage.setItem('jm_install_banner_dismissed','1');
    root.innerHTML='';
  });
}

/* ================= SERVICE WORKER REGISTRATION ================= */
/* Registered relative to this page (project root), so its default scope
   covers the whole site, including /wbcyn/ and any future app folders. */
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('service-worker.js').catch(err=>{
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

/* ================= START ================= */
try{ initComingSoon(); }catch(e){ console.warn('Coming soon init skipped:', e); }
try{ renderInstallBanner(); }catch(e){ console.warn('Install banner skipped:', e); }
try{ registerServiceWorker(); }catch(e){ console.warn('Service worker registration skipped:', e); }
