'use strict';

/* ============================================================================
   JM Digital Office - Shared "Back to Launcher" Navigation Component
   ----------------------------------------------------------------------------
   Loaded by every active module (Rental Manager, WBCYN, Clinic, Trust) so the
   Home button behaves identically everywhere, including iOS home-screen
   installed apps ("standalone" mode).

   Root cause this works around: WebKit has documented, reproducible bugs
   where navigation from an iOS standalone/home-screen web app can silently
   fail even though the identical page works fine as a normal Safari tab
   (see e.g. webkit.org bug 211018 and multiple Apple Developer Forum reports
   of PWA navigation freezing/hanging in standalone mode only). The
   accompanying fix in service-worker.js stops the service worker from
   intercepting page navigations at all, which removes one major trigger.
   This file removes another: it never depends on the browser resolving a
   bare relative href by itself, and it never touches browser history.

   - The launcher URL is calculated safely from the current page location
     (new URL('../index.html', location.href)), so it is always correct
     whether running at http://localhost:PORT/rental/, or on GitHub Pages at
     https://<user>.github.io/-dr-jahangir-digital-office/rental/, etc. -
     no hard-coded domain or username anywhere.
   - Navigation is driven explicitly on click via
     window.location.replace(absoluteUrl) - a same-window, direct navigation
     that does not add a browser-history entry (so there is nothing for a
     "back" gesture to interact with) and does not depend on history, tab
     target, or window.close().

   Usage: each module's index.html includes this after its own stylesheet/
   scripts, with no other markup changes required:
     <link rel="stylesheet" href="../home-nav.css">
     <script src="../home-nav.js"></script>
   It finds any element with class "home-link" already in the page (the
   existing circular Home button markup) and upgrades it in place - it does
   not create or move anything, so appearance and position are unchanged.
============================================================================ */

(function () {
  var LAUNCHER_PATH = '../index.html';
  var LABEL = 'Back to JM Digital Office';

  function isStandalone() {
    var mm = typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    return mm || window.navigator.standalone === true;
  }

  function resolvedLauncherUrl() {
    return new URL(LAUNCHER_PATH, window.location.href).href;
  }

  function goHome(event) {
    if (event) event.preventDefault();
    window.location.replace(resolvedLauncherUrl());
  }

  function upgradeLink(link) {
    var target = resolvedLauncherUrl();
    link.setAttribute('href', target);
    link.setAttribute('target', '_self');
    if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', LABEL);
    if (!link.getAttribute('title')) link.setAttribute('title', LABEL);
    link.addEventListener('click', goHome);
  }

  function init() {
    var links = document.querySelectorAll('.home-link');
    for (var i = 0; i < links.length; i++) upgradeLink(links[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.JMHomeNav = { isStandalone: isStandalone, goHome: goHome };
})();
