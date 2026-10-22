// Browser helpers for the RRT web app (lib/core/platform/browser_web.dart).
// Small and dependency-free: the Dart side passes strings and bytes only.
(function () {
  'use strict';

  // The push service worker (site root, see firebase-messaging-sw.js) shows
  // notifications; its scope is the one the Firebase SDK registers it under.
  var PUSH_SCOPE = '/firebase-cloud-messaging-push-scope';

  // The paw shown while the app loads goes once Flutter draws its first frame.
  window.addEventListener('flutter-first-frame', function () {
    var el = document.getElementById('rrt-loading');
    if (el) el.remove();
  });

  function hasNotifications() {
    return typeof window.Notification !== 'undefined';
  }

  function pushRegistration() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration(PUSH_SCOPE)
      .then(function (reg) { return reg || null; })
      .catch(function () { return null; });
  }

  window.rrtWeb = {
    isIosDevice: function () {
      var ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/.test(ua)) return true;
      // iPadOS reports itself as a Mac; a Mac has no touch screen.
      return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    },

    isStandalone: function () {
      try {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      } catch (e) { /* older browsers */ }
      return navigator.standalone === true;
    },

    notificationPermission: function () {
      return hasNotifications() ? String(Notification.permission) : 'unsupported';
    },

    requestNotificationPermission: function () {
      if (!hasNotifications()) return Promise.resolve('unsupported');
      try {
        var asked = Notification.requestPermission();
        if (asked && typeof asked.then === 'function') {
          return asked.then(function (p) { return String(p); });
        }
      } catch (e) { /* fall through */ }
      return Promise.resolve(String(Notification.permission));
    },

    showNotification: function (title, body, tag) {
      if (!hasNotifications() || Notification.permission !== 'granted') return Promise.resolve(null);
      var options = { body: body, icon: '/app/icons/Icon-192.png', badge: '/app/icons/Icon-192.png', data: { url: '/app/' } };
      if (tag) options.tag = tag;
      return pushRegistration().then(function (reg) {
        if (reg && reg.showNotification) return reg.showNotification(title, options);
        try { new Notification(title, options); } catch (e) { /* Chrome on Android needs a worker */ }
        return null;
      });
    },

    download: function (bytes, filename, mimeType) {
      var blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    },

    openTab: function (url) {
      // Not 'noopener' in the features: with it window.open returns null even
      // when the tab opened, which would look like a blocked popup.
      var w = window.open(url, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* cross-origin already */ } return; }
      // Popup blocked (not from a tap): open it here instead.
      window.location.href = url;
    },

    // Like openTab, but never leaves the app: false when the browser blocked
    // the new tab (it was not opened from a tap), so the app can offer a tap.
    tryOpenTab: function (url) {
      var w = window.open(url, '_blank');
      if (!w) return false;
      try { w.opener = null; } catch (e) { /* cross-origin already */ }
      return true;
    },

    readObjectUrl: function (url) {
      return fetch(url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return new Uint8Array(b); })
        .catch(function () { return null; });
    }
  };
})();
