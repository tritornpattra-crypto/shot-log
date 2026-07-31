/* Shot % — service worker v3
   - แคชไฟล์แอปไว้ให้เปิดใช้ได้แม้ไม่มีเน็ต
   - แคชไฟล์ AI (TensorFlow.js + โมเดล COCO-SSD) แบบ runtime
     เพื่อให้โหลดครั้งแรกครั้งเดียว แล้วใช้ออฟไลน์ได้ที่สนาม            */

const APP = "shotlog-app-v5";
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

  /* ---- ไฟล์ของแอปเอง: เอาของใหม่จากเน็ตก่อนเสมอ ----
     เดิมใช้แคชก่อน ทำให้มือถือค้างอยู่กับเวอร์ชันเก่าแม้จะอัปเดตเว็บแล้ว
     ตอนนี้ลองต่อเน็ตก่อน (รอไม่เกิน 3.5 วินาที) ถ้าไม่มีเน็ตค่อยใช้แคช
     จึงยังเปิดใช้ที่สนามแบบออฟไลน์ได้เหมือนเดิม                        */
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(APP);
    try {
      const res = await Promise.race([
        fetch(req, { cache: "no-store" }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500))
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      return hit || (await cache.match("./index.html")) || Response.error();
    }
  })());
});
