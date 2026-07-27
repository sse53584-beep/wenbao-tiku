/*
 * 文保题库 Service Worker（手写，避免 vite-plugin-singlefile 吞掉自动生成产物）
 *
 * 策略：
 *  - install：预缓存整个单文件 index.html（含内联的 1603 题与知识点）及 manifest/icon。
 *  - activate：清理旧版本缓存，立即接管页面。
 *  - fetch：同源 GET 采用 cache-first；navigation 请求未命中时回退到缓存的 index.html，
 *           保证断网也能打开"整页 = 全部数据"，实现完整离线刷题。
 */

const CACHE = 'wenbao-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {
        /* 预缓存失败不阻断安装，运行时仍可 cache-first */
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 仅处理同源 GET；跨域或非常规请求交给浏览器默认行为。
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求（页面打开）：优先缓存，未命中回退到缓存的 index.html（含全部数据）。
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
            return res;
          })
          .catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 其他同源 GET（icon / manifest 等）：cache-first，未命中则 fetch 并回填缓存。
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
