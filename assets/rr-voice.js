/* Rapid Response - voice input for search boxes.
   Speech to text only, using the browser's own recogniser (Web Speech API).
   No language model, no API key, no RRT server: the words it hears are
   handed to the page's normal search.

   On-device first: where the browser can recognise the language on the
   device (SpeechRecognition.available / install with processLocally), it is
   asked to, so audio never leaves the phone. Where it cannot, the browser's
   standard recogniser is used (Chrome: Google's speech service; Safari:
   Apple's, often on-device), and the person is told once. Where there is no
   recogniser at all, attach() returns null and the mic never appears. */
(function (global) {
  'use strict';
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  var NOTE_KEY = 'rr-voice-note';

  function supported() { return !!(SR && global.isSecureContext); }

  /* 'local' when the language can be recognised on this device (installing
     the language pack if the browser offers that), else 'cloud'. */
  function mode(langTag) {
    if (!SR || typeof SR.available !== 'function') return Promise.resolve('cloud');
    var opts = { langs: [langTag], processLocally: true };
    return Promise.resolve(SR.available(opts)).then(function (s) {
      if (s === 'available') return 'local';
      if (s === 'downloadable' && typeof SR.install === 'function') {
        return Promise.resolve(SR.install(opts)).then(function (ok) { return ok ? 'local' : 'cloud'; })
          .catch(function () { return 'cloud'; });
      }
      return 'cloud';
    }).catch(function () { return 'cloud'; });
  }

  function clean(t) { return String(t || '').replace(/[.?!,\u0964]+$/, '').replace(/\s+/g, ' ').trim(); }

  /**
   * attach(button, opts)
   *   opts.lang()          -> 'en-IN' | 'hi-IN' ... (read at press time)
   *   opts.pick(alts)      -> best transcript among the recogniser's guesses
   *   opts.onStart()       / opts.onInterim(text) / opts.onFinal(text)
   *   opts.onEnd(heardText|'')  / opts.onError(code)  / opts.onNote(mode)
   *   opts.onState(listening:boolean)
   */
  function attach(button, opts) {
    if (!supported() || !button) return null;
    opts = opts || {};
    button.hidden = false;
    var rec = null, active = false, heard = '', guard = null, errored = false;

    function state(on) {
      active = on;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (opts.onState) opts.onState(on);
    }
    function stop() { try { if (rec) rec.stop(); } catch (e) { /* already stopped */ } }

    function begin(m) {
      heard = ''; errored = false;
      rec = new SR();
      rec.lang = opts.lang ? opts.lang() : 'en-IN';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 5;
      if (m === 'local' && 'processLocally' in rec) rec.processLocally = true;
      rec.onstart = function () { state(true); if (opts.onStart) opts.onStart(m); };
      rec.onresult = function (e) {
        var interim = '', fin = null;
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var r = e.results[i];
          if (r.isFinal) {
            var alts = [];
            for (var j = 0; j < r.length; j++) { var c = clean(r[j].transcript); if (c) alts.push(c); }
            fin = alts.length ? (opts.pick ? opts.pick(alts) : alts[0]) : null;
          } else {
            interim += r[0].transcript;
          }
        }
        if (fin) { heard = fin; if (opts.onFinal) opts.onFinal(fin); }
        else if (interim && opts.onInterim) opts.onInterim(clean(interim));
      };
      rec.onerror = function (e) {
        errored = true;
        // A local pack that fails mid-way: next press uses the standard recogniser.
        if (m === 'local' && (e.error === 'language-not-supported' || e.error === 'service-not-allowed')) forceCloud = true;
        if (e.error !== 'aborted' && opts.onError) opts.onError(e.error);
      };
      rec.onend = function () {
        clearTimeout(guard); state(false);
        if (opts.onEnd) opts.onEnd(heard, errored);
      };
      try { rec.start(); } catch (e) { state(false); if (opts.onError) opts.onError('start'); return; }
      clearTimeout(guard); guard = setTimeout(stop, 10000); // never listen forever
    }

    var forceCloud = false;
    button.addEventListener('click', function (e) {
      e.preventDefault();
      if (active) { stop(); return; }
      var tag = opts.lang ? opts.lang() : 'en-IN';
      (forceCloud ? Promise.resolve('cloud') : mode(tag)).then(function (m) {
        if (m === 'cloud' && opts.onNote) {
          var seen = false;
          try { seen = localStorage.getItem(NOTE_KEY) === '1'; localStorage.setItem(NOTE_KEY, '1'); } catch (x) { /* ignore */ }
          if (!seen) opts.onNote(m);
        }
        begin(m);
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) stop(); });
    return { stop: stop, active: function () { return active; } };
  }

  global.RRVoice = { supported: supported, attach: attach, mode: mode };
})(window);
