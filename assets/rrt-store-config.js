/* ============================================================================
 * RRT STORE CONFIG  —  the web half of the app's store switches
 * ----------------------------------------------------------------------------
 * The RRT mobile app reads two admin-controlled switches from Firestore
 * (project rrt-new-backend, document app_config/flags):
 *
 *     flags.store            true  = the shop is open
 *                            false = the shop is withdrawn (app hides the tab)
 *     flags.store_veg_only   true  = hide products naming an animal ingredient
 *
 * This file makes rapid-response.in read the SAME document, so one flip in the
 * admin panel governs the app and the website together. It is deliberately
 * tiny and dependency-light: the Firebase compat SDK (already a CDN script),
 * one document read, one live subscription.
 *
 * SECURITY: the config below is the project's PUBLIC web config (an apiKey
 * here is not a secret — it identifies the project, it does not grant access).
 * Real protection is Firestore rules, which the app relies on too: clients may
 * READ app_config/flags and app_config/text, and may WRITE nothing. The admin
 * panel writes flags behind Firebase Auth. This file only ever reads.
 *
 * FAIL-SAFE: if Firebase is unreachable, the document is missing, or the field
 * is absent, the shop stays OPEN with the vendor's full range — exactly the
 * app's compiled defaults (flags.store default true, store_veg_only false).
 * A config outage must never take the shop down or silently filter it.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var PROJECT = 'rrt-new-backend';
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAJBTF9xCIgl27yaf72DPug9nLdG-KddGs',
    authDomain: 'rrt-new-backend.firebaseapp.com',
    projectId: 'rrt-new-backend',
    storageBucket: 'rrt-new-backend.firebasestorage.app',
    messagingSenderId: '854343594593',
    appId: '1:854343594593:web:ff6e8722fbd00607377020'
  };

  // The app's compiled defaults (backend/functions/config/schema.js). Used
  // verbatim whenever Firestore has nothing to say.
  var DEFAULTS = { storeOpen: true, vegOnly: false, closedMessage: '' };

  var state = {
    ready: false,
    storeOpen: DEFAULTS.storeOpen,
    vegOnly: DEFAULTS.vegOnly,
    closedMessage: DEFAULTS.closedMessage
  };
  var listeners = [];

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snapshot()); } catch (e) { /* a bad listener must not break the rest */ }
    }
  }

  function snapshot() {
    return {
      ready: state.ready,
      storeOpen: state.storeOpen,
      vegOnly: state.vegOnly,
      closedMessage: state.closedMessage
    };
  }

  /** Read the two flags out of an app_config/flags document, tolerating both
   *  the flat "flags.store" field the backend writes and a nested shape. */
  function applyDoc(data) {
    data = data || {};
    function field(flat, nested, fallback) {
      if (typeof data[flat] === 'boolean') return data[flat];
      if (data.flags && typeof data.flags[nested] === 'boolean') return data.flags[nested];
      return fallback;
    }
    state.storeOpen = field('flags.store', 'store', DEFAULTS.storeOpen);
    state.vegOnly = field('flags.store_veg_only', 'store_veg_only', DEFAULTS.vegOnly);
    // Optional human message shown when the shop is closed. Text lives in
    // app_config/text in the app's scheme; we accept it here too if present.
    var msg = data['text.store_closed'];
    if (data.text && typeof data.text.store_closed === 'string') msg = data.text.store_closed;
    state.closedMessage = typeof msg === 'string' ? msg : DEFAULTS.closedMessage;
    state.ready = true;
    emit();
  }

  function begin() {
    if (!global.firebase || !global.firebase.firestore) {
      // SDK absent: run on defaults, mark ready so pages don't wait forever.
      state.ready = true;
      emit();
      return;
    }
    var app;
    try {
      app = global.firebase.apps && global.firebase.apps.length
        ? global.firebase.app()
        : global.firebase.initializeApp(FIREBASE_CONFIG);
      // If an unrelated app was already initialised (e.g. the report system),
      // stand up our own named app so we read the right project.
      if (app.options && app.options.projectId !== PROJECT) {
        app = global.firebase.initializeApp(FIREBASE_CONFIG, 'rrtStore');
      }
    } catch (e) {
      try { app = global.firebase.initializeApp(FIREBASE_CONFIG, 'rrtStore'); }
      catch (e2) { state.ready = true; emit(); return; }
    }

    var db;
    try { db = global.firebase.firestore(app); }
    catch (e) { state.ready = true; emit(); return; }

    var ref = db.collection('app_config').doc('flags');
    // Live subscription: an admin flip reaches open web pages within seconds,
    // exactly as it reaches the app.
    ref.onSnapshot(function (snap) {
      applyDoc(snap && snap.exists ? snap.data() : {});
    }, function () {
      // Permission or network error: hold the last good state, or defaults.
      state.ready = true; emit();
    });
  }

  var api = {
    /** Latest known store state (see snapshot()). Safe to read any time; the
     *  `ready` flag says whether it reflects Firestore yet or still defaults. */
    get: snapshot,
    /** Subscribe to changes. Fires immediately with the current state, then on
     *  every update. Returns an unsubscribe function. */
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      fn(snapshot());
      return function () {
        var i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    },
    /** Resolves once the first Firestore read (or its failure) has landed, so a
     *  page can decide open/closed without a flash. Resolves to a snapshot. */
    whenReady: function () {
      return new Promise(function (resolve) {
        if (state.ready) return resolve(snapshot());
        var off = api.subscribe(function (s) {
          if (s.ready) { off(); resolve(s); }
        });
      });
    }
  };

  global.RRTStoreConfig = api;
  begin();
})(typeof window !== 'undefined' ? window : this);
