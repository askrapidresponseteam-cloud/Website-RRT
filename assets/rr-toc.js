/* rr-toc.js: an "On this page" list beside long reading pages.
   A page opts in with <main data-toc>. Every section heading (section > h2)
   in it gets an id and a link in a rail to the right of the text, shown on
   wide screens only (assets/rr-page.css). The link for the section being read
   is marked as the page scrolls. Headings keep their English and Hindi
   spans, so the list follows the page language. */
(function () {
  'use strict';
  function slug(t, used) {
    var s = (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    var k = s, n = 2;
    while (used[k] || document.getElementById(k)) k = s + '-' + n++;
    used[k] = 1;
    return k;
  }
  function build() {
    var main = document.querySelector('main[data-toc]');
    if (!main || main.querySelector('.rr-toc')) return;
    var heads = main.querySelectorAll('section > h2');
    if (heads.length < 3) return;
    var used = {};
    var nav = document.createElement('nav');
    nav.className = 'rr-toc';
    nav.setAttribute('aria-label', 'On this page');
    var inner = document.createElement('div');
    inner.className = 'rr-toc-in';
    inner.innerHTML = '<p class="rr-toc-h"><span data-lang="en">On this page</span><span data-lang="hi">इस पेज पर</span></p>';
    var list = document.createElement('ol');
    var links = [];
    Array.prototype.forEach.call(heads, function (h) {
      var sec = h.parentNode;
      if (!sec.id) {
        var en = h.querySelector('[data-lang=en]');
        sec.id = slug((en || h).textContent, used);
      }
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      a.innerHTML = h.innerHTML;
      li.appendChild(a);
      list.appendChild(li);
      links.push([sec, a]);
    });
    inner.appendChild(list);
    nav.appendChild(inner);
    main.appendChild(nav);
    main.classList.add('rr-has-toc');

    function mark() {
      var cur = null;
      // The section whose top has passed just under the header; at the very
      // bottom of the page, the last one (it may be too short to get there).
      for (var i = 0; i < links.length; i++) {
        if (links[i][0].getBoundingClientRect().top < 140) cur = links[i][1];
      }
      var root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 2) cur = links[links.length - 1][1];
      if (!cur) cur = links[0][1];
      links.forEach(function (p) {
        if (p[1] === cur) p[1].setAttribute('aria-current', 'true');
        else p[1].removeAttribute('aria-current');
      });
    }
    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; mark(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    mark();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
