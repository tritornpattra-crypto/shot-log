/* Shot % — service worker v3
   - แคชไฟล์แอปไว้ให้เปิดใช้ได้แม้ไม่มีเน็ต
   - แคชไฟล์ AI (TensorFlow.js + โมเดล COCO-SSD) แบบ runtime
     เพื่อให้โหลดครั้งแรกครั้งเดียว แล้วใช้ออฟไลน์ได้ที่สนาม            */

const APP = "shotlog-app-v3";
const RUNTIME = "shotlog-runtime-v1";

const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon.png"];

/* โดเมนที่อนุญาตให้แคชแบบ runtime */
const RUNTIME_HOSTS = [
  "cdn.jsdelivr.net",              // tfjs + coco-ssd
  "storage.googleapis.com",        // ไฟล์น้ำหนักของโมเดล
  "tfhub.dev",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== APP && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* ---- ไฟล์ AI / ฟอนต์ จากโดเมนภายนอก: cache-first แล้วค่อยเก็บเพิ่ม ---- */
  if (RUNTIME_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(RUNTIME).then(cache =>
        cache.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(res => {
            if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
        })
      )
    );
    return;
  }

  /* ---- ไฟล์ของแอปเอง: ใช้แคชก่อน แล้วอัปเดตเบื้องหลัง ---- */
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(APP).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match("./index.html"));
      return hit || net;
    })
  );
});
