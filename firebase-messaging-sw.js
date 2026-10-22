/* Push notifications for the RRT web app (rapid-response.in/app).
 *
 * The Firebase SDK in the web app registers this file from the site root
 * under its own scope (/firebase-cloud-messaging-push-scope), so it never
 * controls or caches the website's pages. It does one thing: show the SOS
 * alerts, chat messages and notices the backend pushes while the app is not
 * open, and bring the app forward when one is tapped.
 *
 * Pushes that carry a notification block (SOS, chats, notices) are shown by
 * the SDK itself; data-only ones (district asks) are shown here.
 */
/* global firebase, importScripts, clients */

// Registered before the SDK's own handler, so a tap always opens the app
// (the SDK would otherwise look for a link the pushes do not carry).
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.stopImmediatePropagation();
  var appUrl = new URL('/app/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(appUrl) === 0 && 'focus' in c) return c.focus();
      }
      return clients.openWindow ? clients.openWindow(appUrl) : null;
    })
  );
});

importScripts('/assets/vendor/firebase-10.14.1/firebase-app-compat.js');
importScripts('/assets/vendor/firebase-10.14.1/firebase-messaging-compat.js');

// The project's public web settings (the same as the app and the console).
firebase.initializeApp({
  apiKey: 'AIzaSyAJBTF9xCIgl27yaf72DPug9nLdG-KddGs',
  authDomain: 'rrt-new-backend.firebaseapp.com',
  projectId: 'rrt-new-backend',
  storageBucket: 'rrt-new-backend.firebasestorage.app',
  messagingSenderId: '854343594593',
  appId: '1:854343594593:web:ff6e8722fbd00607377020'
});

var FALLBACK = {
  district_ask: ['New ask in your district', 'Someone needs help nearby'],
  chat_message: ['New message', 'You have a new message'],
  consult: ['New message', 'You have a new message'],
  notice: ['Message from the RRT team', 'Open the app to read it']
};

firebase.messaging().onBackgroundMessage(function (payload) {
  if (payload && payload.notification) return; // shown by the SDK
  var data = (payload && payload.data) || {};
  var fb = FALLBACK[data.type] || ['SOS Alert', 'Emergency alert in your area'];
  return self.registration.showNotification(data.title || fb[0], {
    body: data.body || data.message || fb[1],
    icon: '/app/icons/Icon-192.png',
    badge: '/app/icons/Icon-192.png',
    tag: 'rrt-' + (data.type || 'sos'),
    data: { url: '/app/' }
  });
});
