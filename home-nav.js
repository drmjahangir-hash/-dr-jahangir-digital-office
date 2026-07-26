'use strict';

/* ============================================================================
   JM Digital Office - Shared "Back to Launcher" Navigation Component
   ----------------------------------------------------------------------------
   Loaded by every active module (WBCYN, Clinic, Trust - and available to
   Rental Manager too) so the Home button behaves identically everywhere,
   including iOS home-screen installed apps ("standalone" mode), where a
   plain relative <a href="../index.html"> can be unreliable:

   - iOS standalone webviews can silently ignore relative-link navigation in
     some situations (varies by iOS version and how the app was installed).
     Resolving the link to a fully-qualified absolute URL and driving the
     navigation explicitly via window.location.assign() on click is far more
     reliable than depending on the browser to resolve + follow a bare
     relative href by itself.
   - Never uses window.history (back/forward/go) - a step in the launcher's
     own navigation history is not guaranteed to exist (e.g. if the module
     was opened directly, as its own home-screen icon), so "back" is not a
     substitute for "go to the launcher".

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
    window.location.assign(resolvedLauncherUrl());
  }

  function upgradeLink(link) {
    var target = resolvedLauncherUrl();
    link.setAttribute('href', target);
    link.setAttribute('target', '_self');
    if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', LABEL);
    if (!link.getAttribute('title')) link.setAttribute('title', LABEL);
    // Belt-and-braces: explicit click handling instead of relying solely on
    // native <a> navigation, which is the part that has proven unreliable
    // inside iOS standalone PWAs.
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
