#!/usr/bin/env node
// rapid-response.in vs www is decided ONLY in Vercel > Domains. A host redirect
// in vercel.json fights it and loops every stylesheet/image (site loads bare).
'use strict';
const cfg = require('../vercel.json');
const bad = (cfg.redirects || []).filter(r => (r.has || []).some(c => c.type === 'host')
  || /^https?:\/\/(www\.)?rapid-response\.in/.test(String(r.destination || '')));
if (bad.length) { console.error('FAIL: vercel.json redirects between rapid-response.in and www:', JSON.stringify(bad)); process.exit(1); }
console.log('domain redirects: none in vercel.json (Vercel Domains decides)');
