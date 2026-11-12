// Türkçe "LEVEL UP" (seviye atlama) resmi: oyun karakter seviye atlayınca LevelUp.xnb atlasından 7 kare oynatır
// (kare 0-2 küçük, 3-6 büyük "LEVEL UP" yazısı, 84x20). Biz atlası 128x256 → 128x512 büyütür, eski satırlara dokunmayız,
// y=256,276,296,316'ya 4 yeni kare (128x20) ekleriz: "Seviye Yükseldi" (oyundaki kare 34-37, 3-6'nın Türkçesi). Exe
// yaması ile TextureDatabase.dat girdisi ayrı iş (tools/tr-yamaci.cs, tools/icerik.mjs).
// Önizleme 12.11.2026'da onaylandı: Fondamento Italic (OFL, bölge başlıklarının aksine "seçilmeyen" yazı
// tipi), degradeli 12 tonluk oyun paleti, alttan yukarı ışık vuruşu, K'nin kolu elle, Ü ve İ'nin noktaları ayrı.
//
//   node tools/seviye.mjs ciz            geliştirme: yazı tipini (yoksa) indirir ve md5'ini doğrular, tools/baslik-ciz.cs'yi
//                                        derler, 4 kareyi çizer, tools/varlik/LevelUp_TR-bizim.png'yi yazar
//   node tools/seviye.mjs uret <cikis>   <cikis>/Content/Overlays/PlayerHUD/LevelUp.xnb + LevelUp-kareler.json
//                                        (girdi: oyunun orijinal LevelUp.xnb'si; oyun klasörüne yazılmaz)
//   node tools/seviye.mjs sina           kimlik · belirlenimcilik · değişmezlik · sha256 · ham/'sız kurulum · karşı testler;
//                                        son satır HÜKÜM: GEÇTİ / KALDI (çıkış 0 / 1)
//
// Dışa açılanlar: levelUpYamala · SEVIYE_KARELER · ATLAS · VARLIK_AD · OYUN_REL · CIKTI_SHA256.
// KURULUM YOLU (levelUpYamala) yalnız Node ister ve yalnız tools/varlik/LevelUp_TR-bizim.png'yi (varlikOku: dosyadan ya
// da SEA'da exe'ye gömülü) okur: yazı tipi, C# çiziciyi ve ham/'ı KULLANMAZ (sina bunu Node izin modeliyle ölçer).
// Çizim (cizimYap) yalnız geliştirmede: ham/onizleme/seviye/onizle3.mjs'nin (git dışı) SABİT parametreli taşınmış hâli;
// GIF, ASCII, ayıklama ve eski seçenekler (yön=sağ, satırmodu, eskipencere...) taşınmadı.
//
// Piksel özeti (SEVIYE_KARELER[].ozet): bir karenin (128x20) ham RGBA baytlarının sha256'sı, satır satır, her piksel
// R,G,B,A sırasıyla, 128*20*4 = 10240 bayt (PNG kodlamasından bağımsız; bildirim.mjs TR_KARELER[].ozet ile aynı kural).
// Sıra: dizi sırası = kare sırası = PNG'de yukarıdan aşağı (kare i, PNG'de y = i*20). Onaylı önizlemeyle piksel piksel
// aynılığı ölçülünce (sina "kimlik") bu özetler koda yazıldı; kurulum ham/ olmadan da gömülü PNG'yi onlarla doğrular.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { orijinal, OYUN } from './oyun-yolu.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba, pngOku, pngKodla, buyut } from './xnb.mjs';
import { varlikOku, derle as ciziciDerle } from './baslik-ciz.mjs';
import { REL, SHA } from './bildirim.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VARLIK = path.join(KOK, 'tools', 'varlik');
const CALISMA = path.join(KOK, 'ham', 'baslik'); // git dışı: yazı tipi, derlenen çizici (baslik-ciz.mjs ile ortak)
export const VARLIK_AD = { bizimPng: 'LevelUp_TR-bizim.png' }; // SEA anahtarı = tools/varlik/ altındaki ad
export const BIZIM_PNG = path.join(VARLIK, VARLIK_AD.bizimPng); // yol yalnız YAZMA ve gösterme için; okuma varlikOku(ad) ile
export const OYUN_REL = REL.levelUp; // 'Content/Overlays/PlayerHUD/LevelUp.xnb'
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

// Atlas: oyunun LevelUp.xnb'si 128x256 (34 kare); biz yalnız aşağı doğru büyütürüz (eski satırlar yerinde).
export const ATLAS = { w: 128, eskiH: 256, yeniH: 512, eskiKareSayisi: 34, yeniKareSayisi: 38 };
const KARE_W = 128, KARE_H = 20, KARE_SAYISI = 4, ILK_Y = 256;
// Onaylı önizlemenin 4 karesi (oyundaki 3-6'nın yerine geçen Türkçe kareler). ozet: yukarıdaki piksel özeti kuralı.
// Atlas satırı: kare 34+i, x=0, y=256+20*i, 128x20 (TextureDatabase.dat girdisi: Count=4 RowWidth=1 FrameSize 128x20,
// StartCoordinates {X:0 Y:256}, FrameCount 34 → 38).
export const SEVIYE_KARELER = [
  { kare: 34, anim: 3, x: 0, y: 256, w: 128, h: 20, ozet: 'b7275f7b315068993d864c06d510b430f321c8beeed131087a5cfc6085cabd26' },
  { kare: 35, anim: 4, x: 0, y: 276, w: 128, h: 20, ozet: '185a8176d5ec3e79768451f37cb4913036ca70a9a0a84e289bfe08e65ba61739' },
  { kare: 36, anim: 5, x: 0, y: 296, w: 128, h: 20, ozet: 'b84632f4fb65666caa75c1bfc3291aca46fde893bdbe10fc2f9efee0d1809b65' },
  { kare: 37, anim: 6, x: 0, y: 316, w: 128, h: 20, ozet: 'f8d1b11c3aa87a5d6a9f8e4bfd71ce2f138b6a6d8214f9c0231f906c771011bf' },
];
// Üretilen LevelUp.xnb'nin (sıkıştırmasız, 128x512) sha256'sı: sina'da gerileme dedektörü (çıktı girdi + gömülü PNG + xnb.mjs yazıcısının işlevidir).
export const CIKTI_SHA256 = '23d3d3c7ab02879ec64108c75afb48008ce985aac336f79777d80250bda2bfe9';

// ---------------------------------------------------------------- ortak: palet, PNG, özet
const lum = (c) => 0.299 * (c >>> 24) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
// Oyunun LevelUp atlasındaki "LEVEL UP" karelerinin (x<84, y<80) renkleri aydınlığa göre sıralı: 12 ton, 0 = kenar … 11 = en açık.
function paletOku(img) {
  const say = new Set();
  for (let y = 0; y < 80; y++) for (let x = 0; x < 84; x++) { const d = (y * img.w + x) * 4; if (img.px[d + 3]) say.add(img.px.readUInt32BE(d)); }
  const pal = [...say].sort((a, b) => lum(a) - lum(b));
  if (pal.length !== 12) throw new Error('palet 12 ton değil: ' + pal.length);
  return pal;
}
const kareDilimi = (px, i) => px.subarray(i * KARE_W * KARE_H * 4, (i + 1) * KARE_W * KARE_H * 4);
const kareOzet = (px, i) => sha256(kareDilimi(px, i));

// Oyunun dosyasını aç ve denetle → { kabuk, ic, img }
function atlasAc(xnb, h, ad) {
  const kabuk = xnbAc(xnb), ic = icerikOku(kabuk.ham), t = ic.nesne;
  if (ic.artik || t?.tur !== 'Texture2D' || t.bicim !== 0 || t.w !== ATLAS.w || t.h !== h || t.mipler.length !== 1)
    throw new Error(`${ad}: ${ATLAS.w}x${h} tek katmanlı Color doku değil (${t?.tur} biçim ${t?.bicim} ${t?.w}x${t?.h}, ${t?.mipler?.length} katman, artık ${ic.artik})`);
  return { kabuk, ic, img: dokuRgba(t) };
}

// Gömülü/depodaki PNG'yi oku ve sabit özetle doğrula → { buf, png }. Özet tutmazsa HATA (kurulum durur).
function bizimOku(buf) {
  const png = pngOku(buf);
  if (png.w !== KARE_W || png.h !== KARE_H * KARE_SAYISI) throw new Error(`${VARLIK_AD.bizimPng}: ${png.w}x${png.h} (beklenen ${KARE_W}x${KARE_H * KARE_SAYISI})`);
  SEVIYE_KARELER.forEach((k, i) => {
    const o = kareOzet(png.px, i);
    if (o !== k.ozet) throw new Error(`${VARLIK_AD.bizimPng}: kare ${k.kare} pikseli onaylı özetten farklı (özet ${o}, beklenen ${k.ozet})`);
  });
  return { buf, png };
}

// ---------------------------------------------------------------- kurulum yolu (yalnız Node, ham/ ve yazı tipi YOK)
// Eski atlas (128x256) + 4 yeni kare → 128x512. boz: yalnız karşı test (sina) için bilerek bozar.
function birlestir(eski, bizim, boz) {
  const px = Buffer.alloc(ATLAS.w * ATLAS.yeniH * 4);
  eski.px.copy(px, 0, 0, ATLAS.w * ATLAS.eskiH * 4);
  if (boz === 'eski') px[(10 * ATLAS.w + 10) * 4] ^= 1; // karşı test: eski bir pikseli değiştir
  SEVIYE_KARELER.forEach((k, i) => {
    const y = boz === 'kayma' && i === 1 ? k.y + 1 : k.y; // karşı test: ikinci kare 1 satır aşağıda
    kareDilimi(bizim.px, i).copy(px, (y * ATLAS.w) * 4);
  });
  if (boz === 'sizinti') px[(400 * ATLAS.w + 5) * 4 + 3] = 255; // karşı test: boş olması gereken alana piksel
  return { w: ATLAS.w, h: ATLAS.yeniH, px };
}

// Bağımsız denetim: yeni XNB'yi diskten/bellekten SIFIRDAN açar, eskiyle ve gömülü PNG'yle karşılaştırır. Dönüş: tutmayanların listesi.
// bizimBuf verilirse kareler onunla da piksel piksel kıyaslanır (özetten bağımsız ikinci yol).
function denetle(eskiXnb, yeniXnb, kareler, bizimBuf) {
  const h = [], e = atlasAc(eskiXnb, ATLAS.eskiH, 'eski LevelUp.xnb');
  let y;
  try { y = atlasAc(yeniXnb, ATLAS.yeniH, 'yeni LevelUp.xnb'); } catch (err) { return [err.message]; }
  if (y.kabuk.sikistirilmis) h.push('yeni XNB sıkıştırılmış');
  if (y.kabuk.platform !== e.kabuk.platform || y.kabuk.surum !== e.kabuk.surum) h.push(`XNB platform/sürüm oyunun dosyasından farklı: ${y.kabuk.platform}${y.kabuk.surum} ≠ ${e.kabuk.platform}${e.kabuk.surum}`);
  if (JSON.stringify(y.ic.okuyucular) !== JSON.stringify(e.ic.okuyucular)) h.push('içerik okuyucuları oyunun dosyasından farklı');
  const eskiBayt = ATLAS.w * ATLAS.eskiH * 4;
  if (Buffer.compare(y.img.px.subarray(0, eskiBayt), e.img.px) !== 0) {
    let n = 0; for (let p = 0; p < eskiBayt; p += 4) if (y.img.px.readUInt32BE(p) !== e.img.px.readUInt32BE(p)) n++;
    h.push(`eski 256 satırdan ${n} piksel değişmiş`);
  }
  if (kareler.length !== KARE_SAYISI) h.push(`${kareler.length} kare bildirilmiş (${KARE_SAYISI} bekleniyordu)`);
  const bizim = bizimBuf ? pngOku(bizimBuf) : null;
  SEVIYE_KARELER.forEach((k, i) => {
    const b = kareler[i];
    if (!b || b.kare !== k.kare || b.x !== k.x || b.y !== k.y || b.w !== k.w || b.h !== k.h) { h.push(`kare ${k.kare} yeri/boyu ${JSON.stringify(b)} (beklenen y=${k.y} ${k.w}x${k.h})`); return; }
    const piksel = y.img.px.subarray((k.y * ATLAS.w + k.x) * 4, (k.y * ATLAS.w + k.x) * 4 + ATLAS.w * KARE_H * 4); // x=0, tam genişlik: kare satırları bitişik
    if (sha256(piksel) !== k.ozet) h.push(`kare ${k.kare} (y=${k.y}) atlasta onaylı özetten farklı`);
    if (bizim && Buffer.compare(piksel, kareDilimi(bizim.px, i)) !== 0) h.push(`kare ${k.kare} gömülü PNG'den farklı`);
  });
  const sonKare = ILK_Y + KARE_SAYISI * KARE_H; // 336
  let sizinti = 0;
  for (let p = sonKare * ATLAS.w * 4; p < y.img.px.length; p++) if (y.img.px[p]) { sizinti++; }
  if (sizinti) h.push(`yeni karelerin altındaki boş alanda ${sizinti} sıfırdan farklı bayt var (y ≥ ${sonKare})`);
  return h;
}

function yamala(oyununXnb, pngBuf, boz) {
  const ozet = sha256(oyununXnb);
  if (ozet !== SHA.levelUp) throw new Error(`${path.basename(OYUN_REL)}: sha256 tarifteki değil (sha256 ${ozet}, beklenen ${SHA.levelUp}; oyun güncellenmiş ya da dosya zaten yamalı), durdum`);
  const oyun = atlasAc(oyununXnb, ATLAS.eskiH, path.basename(OYUN_REL)), { png } = bizimOku(pngBuf);
  // Palet: gömülü PNG'nin her opak pikseli oyunun kendi 12 renginden biri (başka dosyayla karışırsa bozuk renk basılmasın).
  const pal = new Set(paletOku(oyun.img));
  for (let p = 0; p < png.px.length; p += 4) {
    if (png.px[p + 3] === 0) { if (png.px.readUInt32BE(p) !== 0) throw new Error(`${VARLIK_AD.bizimPng}: şeffaf pikselin rengi sıfır değil`); continue; }
    if (!pal.has(png.px.readUInt32BE(p))) throw new Error(`${VARLIK_AD.bizimPng}: ${p / 4 % png.w},${Math.floor(p / 4 / png.w)} pikselinin rengi oyunun 12 tonundan değil`);
  }
  const yeni = birlestir(oyun.img, png, boz);
  const nesne = { ...oyun.ic.nesne, w: yeni.w, h: yeni.h, mipler: [yeni.px] };
  // Biçim oyunun öteki dosyalarındaki gibi (platform, sürüm, okuyucu aynı), yalnız sıkıştırmasız (LZX sıkıştırıcımız yok, FNA bayrak 0'ı okur).
  const xnb = xnbYaz(icerikYaz({ okuyucular: oyun.ic.okuyucular, nesne }), { platform: oyun.kabuk.platform, surum: oyun.kabuk.surum, bayrak: oyun.kabuk.bayrak });
  const kareler = SEVIYE_KARELER.map(({ kare, x, y, w, h }) => ({ kare, x, y, w, h }));
  const sorun = denetle(oyununXnb, xnb, kareler, pngBuf);
  if (sorun.length) throw new Error(`LevelUp yaması tutmadı: ${sorun.join(' · ')}`);
  return { xnb, kareler };
}

// Kurulumun kullanacağı işlev. Girdi: kullanıcının ORİJİNAL LevelUp.xnb'si (Buffer). Dönüş:
//   { xnb: 4 kare eklenmiş sıkıştırmasız LevelUp.xnb (Color, 128x512), kareler: [{kare, x, y, w, h}] (kare 34-37) }.
// Girdi beklenen sürüm (SHA.levelUp) değilse, gömülü PNG onaylı özetle tutmazsa ya da çıktı denetimi tutmazsa hata atar.
// Yalnız tools/varlik/LevelUp_TR-bizim.png'yi okur. ({ png, boz } yalnız sınama için.)
export function levelUpYamala(oyununXnb, { png, boz } = {}) {
  return yamala(oyununXnb, png ?? varlikOku(VARLIK_AD.bizimPng), boz);
}

// ---------------------------------------------------------------- çizim çekirdeği (yalnız geliştirme: yazı tipi + C# çizici)
const YAZI_TIPI = { // google/fonts'ta dosyaya dokunan son commit'e sabit: main değişse de aynı bayt gelir
  url: 'https://raw.githubusercontent.com/google/fonts/90abd17b4f97671435798b6147b698aa9087612f/ofl/fondamento/Fondamento-Italic.ttf',
  md5: '062dd90e13a609c4ec8f22b057aaeed3',
  yol: path.join(CALISMA, 'yazitipi', 'Fondamento-Italic.ttf'),
  onizleme: path.join(KOK, 'ham', 'onizleme', 'yazitipi', 'indirilen', 'fondamento', 'Fondamento-Italic.ttf'), // önizlemede indirilen, aynı md5
};
// Onaylı parametreler (onizle3.mjs: xs=8 xb=10.4 sx=1 sy=1 carpan=0.8 kuyruk=1.2, geri kalanı onun varsayılanı). Tek yer.
const PARAM = { metin: 'Seviye Yükseldi', xs: 8, xb: 10.4, carpan: 0.8, sx: 1, sy: 1, gap: 1, soz: 5, esik: 90, tur: 11,
  kuyruk: 1.2, yic: 1.5, yorta: 3, ydis: 5, onhiz: 2, dalga: 1.6, ybas: 1, yson: 0.5, noktayok: false, yamayok: false };
const H = 20, OW = 84, PAD = 4, WMAX = 260;

async function yaziTipi(indir) {
  for (const yol of [YAZI_TIPI.yol, YAZI_TIPI.onizleme]) {
    if (!fs.existsSync(yol)) continue;
    if (md5(fs.readFileSync(yol)) !== YAZI_TIPI.md5) throw new Error(`${yol}: md5 tutmuyor; dosyayı silip ciz'i yeniden koşun`);
    return yol;
  }
  if (!indir) return null;
  const r = await fetch(YAZI_TIPI.url);
  if (!r.ok) throw new Error(`yazı tipi indirilemedi: HTTP ${r.status} ${YAZI_TIPI.url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (md5(b) !== YAZI_TIPI.md5) throw new Error(`indirilen yazı tipinin md5'i ${md5(b)} (beklenen ${YAZI_TIPI.md5}); yazılmadı`);
  fs.mkdirSync(path.dirname(YAZI_TIPI.yol), { recursive: true });
  fs.writeFileSync(YAZI_TIPI.yol, b);
  console.log(`yazı tipi indirildi, md5 tuttu: ${path.relative(KOK, YAZI_TIPI.yol)}`);
  return YAZI_TIPI.yol;
}

// baslik-ciz.exe → her harf için kapsama haritası {W, H, kap} (0..255). Girdi: satırlar [[yatayÇarpan, metin], ...].
function kapsamaCiz(exe, ttf, satirlar, xYuk) {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'seviye-'));
  try {
    const txt = path.join(gecici, 'm.txt'), bin = path.join(gecici, 'c.bin');
    fs.writeFileSync(txt, satirlar.map(([c, m]) => `${c}\t${m}`).join('\n'), 'utf8');
    const r = spawnSync(exe, [ttf, String(xYuk), txt, bin], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`baslik-ciz.exe çıkış ${r.status}: ${r.stderr || r.stdout || r.error}`);
    const b = fs.readFileSync(bin), n = b.readInt32LE(0), sonuc = [];
    for (let i = 0, o = 4; i < n; i++) {
      const W = b.readInt32LE(o), Hh = b.readInt32LE(o + 4); o += 8 + 16;
      sonuc.push({ W, H: Hh, kap: Buffer.from(b.subarray(o, o + W * Hh)) }); o += W * Hh;
    }
    return sonuc;
  } finally { fs.rmSync(gecici, { recursive: true, force: true }); }
}

function dilate(g, kx, ky) { // g: bool[][]; yatay sol floor(kx/2) sağ ceil(kx/2); dikey üst floor(ky/2) alt ceil(ky/2)
  const hh = g.length, ww = g[0].length, o = g.map((s) => s.map(() => false));
  for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) if (g[y][x])
    for (let dy = -Math.floor(ky / 2); dy <= Math.ceil(ky / 2); dy++) for (let dx = -Math.floor(kx / 2); dx <= Math.ceil(kx / 2); dx++) { const Y = y + dy, X = x + dx; if (Y >= 0 && Y < hh && X >= 0 && X < ww) o[Y][X] = true; }
  return o;
}
// K'nin sağ üst kolu yazı tipinde kıl ince (kapsama ~60/255): eşik 90'da noktaya düşüyordu (önizlemede K'nin sağ üst kolu nokta gibi görünüyordu, 12.11.2026).
// Denenip bırakılanlar: eşiği düşürmek (kolun üstündeki ince süs de dolgu olur, gövdeyle kol çatı gibi birleşir, K "A" gibi okunur) ve noktanın altından
// kapsamı izlemek (ilk piksel gövdeyle kol arasındaki 1 piksellik boşluğu kapattı, yine çatı). Yerine kol elle çizilir: kalınlaştırılmış K'nin (12x11,
// xs=8 carpan=0.8 sx=1 sy=1) sol üst köşesine göre [satır:sütun-sütun]; kol köşegen iner, gövdeyle 5. satırda birleşir, üstte 1 piksellik çentik kalır.
// Boy tutmazsa HATA (yazı tipi ya da çizici değişmiş demektir).
const YAMA = { K: { boy: [12, 11], hucre: ['2:6-9', '3:6-8', '4:6-7'] } };
function yamala_(c, g) {
  const y = YAMA[c]; if (!y) return g;
  if (g.length !== y.boy[0] || g[0].length !== y.boy[1]) throw new Error(`${c} yaması ${y.boy.join('x')} boy içindi, bu boy ${g.length}x${g[0].length}`);
  for (const h of y.hucre) { const [r, ar] = h.split(':'), [a, z] = ar.split('-').map(Number); for (let x = a; x <= z; x++) g[+r][x] = true; }
  return g;
}
// Noktalı harflerde (Ü, İ) kalınlaştırma noktayı iki kez bozuyordu: Ü'nün iki noktası ham şekilde 1 piksel arayla ayrı (`##.##`), yatay kalınlaştırma (sağa +1)
// arayı kapatıp tek 6 piksellik çubuk yaptı ("Ö"/"O" gibi okundu); dikey kalınlaştırma da noktayı gövdeye yapıştırdı (nokta ile gövde arasındaki 1 satır boşluk
// kayboldu, İ de "l" gibi göründü). Kural: gövdenin üstünde kalan küçük bileşenler (≤ 8 piksel) kalınlaştırmadan ÇIKARILIR, gövde kalınlaşır, sonra noktalar
// sınır kutusuyla DOLU ve kalınlaşmamış geri konur (ham 2x2 → 2x2). K'nin kopuk kolu bu kurala girmez (harf listesi): o YAMA ile elle çizilir.
const NOKTALI = new Set(['Ü', 'İ', 'Ö']);
function noktaAyir(g) { // → { g: noktasız gövde, noktalar: [{x0,x1,y0,y1}] }; 8 bağlantılı bileşenler
  const hh = g.length, ww = g[0].length, no = g.map((s) => s.map(() => -1)), bil = [];
  for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
    if (!g[y][x] || no[y][x] >= 0) continue;
    const b = { px: [], x0: x, x1: x, y0: y, y1: y }, kuyruk = [[x, y]]; no[y][x] = bil.length;
    while (kuyruk.length) {
      const [cx, cy] = kuyruk.pop(); b.px.push([cx, cy]);
      b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && X < ww && Y >= 0 && Y < hh && g[Y][X] && no[Y][X] < 0) { no[Y][X] = bil.length; kuyruk.push([X, Y]); } }
    }
    bil.push(b);
  }
  const govdeUst = Math.min(...bil.filter((b) => b.px.length > 8).map((b) => b.y0));
  const noktalar = bil.filter((b) => b.px.length <= 8 && b.y1 < govdeUst);
  const o = g.map((s) => s.slice());
  for (const n of noktalar) for (const [x, y] of n.px) o[y][x] = false;
  return { g: o, noktalar };
}

const gurultu = (n) => { let h = (n * 374761393 + 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }; // 0-1, sabit tohum: her koşuda aynı

// Üç bant: d ≤ ic çekirdek (krem b) · d ≤ orta (krem a) · d ≤ dis (üç ton aydınlık). d = ışığın ekseninden uzaklık.
function bant(d, t, e) {
  if (d <= e.ic) return t === 0 ? 10 : 11;
  if (d <= e.orta) return t === 0 ? 6 : Math.max(t, 10);
  if (d <= e.dis) return t === 0 ? 3 : Math.min(11, t + 3);
  return t;
}

// girdi: { img (oyunun orijinal LevelUp atlası {w,h,px}), exe (baslik-ciz.exe), ttf }. p: parametreler (yalnız karşı test değiştirir).
// Dönüş: { kareler: 4 × {w,h,px} (kare 3-6'nın Türkçesi), W, metinW, ty0, ty1, yerlestir, tonPayi }.
function cizimYap({ img, exe, ttf }, p = PARAM) {
  const { xs: XS, xb: XB, carpan: CARPAN, sx: SX, sy: SY, gap: GAP, soz: SOZ, esik: ESIK } = p;
  const PAL = paletOku(img); // 12 ton: 0 = kenar … 11 = en açık
  const TON = new Map(PAL.map((c, i) => [c, i]));
  const origTon = (k) => Array.from({ length: H }, (_, y) => Array.from({ length: OW }, (_, x) => { const d = ((k * 20 + y) * img.w + x) * 4; return img.px[d + 3] ? TON.get(img.px.readUInt32BE(d)) : -1; }));
  const T6 = origTon(3); // orijinal son kare (kare 6)

  // orijinal kare 6'nın profili: satır × (kenar 1 | kenar 2 | kenar 3+) ortalama ton. Koşu = satırda ardışık dolgu (ton ≥ 1) pikselleri
  const topK = { e1: Array(H).fill(0), e2: Array(H).fill(0), e3: Array(H).fill(0) }, sayK = { e1: Array(H).fill(0), e2: Array(H).fill(0), e3: Array(H).fill(0) };
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < OW) {
      if (T6[y][x] < 1) { x++; continue; }
      let z = x; while (z + 1 < OW && T6[y][z + 1] >= 1) z++;
      for (let i = x; i <= z; i++) { const d = Math.min(i - x + 1, z - i + 1), k = d === 1 ? 'e1' : d === 2 ? 'e2' : 'e3'; topK[k][y] += T6[y][i]; sayK[k][y]++; }
      x = z + 1;
    }
  }
  const prof = (k) => { // seyrek satırları (2-5, yalnız büyük harfler) ±1 satırdan tamamla
    const o = Array(H).fill(null);
    for (let y = 1; y < 19; y++) { let s = 0, n = 0; for (let j = y - 1; j <= y + 1; j++) if (j >= 1 && j < 19 && (sayK[k][y] === 0 || j === y)) { s += topK[k][j]; n += sayK[k][j]; } if (n === 0) for (let j = y - 2; j <= y + 2; j++) if (j >= 1 && j < 19) { s += topK[k][j]; n += sayK[k][j]; } o[y] = n ? s / n : null; }
    return o;
  };
  const P1 = prof('e1'), P2 = prof('e2'), P3raw = prof('e3');
  const P3 = P3raw.map((v, y) => (sayK.e3[y] >= 4 && v !== null ? v : P2[y])); // derin dolgu verisi seyrekse (satır < 4 örnek) kenar-2 profili
  const PM = Array.from({ length: H }, (_, y) => { const v = T6[y].filter((t) => t >= 1); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }); // orijinal satır ortalaması (tüm dolgu)
  const profAl = (P, yf) => { // gerçek sayılı orijinal satır için doğrusal aradeğer; 6-17 dışında en yakın satır
    const a = Math.max(1, Math.min(18, Math.floor(yf))), b = Math.min(18, a + 1), t = Math.max(0, Math.min(1, yf - a));
    const va = P[a] ?? P[b], vb = P[b] ?? P[a]; return va + (vb - va) * t;
  };

  // ---- harfler: tek tek çiz, eşikle, kalınlaştır
  const buyukHarf = (c) => c.toLocaleUpperCase('tr');
  const parcalar = []; // {c, buyuk, yeniSoz}
  for (const s of p.metin.trim().split(/\s+/)) [...s].forEach((c, i) => parcalar.push({ c: buyukHarf(c), buyuk: i === 0, yeniSoz: i === 0 }));
  if (parcalar.map((q) => q.c).join('') !== 'SEVİYEYÜKSELDİ') throw new Error('harf listesi beklenen değil (ICU tr yerel ayarı yok mu?): ' + parcalar.map((q) => q.c).join(''));
  const kume = (buyuk) => [...new Set(['E', ...parcalar.filter((q) => q.buyuk === buyuk).map((q) => q.c)])];
  function harfler(buyuk, xy) { // c → {g (kırpılmış bool[][]), x0, y0 (tuval satırı), alt (E'nin alt satırı, aynı tuvalde)}
    const liste = kume(buyuk), sonuc = kapsamaCiz(exe, ttf, liste.map((c) => [CARPAN, c]), xy), harita = new Map();
    let altE = -1;
    liste.forEach((c, i) => {
      const m = sonuc[i];
      let g = Array.from({ length: m.H + 2 * PAD }, (_, y) => Array.from({ length: m.W + 2 * PAD }, (_, x) => { const Y = y - PAD, X = x - PAD; return Y >= 0 && Y < m.H && X >= 0 && X < m.W && m.kap[Y * m.W + X] >= ESIK; }));
      let noktalar = [];
      if (NOKTALI.has(c) && !p.noktayok) ({ g, noktalar } = noktaAyir(g));
      g = dilate(g, SX, SY);
      for (const n of noktalar) for (let y = n.y0; y <= n.y1; y++) for (let x = n.x0; x <= n.x1; x++) g[y][x] = true; // noktalar dolu, kalınlaşmamış
      let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
      g.forEach((s, y) => s.forEach((v, x) => { if (v) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }));
      const kirpik = g.slice(y0, y1 + 1).map((s) => s.slice(x0, x1 + 1));
      harita.set(c, { g: p.yamayok ? kirpik : yamala_(c, kirpik), x0, y0, y1 });
      if (c === 'E') altE = y1;
    });
    return { harita, altE, ustE: harita.get('E').y0 };
  }
  const kucuk = harfler(false, XS), buyukH = harfler(true, XB);
  const HB = buyukH.altE - buyukH.ustE + 1; // büyük E'nin satır sayısı
  const OLCEK = 15 / (HB - 1); // çerçeve satırı → orijinal satır oranı (orijinalde büyük harf satır 2-17)

  // ---- dizgi: satır profiline göre kenetle
  const fill = Array.from({ length: H }, () => Array(WMAX).fill(false)), sag = Array(H).fill(-1e9);
  let ilk = true;
  const yerlestir = [];
  for (const q of parcalar) {
    const set = q.buyuk ? buyukH : kucuk, h = set.harita.get(q.c);
    if (!h) throw new Error('harf yok: ' + q.c);
    const oy = 17 - set.altE; // E'nin alt satırı çerçevede 17
    const sol = Array(H).fill(null);
    h.g.forEach((s, j) => { const y = h.y0 + j + oy; const x = s.indexOf(true); if (x >= 0 && y >= 0 && y < H) sol[y] = x; });
    let dx = ilk ? 2 : -1e9;
    if (!ilk) for (let y = 0; y < H; y++) if (sol[y] !== null && sag[y] > -1e8) dx = Math.max(dx, sag[y] + 1 + (q.yeniSoz ? SOZ : GAP) - sol[y]);
    if (!ilk && dx < -1e8) dx = Math.max(...sag) + 1 + (q.yeniSoz ? SOZ : GAP) - Math.min(...sol.filter((v) => v !== null));
    h.g.forEach((s, j) => { const y = h.y0 + j + oy; if (y < 0 || y >= H) return; s.forEach((v, x) => { if (v && x + dx < WMAX) { fill[y][x + dx] = true; sag[y] = Math.max(sag[y], x + dx); } }); });
    yerlestir.push(`${q.c}@${dx}`);
    ilk = false;
  }
  let tx0 = 1e9, tx1 = -1, ty0 = 1e9, ty1 = -1;
  fill.forEach((s, y) => s.forEach((v, x) => { if (v) { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); } }));
  const metinW = tx1 - tx0 + 1;
  const W = Math.max(OW, 2 * Math.ceil((metinW + 6) / 2));
  if (W !== KARE_W) throw new Error(`çerçeve genişliği ${W} çıktı (metin ${metinW} px); atlas ve exe yaması ${KARE_W} için kuruldu`);
  const kay = Math.round((W - metinW) / 2) - tx0; // metni çerçeveye ortala (kenar dahil)
  if (ty0 < 2 || ty1 > 17) throw new Error(`dolgu satır ${ty0}-${ty1}; orijinal 2-17 aralığında, kenar için 1 satır boşluk gerek`);
  const F = Array.from({ length: H }, () => Array(W).fill(false));
  fill.forEach((s, y) => s.forEach((v, x) => { const X = x + kay; if (v && X >= 0 && X < W) F[y][X] = true; }));
  const f = (x, y) => !!F[y]?.[x];

  // ---- boyama: koşuda kenar 1 → e1 profili, kenar 2 → e2, 3+ → e3; satır, orijinal satıra gerçek sayıyla eşlenir
  const tonKare = Array.from({ length: H }, () => Array(W).fill(-1));
  for (let y = 0; y < H; y++) {
    const yf = 17 - (17 - y) * OLCEK; // orijinal satır
    let x = 0;
    while (x < W) {
      if (!F[y][x]) { x++; continue; }
      let z = x; while (z + 1 < W && F[y][z + 1]) z++;
      for (let i = x; i <= z; i++) {
        const d = Math.min(i - x + 1, z - i + 1);
        tonKare[y][i] = Math.max(1, Math.min(11, profAl(d === 1 ? P1 : d === 2 ? P2 : P3, yf)));
      }
      x = z + 1;
    }
  }
  { // ton dağılımı eşlemesi. Dolgu pikselleri ham profil değerine göre sıralanır (eşitlikte 2B derinlik: harfin içine
    // doğru parlak, orijinalde b vuruşun ortasında), sonra orijinal kare 6'nın dolgu histogramına göre ton atanır. Sıra korunduğu için satır düzeni bozulmaz.
    const hedefH = Array(12).fill(0); T6.forEach((s) => s.forEach((t) => { if (t >= 1) hedefH[t]++; }));
    const topH = hedefH.reduce((a, b) => a + b, 0), kum = []; let acc = 0; for (let t = 1; t <= 11; t++) { acc += hedefH[t]; kum[t] = acc / topH; }
    const R = 6, derin = (y, x) => { let m = R; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (!f(x + b, y + a)) m = Math.min(m, Math.hypot(a, b)); return m; };
    const lst = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tonKare[y][x] >= 1) lst.push({ y, x, taban: tonKare[y][x] + 0.001 * derin(y, x), t: 1 });
    // satır başına anahtar kayması: dağılım eşlemesi sonrası satır ortalamasının orijinalden sapması geri beslenir
    // (12 turda Ü/İ noktaları ayrılınca ton 2 kayboldu: eşit anahtarlı grup atlıyor; 8-16 arası ölçüldü, 11 en küçük sapma ve 11/11 ton)
    const sapma = Array(H).fill(0);
    for (let tur = 0; tur < p.tur; tur++) {
      for (const q of lst) q.k = Math.round((q.taban + sapma[q.y]) * 1e6) / 1e6;
      lst.sort((a, b) => a.k - b.k);
      for (let i = 0; i < lst.length;) { // eşit anahtarlı grup aynı ton alır (orta sıra): sol-sağ yapay eğim oluşmaz
        let j = i; while (j + 1 < lst.length && lst[j + 1].k === lst[i].k) j++;
        const r = ((i + j) / 2 + 0.5) / lst.length; let t = 1; while (t < 11 && kum[t] < r) t++;
        for (let m = i; m <= j; m++) lst[m].t = t;
        i = j + 1;
      }
      const top = Array(H).fill(0), say2 = Array(H).fill(0); for (const q of lst) { top[q.y] += q.t; say2[q.y]++; }
      for (let y = 0; y < H; y++) { if (say2[y] < 6) continue; const hedef = profAl(PM, 17 - (17 - y) * OLCEK), d = hedef - top[y] / say2[y]; sapma[y] += 0.7 * d; }
    }
    for (const q of lst) tonKare[q.y][q.x] = q.t;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tonKare[y][x] >= 1) tonKare[y][x] = Math.round(tonKare[y][x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { // koyu kenar: dolguyla 8-komşu olan boş pikseller
    if (tonKare[y][x] >= 0) continue;
    let k = false; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (f(x + a, y + b)) k = true;
    if (k) tonKare[y][x] = 0;
  }

  // ---- ışık vuruşu (kare 3-5; kare 6 düz). İstenen etki: tabandan tepeye doğru, enerji saçan bir parlama:
  // yatay bir ön kenar kare 3 → 4 → 5'te yazının tabanından tepesine çıkar. Ön kenar sütun sütun dalgalanır (alev gibi, kimi sütun öne fırlar),
  // önü keskin söner (onhiz), ARKASINDA kuyruk kalır (kuyruk). Bantlar: çekirdek krem b, orta krem a, dış üç ton aydınlık.
  const YK = { ic: p.yic, orta: p.yorta, dis: p.ydis, onhiz: p.onhiz, kuyruk: p.kuyruk, dal: p.dalga, bas: p.ybas, son: p.yson };
  let py0 = 1e9, py1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tonKare[y][x] >= 0) { py0 = Math.min(py0, y); py1 = Math.max(py1, y); }
  const isikla = (no, x, y, t) => {
    const alt = py1 + YK.bas, ust = py0 - YK.son;
    const taban = alt - ((no - 3) / 2) * (alt - ust);
    const sal = YK.dal * (0.6 * Math.sin(x * 0.35 + no * 2) + 0.8 * (gurultu((x >> 1) + no * 131) - 0.5) * 2);
    const s = y - (taban + sal); // s < 0: ön kenarın önü (henüz ışık gelmedi) · s > 0: ön kenar geçti (kuyruk)
    return bant(s < 0 ? -s * YK.onhiz : s * YK.kuyruk, t, YK);
  };
  const kareUret = (no) => {
    const px = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t = tonKare[y][x]; if (t < 0) continue;
      if (no < 6) t = isikla(no, x, y, t);
      px.writeUInt32BE(PAL[t], (y * W + x) * 4);
    }
    return { w: W, h: H, px };
  };
  const kareler = [3, 4, 5, 6].map(kareUret);

  // ton payı (yalnız bilgi): orijinal kare 6 ile yan yana
  const paylar = (T) => {
    const hist = Array(12).fill(0); T.forEach((s) => s.forEach((t) => { if (t >= 0) hist[t]++; }));
    const dolgu = hist.slice(1).reduce((a, b) => a + b, 0), yuzde = (a, b) => (100 * hist.slice(a, b + 1).reduce((s, q) => s + q, 0) / dolgu).toFixed(0).padStart(3) + '%';
    return `dolgu ${String(dolgu).padStart(4)} px · koyu(1-3) ${yuzde(1, 3)} · orta(4-6) ${yuzde(4, 6)} · açık(7-9) ${yuzde(7, 9)} · krem(a-b) ${yuzde(10, 11)} · kullanılan ton ${hist.slice(1).filter((n) => n).length}/11`;
  };
  return { kareler, W, metinW, ty0, ty1, yerlestir, tonPayi: { orijinal: paylar(T6), benim: paylar(tonKare) } };
}

// 4 kareyi 128x80'lik tek PNG resmine alt alta dizer (kare i, y = i*20).
const kareleriBirlestir = (kareler) => {
  const px = Buffer.alloc(KARE_W * KARE_H * KARE_SAYISI * 4);
  kareler.forEach((k, i) => k.px.copy(px, i * KARE_W * KARE_H * 4));
  return { w: KARE_W, h: KARE_H * KARE_SAYISI, px };
};

// Oyunun orijinal LevelUp atlası (sha256 doğrulanmış) → {xnb, img}
function oyunAtlasi() {
  const xnb = fs.readFileSync(orijinal(OYUN_REL)), ozet = sha256(xnb);
  if (ozet !== SHA.levelUp) throw new Error(`LevelUp.xnb beklenen dosya değil (sha256 ${ozet}, beklenen ${SHA.levelUp})`);
  return { xnb, img: atlasAc(xnb, ATLAS.eskiH, 'LevelUp.xnb').img };
}

// ---------------------------------------------------------------- komutlar
async function cizKomut() {
  const ttf = await yaziTipi(true), exe = ciziciDerle(), { img } = oyunAtlasi();
  const c = cizimYap({ img, exe, ttf }), birlesik = kareleriBirlestir(c.kareler), png = pngKodla(birlesik);
  fs.mkdirSync(VARLIK, { recursive: true });
  fs.writeFileSync(BIZIM_PNG, png);
  console.log(`metin ${c.metinW} px geniş, çerçeve ${c.W}, dolgu satır ${c.ty0}-${c.ty1}`);
  console.log('yerleşim:', c.yerlestir.join(' '));
  console.log('orijinal  :', c.tonPayi.orijinal);
  console.log('benim     :', c.tonPayi.benim);
  console.log(`yazıldı: ${path.relative(KOK, BIZIM_PNG)} (${png.length} bayt)`);
  let tutmayan = 0;
  SEVIYE_KARELER.forEach((k, i) => {
    const o = kareOzet(birlesik.px, i), tuttu = o === k.ozet;
    if (!tuttu) tutmayan++;
    console.log(`kare ${k.kare} (y=${k.y}) özet ${o} ${tuttu ? 'sabit özetle AYNI' : 'sabit özetten FARKLI'}`);
  });
  if (tutmayan) { console.log(`HATA: ${tutmayan} kare sabit özetten farklı: onaylı değilse çizim bozuldu; onaylıysa SEVIYE_KARELER özetlerini yukarıdakilerle değiştirin`); return 1; }
  return 0;
}

function uretKomut(cikis, sessiz = false) {
  if (!cikis) throw new Error('kullanım: node tools/seviye.mjs uret <cikis-klasoru>');
  const kok = path.resolve(cikis);
  // Oyun klasörüne yazan tek araç oyuna-kur.mjs (CLAUDE.md → Harita).
  if ((kok + path.sep).toLowerCase().startsWith(path.resolve(OYUN).toLowerCase() + path.sep)) throw new Error('oyun klasörüne yazılmaz');
  const girdi = fs.readFileSync(orijinal(OYUN_REL)), { xnb, kareler } = levelUpYamala(girdi);
  const hedef = path.join(kok, OYUN_REL), jsonYol = hedef.replace(/\.xnb$/, '-kareler.json');
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, xnb); fs.writeFileSync(jsonYol, JSON.stringify(kareler, null, 2) + '\n');
  if (!sessiz) {
    console.log(`yazıldı: ${hedef} (${xnb.length} bayt, sıkıştırmasız; orijinal ${girdi.length} bayt)`);
    console.log(`yazıldı: ${jsonYol}`);
    for (const k of kareler) console.log(`  kare ${k.kare}: x=${k.x} y=${k.y} ${k.w}x${k.h}`);
  }
  return { hedef, jsonYol, girdi };
}

// ---------------------------------------------------------------- sınama
const ONIZLEME = path.join(KOK, 'ham', 'onizleme', 'seviye'); // onaylı önizleme: kimlik ölçütü (git dışı)
const ONAYLI_AD = 'fondamento-yukari-k1.2-nokta-xs8-xb10.4-c0.8-sx1-sy1-g1-w128';
const ONAYLI = { kare6: path.join(ONIZLEME, `v3-kare6-${ONAYLI_AD}.png`), karsilastirma: path.join(ONIZLEME, `v3-karsilastirma-${ONAYLI_AD}-x8.png`) };

const pikselFarki = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return Infinity;
  let n = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.px.readUInt32BE((y * a.w + x) * 4) !== b.px.readUInt32BE((y * a.w + x) * 4)) n++;
  return n;
};
// onizle3.mjs'nin 8 katlı karşılaştırma resminin üst 4 satırı (yeni kareler; satır aralığı 20*8+2, zemin 40,40,48) yeniden kurulur
function onizlemeSeridi(kareler) {
  const K = 8, ara = 2, sat = KARE_H * K + ara, W = KARE_W * K, px = Buffer.alloc(W * sat * 4 * 4);
  for (let i = 0; i < W * sat * 4; i++) { px[i * 4] = 40; px[i * 4 + 1] = 40; px[i * 4 + 2] = 48; px[i * 4 + 3] = 255; }
  kareler.forEach((k, i) => buyut(k, K, [40, 40, 48]).px.copy(px, i * sat * W * 4));
  return { w: W, h: sat * 4, px };
}
const ustSatirlar = (img, h) => ({ w: img.w, h, px: img.px.subarray(0, img.w * h * 4) });

// Kurulum yolunu Node izin modeliyle sınar: yalnız tools/ ve geçici girdi klasörü okunabilir, yazma ve alt süreç yasak.
// ham/ (yazı tipi, çizici, oyunun dosyası) okunursa ERR_ACCESS_DENIED ile ölür.
function izinliKos(args, okunabilir) {
  return spawnSync(process.execPath, ['--permission', ...okunabilir.map((d) => `--allow-fs-read=${d}`), ...args], { encoding: 'utf8' });
}

async function sinaKomut() {
  let kotu = 0, atlanan = 0;
  const kayit = (ad, tuttu, ayrinti) => {
    if (tuttu === null) atlanan++; else if (!tuttu) kotu++;
    console.log(`${tuttu === null ? 'ATLANDI' : tuttu ? 'TUTTU  ' : 'TUTMADI'}  ${ad}: ${ayrinti}`);
  };
  const { xnb: girdi, img: oyunImg } = oyunAtlasi();
  kayit('girdi sha256 (oyunun LevelUp.xnb)', sha256(girdi) === SHA.levelUp, `${sha256(girdi).slice(0, 16)}… = bildirim.mjs SHA.levelUp`);

  // (a) depodaki PNG: biçim, sabit piksel özeti, oyunun paleti (levelUpYamala bunları kendi de denetler; burada bağımsız)
  const pngBuf = fs.readFileSync(BIZIM_PNG), bizim = pngOku(pngBuf);
  kayit('depodaki PNG boyutu', bizim.w === KARE_W && bizim.h === KARE_H * KARE_SAYISI, `${bizim.w}x${bizim.h} (beklenen ${KARE_W}x${KARE_H * KARE_SAYISI}, kare i y=i*20)`);
  const ozetler = SEVIYE_KARELER.map((k, i) => kareOzet(bizim.px, i));
  kayit('depodaki PNG sabit piksel özetiyle tutuyor', ozetler.every((o, i) => o === SEVIYE_KARELER[i].ozet), ozetler.map((o, i) => `kare ${SEVIYE_KARELER[i].kare} ${o.slice(0, 12)}…${o === SEVIYE_KARELER[i].ozet ? '' : ' FARKLI'}`).join(' · '));
  const pal = new Set(paletOku(oyunImg));
  let disPalet = 0, yariSeffaf = 0, kirliSeffaf = 0, opak = 0;
  for (let p = 0; p < bizim.px.length; p += 4) {
    const a = bizim.px[p + 3];
    if (a === 0) { if (bizim.px.readUInt32BE(p) !== 0) kirliSeffaf++; continue; }
    opak++; if (a !== 255) yariSeffaf++;
    if (!pal.has(bizim.px.readUInt32BE(p))) disPalet++;
  }
  kayit('PNG renkleri oyunun 12 tonu, yarı saydam yok', disPalet === 0 && yariSeffaf === 0 && kirliSeffaf === 0 && opak > 0, `${opak} opak piksel · palet dışı ${disPalet} · alfa 0/255 dışı ${yariSeffaf} · rengi dolu şeffaf ${kirliSeffaf}`);

  // (b) kimlik: onaylı önizlemeyle piksel piksel (ham/onizleme git dışıdır: yoksa bu iki denetim atlanır, sabit özet yine korur)
  const yeniKareler = [0, 1, 2, 3].map((i) => ({ w: KARE_W, h: KARE_H, px: Buffer.from(kareDilimi(bizim.px, i)) }));
  if (!fs.existsSync(ONAYLI.kare6)) kayit('kimlik (kare 6 ↔ onaylı önizleme)', null, `${path.relative(KOK, ONAYLI.kare6)} yok`);
  else { const f = pikselFarki(yeniKareler[3], pngOku(ONAYLI.kare6)); kayit('kimlik (kare 6 ↔ onaylı önizleme PNG)', f === 0, `${f} piksel farklı (128x20)`); }
  if (!fs.existsSync(ONAYLI.karsilastirma)) kayit('kimlik (kare 3-6, 8 kat ↔ onaylı karşılaştırma)', null, `${path.relative(KOK, ONAYLI.karsilastirma)} yok`);
  else {
    const ref = pngOku(ONAYLI.karsilastirma), serit = onizlemeSeridi(yeniKareler), f = pikselFarki(serit, ustSatirlar(ref, serit.h));
    kayit('kimlik (kare 3-6, 8 kat ↔ onaylı karşılaştırma)', f === 0 && ref.w === serit.w, `${f} piksel farklı (${serit.w}x${serit.h}; referans ${ref.w}x${ref.h})`);
  }

  // (c) levelUpYamala: çıktı geometrisi ve değişmezlik (yeni XNB diskten SIFIRDAN açılır), belirlenimcilik, çıktı sha256
  const cikis = path.join(os.tmpdir(), `seviye-sina-${process.pid}`);
  let u;
  try {
    u = uretKomut(cikis, true);
    const yazilan = fs.readFileSync(u.hedef), kareler = JSON.parse(fs.readFileSync(u.jsonYol, 'utf8'));
    const sorun = denetle(girdi, yazilan, kareler, pngBuf);
    kayit('uret: diske yazılan XNB geri okundu (128x512 Color; eski 256 satır aynı; y=256,276,296,316; alt boşluk sıfır)', sorun.length === 0, sorun.length ? sorun.join(' · ') : `${kareler.map((k) => `kare ${k.kare}@y${k.y}`).join(' ')} · ${yazilan.length} bayt`);
    const e = atlasAc(girdi, ATLAS.eskiH, 'girdi'), y = atlasAc(yazilan, ATLAS.yeniH, 'çıktı');
    const eskiAyni = Buffer.compare(y.img.px.subarray(0, ATLAS.w * ATLAS.eskiH * 4), e.img.px) === 0;
    kayit('eski 256 satırın baytı DEĞİŞMEDİ', eskiAyni, `${ATLAS.w * ATLAS.eskiH * 4} bayt, bayt bayt karşılaştırıldı`);
    const ikinci = levelUpYamala(girdi).xnb, ucuncu = levelUpYamala(Buffer.from(girdi)).xnb;
    kayit('belirlenimcilik (levelUpYamala iki kez)', Buffer.compare(ikinci, yazilan) === 0 && Buffer.compare(ucuncu, yazilan) === 0, `üç çıktı bayt bayt aynı (${yazilan.length} bayt)`);
    if (CIKTI_SHA256) kayit('çıktı sha256 sabit değerle tutuyor', sha256(yazilan) === CIKTI_SHA256, `${sha256(yazilan).slice(0, 16)}…`);
    else kayit('çıktı sha256 sabit değerle tutuyor', false, `CIKTI_SHA256 boş; bu koşunun değeri ${sha256(yazilan)}`);
  } finally { fs.rmSync(cikis, { recursive: true, force: true }); }

  // (d) sha256 tutmayan girdi: üretmeden durmalı
  const tekBayt = Buffer.from(girdi); tekBayt[tekBayt.length - 1] ^= 1;
  const yamali = levelUpYamala(girdi).xnb;
  for (const [ad, g] of [['son baytı değişmiş', tekBayt], ['LocToastLatin.xnb', fs.readFileSync(orijinal(REL.locToast))], ['zaten yamalı (128x512) dosya', yamali]]) {
    let hata = null, cikti = null;
    try { cikti = levelUpYamala(g); } catch (e) { hata = e; }
    kayit(`sha256 tutmayan girdi (${ad})`, !cikti && /sha256/.test(hata?.message), hata ? 'durdu, çıktı yok' : 'DURMADI');
  }

  // (e) ham/ ve yazı tipi olmadan: kurulum yolu Node izin modeliyle koşulur; yalnız tools/ ve girdi klasörü okunabilir
  const izinKlasoru = fs.mkdtempSync(path.join(os.tmpdir(), 'seviye-izin-'));
  try {
    const girdiYol = path.join(izinKlasoru, 'LevelUp.xnb');
    fs.writeFileSync(girdiYol, girdi);
    const okunabilir = [path.join(KOK, 'tools'), izinKlasoru], bu = fileURLToPath(import.meta.url);
    const r = izinliKos([bu, 'kurulum-yolu', girdiYol], okunabilir);
    let ozet = null; try { ozet = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* aşağıda hata olarak görünür */ }
    kayit('kurulum yolu izin modeliyle (yalnız tools/ okunabilir; ham/, yazı tipi, alt süreç, yazma yasak)', r.status === 0 && ozet?.sha === sha256(yamali) && ozet?.boy === yamali.length,
      r.status === 0 ? `çocuk süreç çıktısı süreç içi çıktıyla bayt bayt aynı (${ozet?.boy} bayt, sha256 ${ozet?.sha?.slice(0, 12)}…)` : `çocuk süreç çıkış ${r.status}: ${(r.stderr || '').split('\n').slice(0, 3).join(' | ')}`);
    // karşı test: aynı izinlerle çocuk ham/'daki yazı tipini okumaya kalkarsa ERR_ACCESS_DENIED almalı (izin modeli gerçekten engelliyor)
    const k1 = izinliKos([bu, 'ham-denemesi'], okunabilir);
    kayit('karşı test: aynı izinle ham/ yazı tipi okunmaya çalışılır, engellenmeli', k1.status !== 0 && /ERR_ACCESS_DENIED/.test(k1.stderr), k1.status === 0 ? 'ENGELLENMEDİ (ham/ okundu)' : 'ERR_ACCESS_DENIED');
    // karşı test: dev yolu (cizim) ham/ ister, izin modelinde ölür: çizim kurulum yoluna sızsaydı yakalanırdı
    const k2 = izinliKos([bu, 'cizim-denemesi'], okunabilir);
    kayit('karşı test: çizim yolu (oyun dosyası + yazı tipi) izinsiz ölür', k2.status !== 0 && /ERR_ACCESS_DENIED/.test(k2.stderr), k2.status === 0 ? 'ÇİZİM ham/ OKUDU' : 'ERR_ACCESS_DENIED');
    // Dosya erişimi izi (izin modelinden bağımsız ikinci yol; izin modeli yutulan existsSync'i göstermez): çocuk süreçte fs işlevleri sarılır,
    // uygulamanın dokunduğu HER yol kaydedilir (Node'un kendi modül yükleyicisi iç bağlantı kullanır, kaydedilmez).
    const izJs = path.join(izinKlasoru, 'iz.cjs');
    fs.writeFileSync(izJs, [
      "const fs = require('node:fs'), kayit = [];",
      "for (const ad of ['readFileSync', 'existsSync', 'statSync', 'lstatSync', 'openSync', 'readdirSync', 'accessSync', 'realpathSync', 'createReadStream', 'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'copyFileSync', 'renameSync']) {",
      "  const o = fs[ad]; if (typeof o !== 'function') continue;",
      "  fs[ad] = function (...a) { if (typeof a[0] === 'string' || Buffer.isBuffer(a[0]) || a[0] instanceof URL) kayit.push(ad + ' ' + String(a[0])); return o.apply(this, a); };",
      '}',
      "process.on('exit', () => fs.writeSync(2, 'IZ-BASLA\\n' + kayit.join('\\n') + '\\nIZ-BITTI\\n'));",
    ].join('\n'));
    const izle = (komut, ...arg) => {
      const s = spawnSync(process.execPath, ['-r', izJs, bu, komut, ...arg], { encoding: 'utf8' }), m = s.stderr.match(/IZ-BASLA\r?\n([\s\S]*?)IZ-BITTI/);
      return { s, kayitlar: m ? [...new Set(m[1].split(/\r?\n/).filter(Boolean))] : null };
    };
    const benzer = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
    // yol: kayıt satırındaki yolu düz dosya yoluna çevirir (ESM yükleyici file:// verir). Serbest: girdi XNB'si, gömülü PNG, tools/*.mjs (modüllerin kendi kaynağı)
    const yol = (k) => { const y = k.slice(k.indexOf(' ') + 1); return y.startsWith('file:') ? fileURLToPath(y) : y; };
    const veri = [girdiYol, BIZIM_PNG], modulMu = (y) => benzer(path.dirname(y), path.join(KOK, 'tools')) && /.mjs$/.test(y), izin = (k) => veri.some((v) => benzer(yol(k), v)) || modulMu(yol(k));
    const i1 = izle('kurulum-yolu', girdiYol);
    const fazla = i1.kayitlar?.filter((k) => !izin(k)) ?? [];
    const veriKayit = i1.kayitlar?.filter((k) => veri.some((v) => benzer(yol(k), v))) ?? [], modulSay = new Set(i1.kayitlar?.filter((k) => modulMu(yol(k))).map((k) => path.basename(yol(k)))).size;
    kayit('dosya erişimi izi: kurulum yolu yalnız girdi XNB\'sine ve tools/varlik/LevelUp_TR-bizim.png\'ye dokunuyor', i1.s.status === 0 && i1.kayitlar !== null && i1.kayitlar.length > 0 && fazla.length === 0,
      i1.kayitlar === null ? `iz alınamadı (çıkış ${i1.s.status}): ${i1.s.stderr.slice(0, 120)}` : `${i1.kayitlar.length} erişim: veri dosyası ${veriKayit.map((k) => k.split(' ')[0] + ' ' + path.basename(yol(k))).join(' · ')} · ${modulSay} modül kaynağı (tools/*.mjs)${fazla.length ? ' · FAZLA: ' + fazla.join(' | ') : ' · başka yol yok'}`);
    // karşı test: aynı izleyici ham/ yazı tipini okuyan komutta o yolu yakalamalı (izleyici gerçekten görüyor)
    const i2 = izle('ham-denemesi'), yakalandi = i2.kayitlar?.some((k) => /\.ttf$/i.test(k)) ?? false;
    kayit('karşı test: izleyici, ham/ yazı tipini okuyan komutta o dosyayı yakalıyor', yakalandi, yakalandi ? i2.kayitlar.filter((k) => /\.ttf$/i.test(k)).map((k) => path.relative(KOK, yol(k))).join(' · ') : 'İZLEYİCİ GÖRMEDİ');
  } finally { fs.rmSync(izinKlasoru, { recursive: true, force: true }); }

  // (f) karşı testler (kurulum yolu): bilerek bozulur; denetim yakalamalı
  const bozPng = (degis) => { const b = pngOku(pngBuf), px = Buffer.from(b.px); degis(px); return pngKodla({ w: b.w, h: b.h, px }); };
  const ilkOpak = (() => { for (let p = 0; p < bizim.px.length; p += 4) if (bizim.px[p + 3]) return p; return -1; })();
  const tekPiksel = bozPng((px) => { px[ilkOpak] ^= 1; }); // gömülü PNG'de tek pikselin R baytı 1 değişti
  let durdu = false, ileti = ''; try { levelUpYamala(girdi, { png: tekPiksel }); } catch (e) { durdu = /özet/.test(e.message); ileti = e.message.slice(0, 90); }
  kayit('karşı test: gömülü PNG\'de tek pikselin tonu değişti', durdu, durdu ? `araç durdu (${ileti}…)` : 'ARAÇ DURMADI');
  { // palet denetimini özetten BAĞIMSIZ ölçmek için: bozuk PNG'nin özetleri geçici olarak "onaylı" yapılır (SEVIYE_KARELER nesneleri değişebilir), sonra geri konur
    const baskaRenk = bozPng((px) => { px[ilkOpak] = 1; px[ilkOpak + 1] = 2; px[ilkOpak + 2] = 3; px[ilkOpak + 3] = 255; }); // palet dışı renk
    const eskiOzet = SEVIYE_KARELER.map((k) => k.ozet), b = pngOku(baskaRenk);
    durdu = false; ileti = '';
    try { SEVIYE_KARELER.forEach((k, i) => { k.ozet = kareOzet(b.px, i); }); levelUpYamala(girdi, { png: baskaRenk }); } catch (e) { durdu = /12 tonundan/.test(e.message); ileti = e.message.slice(0, 100); } finally { SEVIYE_KARELER.forEach((k, i) => { k.ozet = eskiOzet[i]; }); }
    kayit('karşı test: gömülü PNG\'de palet dışı renk (özet geçici olarak eşitlenmiş, yalnız palet denetimi)', durdu, durdu ? `araç durdu (${ileti}…)` : `ARAÇ PALET DIŞI RENGİ KABUL ETTİ ${ileti}`);
  }
  for (const [boz, ne] of [['kayma', 'ikinci kare 1 satır aşağıya yazıldı (y=277)'], ['eski', 'atlasın eski bir pikseli değişti'], ['sizinti', 'yeni karelerin altındaki boş alana piksel yazıldı']]) {
    let hb = null, durduB = false;
    try { levelUpYamala(girdi, { boz }); } catch (e) { durduB = true; hb = e.message.replace('LevelUp yaması tutmadı: ', ''); }
    kayit(`karşı test (yama): ${ne}`, durduB && !!hb, durduB ? `araç durdu: ${hb.slice(0, 110)}` : 'ARAÇ DURMADI');
  }
  { // denetim işlevinin kendisi bağımsız ölçülür: bozuk bir XNB elle kurulup doğrudan denetle'ye verilir (araç içi durdurma bundan ayrı)
    const e = atlasAc(girdi, ATLAS.eskiH, 'girdi'), kabuk = e.kabuk, bozuk = birlestir(e.img, bizim, 'kayma');
    const xnbBozuk = xnbYaz(icerikYaz({ okuyucular: e.ic.okuyucular, nesne: { ...e.ic.nesne, w: bozuk.w, h: bozuk.h, mipler: [bozuk.px] } }), { platform: kabuk.platform, surum: kabuk.surum, bayrak: kabuk.bayrak });
    const hb = denetle(girdi, xnbBozuk, SEVIYE_KARELER.map(({ kare, x, y, w, h }) => ({ kare, x, y, w, h })), pngBuf);
    kayit('karşı test: denetle() kayık yazılmış kareyi yakalıyor', hb.length > 0, hb.length ? hb.join(' · ').slice(0, 120) : 'DENETİM YAKALAMADI');
  }

  // (g) belirlenimcilik ve karşı testler (çizim): yazı tipi ve çizici gerekir
  const ttf = await yaziTipi(false);
  if (!ttf) {
    kayit('belirlenimcilik (ciz yeniden)', null, `yazı tipi yok (${path.relative(KOK, YAZI_TIPI.yol)}; ciz indirir): yeniden çizim denenmedi`);
    kayit('karşı testler (çizim parametreleri)', null, 'yazı tipi yok');
  } else {
    const exe = ciziciDerle(), c1 = cizimYap({ img: oyunImg, exe, ttf }), c2 = cizimYap({ img: oyunImg, exe, ttf });
    const b1 = kareleriBirlestir(c1.kareler), b2 = kareleriBirlestir(c2.kareler);
    kayit('belirlenimcilik (iki çizim bayt bayt aynı)', Buffer.compare(b1.px, b2.px) === 0, `${b1.px.length} bayt`);
    const f = pikselFarki(b1, bizim), ayniPng = Buffer.compare(pngKodla(b1), pngBuf) === 0;
    kayit('depodaki PNG = yeniden çizim (ciz çıktısı)', f === 0, `${f} piksel farklı · PNG dosyası ${ayniPng ? 'bayt bayt aynı' : 'bayt farklı (yalnız zlib sürümü olabilir; pikseller ölçülür)'}`);
    for (const [ne, deg] of [['yineleme turu 11→12 (ton 2 kaybolur)', { tur: 12 }], ['ışık kuyruğu 1.2→0.6', { kuyruk: 0.6 }], ['K yaması kapalı', { yamayok: true }], ['nokta ayırma kapalı', { noktayok: true }]]) {
      const boz = kareleriBirlestir(cizimYap({ img: oyunImg, exe, ttf }, { ...PARAM, ...deg }).kareler), fb = pikselFarki(boz, bizim);
      const ozetFarki = SEVIYE_KARELER.some((k, i) => kareOzet(boz.px, i) !== k.ozet);
      kayit(`karşı test (çizim): ${ne}`, fb > 0 && ozetFarki, `${fb} piksel farklı, sabit özet ${ozetFarki ? 'yakaladı' : 'YAKALAMADI'}`);
    }
  }

  console.log('bu sınama şunu göremez: karelerin oyunda çizildiğini ve ortalandığını (exe yaması, TextureDatabase girdisi ayrı iş) · FNA\'nın 128x512 atlası yüklediğini · '
    + 'harflerin Türk okura doğal geldiğini (onay gözle verildi) · başka makinede aynı WPF çiziminin aynı pikseli verdiğini (kurulum çizmez, gömülü PNG kullanır) · '
    + 'izin modelinin okuma denetiminin tam kapsamını (Node\'un kendi iç okumaları denetlenmez)');
  if (atlanan) console.log(`atlanan denetim: ${atlanan}`);
  console.log(kotu ? `HÜKÜM: KALDI (${kotu} denetim tutmadı)` : 'HÜKÜM: GEÇTİ');
  return kotu ? 1 : 0;
}

// ---------------------------------------------------------------- komut satırı
// Üst düzey await yok (kurulum programı bu modülü esbuild ile CJS paketine alıyor). ana() hatasını kendi yakalar.
async function ana() {
  const [komut, arg] = process.argv.slice(2);
  try {
    if (komut === 'ciz') process.exitCode = await cizKomut();
    else if (komut === 'uret') uretKomut(arg);
    else if (komut === 'sina') process.exitCode = await sinaKomut();
    // sina'nın çocuk süreçleri (iç komutlar, izin modeli altında koşar):
    else if (komut === 'kurulum-yolu') { const y = levelUpYamala(fs.readFileSync(arg)); console.log(JSON.stringify({ sha: sha256(y.xnb), boy: y.xnb.length })); }
    else if (komut === 'ham-denemesi') fs.readFileSync(YAZI_TIPI.yol);
    else if (komut === 'cizim-denemesi') await cizKomutSuz();
    else { console.error('kullanım: node tools/seviye.mjs ciz | uret <cikis-klasoru> | sina'); process.exitCode = 2; }
  } catch (e) {
    console.error(`HATA: ${e.code ? e.code + ' ' : ''}${e.message}`);
    if (komut === 'sina') console.log('HÜKÜM: KALDI (sınama koşamadı)');
    process.exitCode = 2;
  }
}
// cizim-denemesi: çizim yolunun (oyun dosyası + yazı tipi) ham/ okuduğunu göstermek için; hiçbir şey yazmaz
async function cizKomutSuz() { const { img } = oyunAtlasi(); const ttf = await yaziTipi(false); if (ttf) fs.readFileSync(ttf); return img; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ana();
