/* 手書き手帳 Service Worker
   更新するときは VERSION を上げる。新しい版は次回起動時から使われ、古いキャッシュは削除される。 */
const VERSION = 'v23';
const CACHE = 'tegaki-techo-' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './fonts/fonts.css',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    // フォントは fonts.css に書かれた分割ファイルをすべて取り込む（オフライン初回起動でも崩れないように）
    const css = await (await c.match('./fonts/fonts.css')).text();
    const files = [...new Set([...css.matchAll(/url\(\.\/([^)]+)\)/g)].map(m => './fonts/' + m[1]))];
    for (let i = 0; i < files.length; i += 40) await c.addAll(files.slice(i, i + 40));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tegaki-techo-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // Google API などは素通し
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    // 画面遷移（OAuth から戻ったときの #access_token 付きも含む）は index.html を返す
    const hit = req.mode === 'navigate' ? await c.match('./index.html') : await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  })());
});
