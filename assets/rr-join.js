/* Rapid Response - the line that asks people to join today: on /network
 * (long lines, with a Join today button) and on the homepage under the SOS
 * button (short lines). A different line on every visit, never the one this
 * browser saw last, in English and Hindi.
 *
 * Every number in a line is live, from GET /public/network (backend
 * public_network.js): how many people, districts, and one district picked at
 * random with its own count. Nothing is made up; a line that needs a figure
 * the page does not have is skipped. The ask is to help, not to report: RRT
 * is people helping each other, and each person offers at least one kind of
 * help.
 *
 *   RRTJoin.pick('long' | 'short', data)  ->  { en, hi, i }   (data may be null)
 *   ?join=N in the address shows line N (to see each one).
 */
(function (global) {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('en-IN'); }
  function get(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  /* The figures a line may use. A district: one of the 40 largest with at
     least 3 people, at random. */
  function context(d) {
    var c = { n: '', d: '', place: '', pc: '', next: '' };
    if (!d || !(d.people > 0)) return c;
    c.n = fmt(d.people) + (d.approx ? '+' : '');
    if (d.districts > 1) c.d = fmt(d.districts);
    var places = (d.list || []).filter(function (r) { return r && r.name && r.people >= 3; }).slice(0, 40);
    if (places.length) {
      var p = places[Math.floor(Math.random() * places.length)];
      c.place = p.name;
      c.pc = fmt(p.people) + (p.approx ? '+' : '');
      c.next = p.approx ? '' : fmt(p.people + 1);
    }
    return c;
  }

  /* Long: /network, above the Join today button. */
  var LONG = [
    function (c) { return c.n && { en: c.n + ' people already said yes. The next yes could be yours.', hi: c.n + ' लोग हाँ कह चुके हैं। अगली हाँ आपकी हो सकती है।' }; },
    function (c) { return c.place && c.next && { en: c.place + ' has ' + c.pc + '. Make it ' + c.next + '.', hi: c.place + ' में ' + c.pc + ' लोग हैं। ' + c.next + ' कर दीजिए।' }; },
    function (c) { return c.place && !c.next && { en: c.place + ' has ' + c.pc + '. Add one more.', hi: c.place + ' में ' + c.pc + ' लोग हैं। एक और जोड़िए।' }; },
    function (c) { return c.n && { en: 'Not a helpline. ' + c.n + ' neighbours.', hi: 'हेल्पलाइन नहीं। ' + c.n + ' पड़ोसी।' }; },
    function (c) { return c.d && { en: 'Kindness, organised. ' + c.d + ' districts and counting.', hi: 'दया, पर संगठित। ' + c.d + ' ज़िले, और गिनती जारी है।' }; },
    function () { return { en: 'Don\'t just like the post. Be the one who shows up.', hi: 'सिर्फ़ पोस्ट लाइक मत कीजिए। मौके पर पहुँचने वाले बनिए।' }; },
    function () { return { en: 'One car. One call. A few days of care. That is how rescues happen.', hi: 'एक गाड़ी। एक फ़ोन। कुछ दिन की देखभाल। रेस्क्यू ऐसे ही होते हैं।' }; },
    function (c) { return c.n && { en: 'Rescue is a team sport. ' + c.n + ' players. Pick your position.', hi: 'रेस्क्यू एक टीम गेम है। ' + c.n + ' खिलाड़ी। अपनी पोज़िशन चुनिए।' }; },
    function () { return { en: 'Not for everyone. For anyone who can help.', hi: 'सबके लिए नहीं। हर उस इंसान के लिए जो मदद कर सकता है।' }; },
    function (c) { return c.n && { en: 'Good people are contagious. ' + c.n + ' have caught it.', hi: 'अच्छाई फैलती है। ' + c.n + ' लोगों को लग चुकी है।' }; },
    function (c) { return c.place && { en: 'This week, an animal in ' + c.place + ' will need a hand. Be the hand.', hi: 'इस हफ़्ते ' + c.place + ' में किसी बेज़ुबान को एक हाथ चाहिए होगा। वो हाथ आप बनिए।' }; },
    function (c) { return c.d && { en: c.d + ' districts have lit up. Is yours one of them?', hi: c.d + ' ज़िले जुड़ चुके हैं। क्या आपका उनमें है?' }; },
    function () { return { en: 'The best day to join was yesterday. The next best is today.', hi: 'जुड़ने का सबसे अच्छा दिन कल था। अगला सबसे अच्छा, आज।' }; },
    function () { return { en: 'Open the app. Open a door for an animal.', hi: 'ऐप खोलिए। किसी बेज़ुबान के लिए दरवाज़ा खोलिए।' }; },
    function () { return { en: 'A ride. Some money. A vet. A spare room. The right contact. Bring one.', hi: 'गाड़ी। कुछ पैसे। वेट। कुछ दिन की जगह। सही संपर्क। इनमें से एक लाइए।' }; },
  ];

  /* Short: one quiet line on the homepage, linking to /network. */
  var SHORT = [
    function (c) { return c.n && c.d && { en: c.n + ' people in ' + c.d + ' districts so far', hi: 'अब तक ' + c.d + ' ज़िलों में ' + c.n + ' लोग' }; },
    function (c) { return c.n && { en: c.n + ' people said yes. Join them today', hi: c.n + ' लोग हाँ कह चुके हैं। आज जुड़िए' }; },
    function (c) { return c.place && c.next && { en: c.place + ' has ' + c.pc + '. Make it ' + c.next, hi: c.place + ' में ' + c.pc + '। ' + c.next + ' कर दीजिए' }; },
    function (c) { return c.d && { en: c.d + ' districts and counting. Is yours one?', hi: c.d + ' ज़िले और बढ़ते हुए। क्या आपका भी है?' }; },
    function (c) { return c.n && { en: 'Not a helpline. ' + c.n + ' neighbours', hi: 'हेल्पलाइन नहीं। ' + c.n + ' पड़ोसी' }; },
    function (c) { return c.n && { en: 'Good people are contagious. ' + c.n + ' have caught it', hi: 'अच्छाई फैलती है। ' + c.n + ' लोगों को लग चुकी है' }; },
  ];

  function pick(kind, data) {
    var list = kind === 'short' ? SHORT : LONG;
    var c = context(data);
    var ok = [];
    list.forEach(function (f, i) { var t = f(c); if (t) ok.push({ i: i, t: t }); });
    if (!ok.length) return null;
    var m = /[?&]join=(\d+)\b/.exec((global.location && global.location.search) || '');
    var forced = m ? ok.filter(function (x) { return x.i === Number(m[1]); })[0] : null;
    var key = 'rr-join-' + (kind === 'short' ? 'short' : 'long');
    var last = get(key);
    var others = ok.filter(function (x) { return String(x.i) !== last; });
    var pool = others.length ? others : ok;
    var ch = forced || pool[Math.floor(Math.random() * pool.length)];
    set(key, String(ch.i));
    return { en: ch.t.en, hi: ch.t.hi, i: ch.i };
  }

  global.RRTJoin = { pick: pick, LONG: LONG, SHORT: SHORT, context: context };
})(window);
