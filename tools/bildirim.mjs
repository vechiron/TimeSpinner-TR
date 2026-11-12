// "Üst sınır arttı" bildirimlerinin (MAX HP+ / MAX AURA+ / MAX SAND+) Türkçe kareleri: LocToastLatin atlasına
// kare 15/16/17 ("MAKS CAN+", "MAKS AURA+", "MAKS KUM+"). Oyun kareyi StatMaxUpToast kurucusunda seçer:
// kare = dil×3 + tür (FR0 DE1 ES2 BP3 RU4; tür Health 0 · Aura 1 · öteki/Sand 2) → Türkçe tabanı 15 (exe yaması ayrı).
// Kareler oyunun kendi harflerinden derlenir: kullanıcının LocToastLatin.xnb ve LevelUp.xnb'si yalnız okunur, depoda
// yalnız kesim tarifi var. Yöntem ve dayandığı ölçümler ham/onizleme/harf/RAPOR.md: harflerin dolgusu kesilip yan
// yana konur, en koyu ton (kenar) dolgunun 8-komşu genişlemesi olarak yeniden çizilir (dikişte kenar bozulmaz),
// başka renk ailesinden gelen harf ton sırasıyla hedefin paletine boyanır. Çıktı, onaylanan
// önizlemeyle piksel piksel aynı olmalı: TR_KARELER[].ozet onun RGBA'sının sha256'sı; tutmazsa araç durur.
//
//   node tools/bildirim.mjs uret <çıkış-klasörü>   <çıkış>/Content/Overlays/PlayerHUD/LocToastLatin.xnb + LocToastLatin-kareler.json
//   node tools/bildirim.mjs sina                    kimlik · değişmezlik · boşluk · sha256 · karşı testler; son satır HÜKÜM
// Dışa açılanlar: locToastYamala · TR_KARELER · REL. Oyun klasörüne yazmaz.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { orijinal, OYUN } from './oyun-yolu.mjs';
import { atlasKareleri } from './bayrak.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba, pngOku } from './xnb.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Girdiler: oyun klasörüne göre yol ve Steam sürümünün sha256'sı (11.11.2026). Tutmazsa oyun güncellenmiştir,
// kesim koordinatları kayabilir: durulur.
export const REL = { locToast: 'Content/Overlays/PlayerHUD/LocToastLatin.xnb', levelUp: 'Content/Overlays/PlayerHUD/LevelUp.xnb' };
export const SHA = { // seviye.mjs LevelUp.xnb'nin sha256'sını buradan alır (tek yer)
  locToast: '68ec4dec3213a6255cfe764796ed87841278fab76da9dbb435d03e63563acc28',
  levelUp: '6dbf68465275d171b31f7f098719f243ed010f124e2146618a812f8ba6c8c045',
};

// Yeni kareler atlasın boş sağ alt bölgesinde, 1 px arayla (orijinalde y≥104'te en sağ dolu x 113, en alt dolu y 210;
// x≥147'deki sağ blok y≤103). Atlas 256x256 kalır. w×h ve ozet onaylı önizlemeden (ham/onizleme/harf/TR-bildirim-*.png).
export const TR_KARELER = [
  { kare: 15, tur: 'can', metin: 'MAKS CAN+', x: 146, y: 106, w: 94, h: 17, ozet: '3514cc269868394e6a2ef897fdd1d503c05b382998d2e20a4fbf14a8b4c871e9' },
  { kare: 16, tur: 'aura', metin: 'MAKS AURA+', x: 146, y: 125, w: 108, h: 17, ozet: '536d835fa7ad4a7f93a17d05ef07d9ee346ac82d7deb9ad34a40987386eb5e9b' },
  { kare: 17, tur: 'kum', metin: 'MAKS KUM+', x: 146, y: 144, w: 107, h: 17, ozet: '1076e99145898a614779997545fcb284c06305fe6754a5b6045a2332206e05c6' },
];

// Kaynak kareler [dosya, x, y, w, h] (TextureDatabase.dat'taki tanımlar: LocToastLatin kare dil×3+tür, LevelUp 17+tür).
const KAYNAK = {
  'FR-kum': ['locToast', 0, 109, 102, 16], // 2 "SABLE MAX+"
  'DE-can': ['locToast', 0, 22, 108, 16], // 3 "MAX LEBEN+"
  'DE-aura': ['locToast', 148, 21, 100, 18], // 4 "MAX AURA+"
  'DE-kum': ['locToast', 0, 129, 96, 18], // 5 "MAX SAND+"
  'ES-can': ['locToast', 0, 41, 106, 20], // 6 "SALUD MÁX+"
  'RU-can': ['locToast', 0, 87, 142, 17], // 12 "МАКС ЗДОРОВЬЯ+" (hedef paleti ve hedef yükseklik 17 bunlardan)
  'RU-aura': ['locToast', 147, 87, 109, 17], // 13 "МАКС АУРЫ+"
  'RU-kum': ['locToast', 0, 194, 114, 17], // 14 "МАКС ПЕСКА+"
  'EN-kum': ['levelUp', 0, 165, 102, 16], // LevelUp 19 "MAX SAND UP" (8 tonlu çizim)
};

// Kesim tarifi (önizlemeden aynen). Parça: kaynak karede [x0, x1) sütunları; sol/sag = [[satır, sütun], ...] o satırdan
// itibaren geçerli sınır; y0 ilk satır; dy hedefte dikey kayma; kay kaleme ek aralık. {bosluk} kelime arası.
// Parçanın taban satırındaki (11 − dy) sol sınırı kaleme oturur, kalem o satırdaki genişlik kadar ilerler.
const H = 17, TABAN = 11;
const TARIF = {
  can: [
    { harf: 'MAK', f: 'RU-can', x0: 0, x1: 38, sag: [[0, 40], [4, 38], [14, 40]] },
    { harf: 'S', f: 'ES-can', x0: 0, x1: 11, sag: [[13, 10], [15, 9], [16, 6]], dy: -3, kay: -1 },
    { bosluk: 4 },
    { harf: 'C', f: 'RU-can', x0: 38, x1: 49, sol: [[0, 40], [4, 38], [14, 40]] },
    { harf: 'A', f: 'RU-can', x0: 18, x1: 26, sol: [[11, 20]], sag: [[11, 29]], kay: 2 },
    { harf: 'N+', f: 'DE-can', x0: 86, x1: 106, sol: [[0, 85], [3, 84], [11, 86]] },
  ],
  aura: [
    { harf: 'MAK', f: 'RU-aura', x0: 0, x1: 38, sag: [[0, 40], [4, 38], [14, 40]] },
    { harf: 'S (mavide S yok: kırmızıdan boyanır)', f: 'ES-can', x0: 0, x1: 11, sag: [[13, 10], [15, 9], [16, 6]], dy: -3, kay: -1 },
    { bosluk: 4 },
    { harf: 'AURA+', f: 'DE-aura', x0: 42, x1: 100, sol: [[13, 40]], dy: -1 },
  ],
  kum: [
    { harf: 'MAK', f: 'RU-kum', x0: 0, x1: 38, sag: [[0, 40], [4, 38], [14, 40]] },
    { harf: 'S', f: 'FR-kum', x0: 0, x1: 12, sag: [[10, 11], [11, 9], [12, 8], [13, 6], [14, 0]], kay: -1 },
    { bosluk: 7 },
    { harf: 'K', f: 'RU-kum', x0: 27, x1: 38, sol: [[11, 29]], sag: [[14, 40]] },
    { harf: 'U (kahvede U yok: EN "UP"un U\'su + P gövdesi sağ kol)', f: 'EN-kum', x0: 78, x1: 93, y0: 3, sag: [[12, 91]], dy: -2, kay: 1 },
    { harf: 'M', f: 'RU-kum', x0: 0, x1: 18, sag: [[11, 20]], kay: 1 },
    { harf: '+', f: 'DE-kum', x0: 86, x1: 96, dy: -1 },
  ],
};

// Karedeki renkler aydınlığa göre sıralı (sıra 1 = en koyu = kenar). Tarifteki 9 karede eşit aydınlıklı renk yok (ölçüldü).
function palet(img, [, x, y, w, h]) {
  const say = new Map(), lum = (c) => 0.299 * (c >>> 24) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = ((y + j) * img.w + x + i) * 4; if (img.px[d + 3]) say.set(img.px.readUInt32BE(d), 1);
  }
  return [...say.keys()].sort((a, b) => lum(a) - lum(b));
}

// Ton sırası eşlemesi: kırmızı↔mavi aynı sıra (şekil %96 örtüşüyor, yaklaşık; RAPOR "Ölçülenler" 3). Kahve ile
// öbürleri arasındaki eşleme ölçüldü ama tarifte kullanılmıyor: istenirse sessizce yanlış boyamak yerine durulur.
function tonEsle(r, kaynak, hedef, boz) {
  if (kaynak === hedef) return r;
  if (kaynak === 'kum' || hedef === 'kum') throw new Error(`${kaynak} → ${hedef} ton eşlemesi tarifte yok`);
  return boz === 'ton' && (r === 3 || r === 4) ? 7 - r : r;
}

function kareCiz(tur, kaynak, boz) {
  const P = palet(kaynak.locToast, KAYNAK[`RU-${tur}`]), tuval = new Map();
  let kalem = 2;
  const tarif = boz === 'kesim' ? structuredClone(TARIF[tur]) : TARIF[tur];
  if (boz === 'kesim' && tur === 'can') tarif[0].sag[1] = [4, 39]; // karşı test: MAK'ın satır 4-13 sağ sınırı 1 px
  for (const p of tarif) {
    if (p.bosluk != null) { kalem += p.bosluk; continue; }
    const k = KAYNAK[p.f], img = kaynak[k[0]], [, X, Y, W, Hk] = k, aile = p.f.split('-')[1], pal = palet(img, k);
    const sinir = (dizi, v, satir) => { for (const [y, x] of dizi || []) if (satir >= y) v = x; return v; };
    const dy = p.dy ?? 0; kalem += p.kay ?? 0;
    const solT = sinir(p.sol, p.x0, TABAN - dy), sagT = sinir(p.sag, p.x1, TABAN - dy), ox = kalem - solT;
    for (let yr = p.y0 ?? 0; yr < Hk; yr++) {
      for (let x = Math.max(sinir(p.sol, p.x0, yr), 0); x < Math.min(sinir(p.sag, p.x1, yr), W); x++) {
        const d = ((Y + yr) * img.w + X + x) * 4; if (!img.px[d + 3]) continue;
        const r = pal.indexOf(img.px.readUInt32BE(d)) + 1; if (r === 1) continue; // kenar alınmaz, yeniden çizilir
        tuval.set(`${x + ox},${yr + dy}`, Math.min(tonEsle(r, aile, tur, boz), P.length)); // EN 8 ton → hedefin en açığı
      }
    }
    kalem += sagT - solT;
  }
  const xs = [...tuval.keys()].map((k) => +k.split(',')[0]), minx = Math.min(...xs), w = Math.max(...xs) - minx + 3;
  const out = { w, h: H, px: Buffer.alloc(w * H * 4) }, dolu = new Set();
  const koy = (x, y, c) => out.px.writeUInt32BE(((c >>> 8) << 8 | 255) >>> 0, (y * w + x) * 4);
  for (const [k, r] of tuval) {
    const [x, y] = k.split(',').map(Number); if (y < 0 || y >= H) continue;
    koy(x - minx + 1, y, P[r - 1]); dolu.add(`${x - minx + 1},${y}`);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    if (dolu.has(`${x},${y}`)) continue;
    let kenar = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((boz !== 'kenar' || !a !== !b) && dolu.has(`${x + a},${y + b}`)) kenar = true;
    if (kenar) koy(x, y, P[0]);
  }
  return out;
}

const dokuAc = (buf) => { const kabuk = xnbAc(buf), ic = icerikOku(kabuk.ham); return { kabuk, ic, img: dokuRgba(ic.nesne) }; };
const kes = (img, { x, y, w, h }) => {
  const px = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j++) img.px.copy(px, j * w * 4, ((y + j) * img.w + x) * 4, ((y + j) * img.w + x + w) * 4);
  return { w, h, px };
};

// Denetimsiz üretim (karşı testler bunu `boz` ile çağırır): yeni atlas, kare dikdörtgenleri, yeni XNB.
function derle(girdi, boz) {
  const lt = dokuAc(girdi.locToast), kaynak = { locToast: lt.img, levelUp: dokuAc(girdi.levelUp).img };
  const yeni = { w: lt.img.w, h: lt.img.h, px: Buffer.from(lt.img.px) }, kareler = [];
  for (const k of TR_KARELER) {
    const c = kareCiz(k.tur, kaynak, boz), y = boz === 'yer' && k.tur === 'kum' ? 95 : k.y; // karşı test: dolu alana
    for (let j = 0; j < c.h; j++) c.px.copy(yeni.px, ((y + j) * yeni.w + k.x) * 4, j * c.w * 4, (j + 1) * c.w * 4);
    kareler.push({ kare: k.kare, tur: k.tur, x: k.x, y, w: c.w, h: c.h });
  }
  if (boz === 'eski') yeni.px[(10 * yeni.w + 10) * 4] ^= 1; // karşı test: eski bir pikseli değiştir
  const nesne = { ...lt.ic.nesne, bicim: 0, w: yeni.w, h: yeni.h, mipler: [yeni.px] };
  const xnb = xnbYaz(icerikYaz({ okuyucular: lt.ic.okuyucular, nesne }), lt.kabuk);
  return { xnb, kareler, eski: lt.img, yeni };
}

// Eski ve yeni atlası karşılaştırır, tutmayan her şeyi listeler: (a) kimlik: kare TR_KARELER'deki yerde ve boyda, pikseli
// onaylı özetle (onayli verilirse onaylı PNG'yle piksel piksel) aynı; (b) kare alanları dışında her piksel aynı;
// (c) kare alanı 1 px çerçevesiyle eskide boştu (alfa 0) ve kareler birbirine değmiyor.
function farklar(eski, yeni, kareler, onayli = []) {
  const h = [];
  if (yeni.w !== eski.w || yeni.h !== eski.h) return [`atlas boyu ${eski.w}x${eski.h} → ${yeni.w}x${yeni.h}`];
  kareler.forEach((k, i) => {
    const t = TR_KARELER[i];
    if (k.kare !== t.kare || k.x !== t.x || k.y !== t.y || k.w !== t.w || k.h !== t.h) h.push(`(a) kare ${t.kare} yeri/boyu ${JSON.stringify(k)}`);
    if (k.x + k.w > yeni.w || k.y + k.h > yeni.h) return h.push(`(a) kare ${k.kare} atlastan taşıyor`);
    const c = kes(yeni, k), o = onayli[i];
    if (sha(c.px) !== t.ozet) h.push(`(a) kare ${k.kare} (${t.metin}) pikseli onaylı özetten farklı`);
    if (o) {
      let fark = 0; if (o.w !== c.w || o.h !== c.h) fark = -1; else for (let p = 0; p < c.px.length; p += 4) if (c.px.readUInt32BE(p) !== o.px.readUInt32BE(p)) fark++;
      if (fark) h.push(`(a) kare ${k.kare} onaylı PNG'den ${fark < 0 ? `boyca (${c.w}x${c.h} ≠ ${o.w}x${o.h})` : `${fark} pikselde`} farklı`);
    }
  });
  const icinde = (x, y, k, pay = 0) => x >= k.x - pay && x < k.x + k.w + pay && y >= k.y - pay && y < k.y + k.h + pay;
  let degisen = 0, doluAlan = 0;
  for (let y = 0; y < yeni.h; y++) for (let x = 0; x < yeni.w; x++) {
    const d = (y * yeni.w + x) * 4;
    if (!kareler.some((k) => icinde(x, y, k)) && yeni.px.readUInt32BE(d) !== eski.px.readUInt32BE(d)) degisen++;
    if (kareler.some((k) => icinde(x, y, k, 1)) && eski.px[d + 3]) doluAlan++;
  }
  if (degisen) h.push(`(b) yeni kareler dışında ${degisen} piksel değişmiş`);
  if (doluAlan) h.push(`(c) yeni kare alanında (1 px çerçeveyle) eskide ${doluAlan} dolu piksel vardı`);
  for (let i = 0; i < kareler.length; i++) for (let j = i + 1; j < kareler.length; j++) {
    const a = kareler[i], b = kareler[j];
    if (a.x - 1 < b.x + b.w && b.x - 1 < a.x + a.w && a.y - 1 < b.y + b.h && b.y - 1 < a.y + a.h) h.push(`(c) kare ${a.kare} ile ${b.kare} değiyor`);
  }
  return h;
}

// Kurulumun kullanacağı işlev. Girdi: kullanıcının ORİJİNAL LocToastLatin.xnb ve LevelUp.xnb'si (Buffer).
// Dönüş: { xnb: kare 15-17 eklenmiş sıkıştırmasız LocToastLatin.xnb (Color, 256x256), kareler: [{kare, tur, x, y, w, h}] }.
// Girdi beklenen sürüm değilse ya da çıktı onaylı önizlemeyle aynı çıkmazsa hata atar. (`boz` yalnız karşı test için.)
export function locToastYamala({ locToast, levelUp }, { boz } = {}) {
  for (const [ad, b] of [['locToast', locToast], ['levelUp', levelUp]]) {
    if (sha(b) !== SHA[ad]) throw new Error(`${path.basename(REL[ad])}: sha256 tarifteki değil (oyun güncellenmiş ya da dosya zaten yamalı); koordinatlar kayabilir, durdum`);
  }
  const d = derle({ locToast, levelUp }, boz), h = farklar(d.eski, d.yeni, d.kareler);
  if (h.length) throw new Error(`LocToastLatin yaması tutmadı: ${h.join(' · ')}`);
  return { xnb: d.xnb, kareler: d.kareler };
}

// ---------------------------------------------------------------- komut satırı
const girdiOku = () => ({ locToast: fs.readFileSync(orijinal(REL.locToast)), levelUp: fs.readFileSync(orijinal(REL.levelUp)) });
const ONAYLI = path.join(KOK, 'ham/onizleme/harf');
const onayliOku = () => TR_KARELER.map((k) => {
  const f = path.join(ONAYLI, `TR-bildirim-${k.tur}-${k.metin.replace(/[^A-Z]+/g, '_')}.png`);
  return fs.existsSync(f) ? pngOku(f) : null;
});

// Diske yazılmış (ya da bellekteki) yeni XNB'yi orijinale karşı bağımsızca açıp denetler. Ek olarak: XNB sağlam
// (artık bayt yok, Color) ve yeni kareler oyunun 15 karesinin dikdörtgenine (TextureDatabase.dat) değmiyor.
function denetle(eskiXnb, yeniXnb, kareler, onayli) {
  const h = [], y = dokuAc(yeniXnb), e = dokuAc(eskiXnb);
  if (y.ic.artik) h.push(`yeni XNB'de ${y.ic.artik} bayt artık`);
  if (y.ic.nesne.bicim !== 0 || y.ic.nesne.mipler.length !== 1) h.push('yeni doku tek katmanlı Color değil');
  const xml = zlib.inflateSync(fs.readFileSync(orijinal('Content/TextureDatabase.dat'))).toString('utf8');
  const oyunun = atlasKareleri(xml, 'LocToastLatin');
  if (oyunun.length !== 15) h.push(`TextureDatabase'de LocToastLatin ${oyunun.length} kare (15 bekleniyordu)`);
  for (const k of kareler) for (const [i, o] of oyunun.entries()) {
    if (k.x < o.x + o.w && o.x < k.x + k.w && k.y < o.y + o.h && o.y < k.y + k.h) h.push(`(c) kare ${k.kare} oyunun kare ${i} dikdörtgenine değiyor`);
  }
  return h.concat(farklar(e.img, y.img, kareler, onayli));
}

function uret(cikis) {
  if (!cikis) { console.log('kullanım: node tools/bildirim.mjs uret <çıkış-klasörü>'); process.exit(2); }
  // Oyun klasörüne yazan tek araç oyuna-kur.mjs (CLAUDE.md → Harita).
  if ((path.resolve(cikis) + path.sep).toLowerCase().startsWith(path.resolve(OYUN).toLowerCase() + path.sep)) throw new Error('oyun klasörüne yazılmaz');
  const girdi = girdiOku(), { xnb, kareler } = locToastYamala(girdi);
  const f = path.resolve(cikis, REL.locToast), jf = f.replace(/\.xnb$/, '-kareler.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, xnb); fs.writeFileSync(jf, JSON.stringify(kareler, null, 2) + '\n');
  console.log(`yazıldı: ${f} (${xnb.length} bayt, sıkıştırmasız; orijinal ${girdi.locToast.length} bayt LZX)`);
  console.log(`yazıldı: ${jf}`);
  for (const k of kareler) console.log(`  kare ${k.kare} ${k.tur}: x=${k.x} y=${k.y} ${k.w}x${k.h}`);
  const h = denetle(girdi.locToast, fs.readFileSync(f), JSON.parse(fs.readFileSync(jf, 'utf8')), onayliOku());
  if (h.length) { console.log('DENETİM: TUTMADI\n  ' + h.join('\n  ')); process.exit(1); }
  console.log('DENETİM: TAMAM (diske yazılan geri okundu: kareler onaylı önizlemeyle aynı, eski pikseller yerinde, yeni alan eskide boştu)');
}

function sina() {
  let kotu = 0;
  const sonuc = (tuttu, ad, ayrinti) => { if (!tuttu) kotu++; console.log(`${tuttu ? 'TUTTU  ' : 'TUTMADI'} ${ad}: ${ayrinti}`); };
  const girdi = girdiOku(), onayli = onayliOku();
  if (onayli.some((o) => !o)) sonuc(false, 'onaylı PNG', `${ONAYLI} altında eksik: kimlik yalnız özetle ölçülebilir`);
  // 1. Gerçek üretim: (a) kimlik (b) değişmezlik (c) boşluk, bağımsız açılmış XNB üstünde
  try {
    const { xnb, kareler } = locToastYamala(girdi), h = denetle(girdi.locToast, xnb, kareler, onayli);
    sonuc(h.length === 0, 'üretim (a)(b)(c)', h.length ? h.join(' · ') : `kare 15-17 onaylı PNG'lerle piksel piksel aynı, ${kareler.map((k) => `${k.w}x${k.h}@${k.x},${k.y}`).join(' ')}; kalan atlas aynı; alan eskide boştu`);
  } catch (e) { sonuc(false, 'üretim', `araç durdu: ${e.message}`); }
  // 2. (d) sha256 tutmayan girdi: araç durmalı
  for (const ad of ['locToast', 'levelUp']) {
    const b = Buffer.from(girdi[ad]); b[b.length - 1] ^= 1;
    let durdu = false; try { locToastYamala({ ...girdi, [ad]: b }); } catch (e) { durdu = /sha256/.test(e.message); }
    sonuc(durdu, `(d) ${ad} bir baytı değişik`, durdu ? 'araç durdu' : 'ARAÇ DURMADI');
  }
  // 3. Karşı testler: aracın bir parçası bilerek bozulur; sınamanın denetimi (piksele bakarak) yakalamalı ve araç durmalı
  for (const [boz, ne] of [['ton', 'kırmızı→mavi ton eşlemesinde 3↔4'], ['kesim', 'MAK kesiminin bir sınırı 1 px'],
    ['kenar', 'kenar 4-komşu'], ['yer', 'kum karesi dolu alana (y=95)'], ['eski', 'atlasın eski bir pikseli']]) {
    const d = derle(girdi, boz), hb = denetle(girdi.locToast, d.xnb, d.kareler, onayli);
    let durdu = false; try { locToastYamala(girdi, { boz }); } catch { durdu = true; }
    sonuc(hb.length > 0 && durdu, `karşı test "${ne}"`, `${hb.length ? hb.join(' · ') : 'SINAMA YAKALAMADI'}${durdu ? '' : ' · ARAÇ DURMADI'}`);
  }
  console.log('bu sınama şunu göremez: karelerin oyunda çizildiğini (exe yaması ve TextureDatabase girdisi ayrı iş) · oyunun sıkıştırmasız XNB\'yi okuduğunu · harflerin Türk okura doğal geldiğini (onay gözle verildi)');
  console.log(kotu ? `HÜKÜM: KALDI (${kotu} durum tutmadı)` : 'HÜKÜM: GEÇTİ');
  process.exit(kotu ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [komut, arg] = process.argv.slice(2);
  if (komut === 'uret') uret(arg); else if (komut === 'sina') sina();
  else { console.log('kullanım: node tools/bildirim.mjs uret <çıkış-klasörü> | sina'); process.exit(2); }
}
