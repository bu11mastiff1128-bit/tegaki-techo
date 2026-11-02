/* 手書き手帳 Service Worker
   更新するときは VERSION を上げる。新しい版は次回起動時から使われ、古いキャッシュは削除される。
   フォントは版に関係なく使い回す（FONTS）。600個ほどあり、版ごとに取り直すと更新が終わらないため。 */
const VERSION = 'v25';
const CACHE = 'tegaki-techo-' + VERSION;
const FONTS = 'tegaki-fonts';
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

/* フォントを足りない分だけ入れる。途中で止まっても入れた分は残り、次の起動で続きから進む。
   以前の版のキャッシュにあるものはそこから移す。すべてそろったら古いキャッシュを消す */
let filling = null;
function fillFonts() {
  return filling || (filling = (async () => {
    const f = await caches.open(FONTS);
    const css = await (await (await caches.open(CACHE)).match('./fonts/fonts.css')).text();
    const files = [...new Set([...css.matchAll(/url\(\.\/([^)]+)\)/g)].map(m => new URL('./fonts/' + m[1], location).href))];
    const have = new Set((await f.keys()).map(r => r.url));
    const todo = files.filter(u => !have.has(u));
    let ok = true;
    for (let i = 0; i < todo.length; i += 20) await Promise.all(todo.slice(i, i + 20).map(async u => {
      try {
        const res = (await caches.match(u)) || (await fetch(u));
        if (res.ok) await f.put(u, res.clone()); else ok = false;
      } catch (e) { ok = false; }
    }));
    if (ok) for (const k of await caches.keys()) if (k.startsWith('tegaki-techo-') && k !== CACHE) await caches.delete(k);
  })().catch(() => {}).finally(() => { filling = null; }));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
  fillFonts();
});

// 画面が開くたびに呼ばれる（フォントが途中までのときの続き）
self.addEventListener('message', e => { if (e.data === 'fonts') e.waitUntil(fillFonts()); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // Google API などは素通し
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    // 画面遷移（OAuth から戻ったときの #access_token 付きも含む）は index.html を返す
    const hit = req.mode === 'navigate' ? await c.match('./index.html') : await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const old = await caches.match(req, { ignoreSearch: true }); // フォント（FONTS か移す前の古い版）
    if (old) return old;
    const res = await fetch(req);
    if (res.ok) (new URL(req.url).pathname.includes('/fonts/') ? await caches.open(FONTS) : c).put(req, res.clone());
    return res;
  })());
});
