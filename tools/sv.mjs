// Türkçe "SV." (seviye kısaltması): duraklatma menüsünde Lunais portresinin yanında "LV." resmi görünür
// (Overlays/Menu/PauseMenu atlası, kare 118, atlasta (113,51), 18x12; PauseMenuScreen.DrawCharacters satır 676,
// GetFrameSource(118)). Türkçede "LV."nin "L"si "S" olur. Oyunun dosyasına dokunmayız, TR için YENİ bir kare ekleriz:
// atlas 256x256 → 256x512 (aşağı büyür, eski satırlar aynen), kare 157 = (0,256) 18x12. Kare, oyunun kare 118'inden
// "L" sütunları (c0..c8) silinip yerine aşağıdaki haritadaki "S" çizilerek üretilir; "V" ve nokta özgün pikseller.
// Exe yaması (TR'de kare 118 yerine 157) ve TextureDatabase.dat girdisi ayrı iş (tools/tr-yamaci.cs, tools/icerik.mjs).
//
//   node tools/sv.mjs uret <cikis>   <cikis>/Content/Overlays/Menu/PauseMenu.xnb + PauseMenu-kareler.json
//                                    (girdi: oyunun orijinal PauseMenu.xnb'si; oyun klasörüne yazılmaz)
//   node tools/sv.mjs ozet           kare ve çıktı özetlerini hesaplayıp basar (koda yazmak için)
//   node tools/sv.mjs sina           kimlik (ham/ varsa) · belirlenimcilik · özetler · karşı testler;
//                                    son satır HÜKÜM: GEÇTİ / KALDI (çıkış 0 / 1)
//
// Dışa açılanlar: svYamala · SV_KARE · ESKI_KARE · ATLAS · OYUN_REL · CIKTI_SHA256.
// Kurulum yolu (svYamala) yalnız Node ister: ham/ ve gömülü PNG yok, kare koddaki haritadan ve oyunun kendi
// dosyasından üretilir (yeni varlık dosyası yok: kurucu varlık listeleri değişmez).
//
// Piksel özeti (SV_KARE.ozet): karenin (18x12) ham RGBA baytlarının sha256'sı, satır satır, her piksel R,G,B,A sırasıyla,
// 18*12*4 = 864 bayt (seviye.mjs ve bildirim.mjs ile aynı kural).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { orijinal } from './oyun-yolu.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba, pngOku } from './xnb.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OYUN_REL = 'Content/Overlays/Menu/PauseMenu.xnb';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Oyunun orijinal PauseMenu.xnb'sinin (sıkıştırılmış, 15718 bayt) sha256'sı: oyun güncellenmiş ya da dosya yamalıysa durur.
const GIRDI_SHA256 = '1047104c2f9ad9cff8ba5d3a289fa49960737b0602bb6516eafecf5c5dc1e7f9';

// Atlas: oyunun PauseMenu.xnb'si 256x256 (157 kare); biz yalnız aşağı doğru büyütürüz (eski satırlar yerinde).
export const ATLAS = { w: 256, eskiH: 256, yeniH: 512, eskiKareSayisi: 157, yeniKareSayisi: 158 };
export const ESKI_KARE = { kare: 118, x: 113, y: 51, w: 18, h: 12 };            // oyunun "LV." karesi
export const SV_KARE = { kare: 157, x: 0, y: 256, w: 18, h: 12,                  // Türkçe "SV." karesi (dat'ta Count=1 satır)
  ozet: 'f64bcf1e437f4318d5af9b063c95b78608556e1086a64708dce070f4bbfb06d0' };
// Üretilen PauseMenu.xnb'nin (sıkıştırmasız, 256x512) sha256'sı: sina'da gerileme dedektörü.
export const CIKTI_SHA256 = '531a126bcad2f46f26af4078412b144aab535970ee0cee5ef8f74979acb43a97';

// "S" haritası: sütun c0..c8 (9), satır r0..r11 (12). '.' saydam (4 bayt da 0: oyunun şeffaf pikselleri hep 0,0,0,0,
// ön-çarpımlı alfada artık renk leke bırakır) · '_' özgün piksel aynen (V'nin sol kenarı) · harfler oyunun paleti:
// A dış çizgi, C-G-D gövde, B-E-F ara tonlar. Palet kare 118'in 7 renginden (ölçüldü: 7 renk, yarı saydam yok).
const PAL = { A: [48, 32, 16], B: [95, 94, 59], C: [134, 130, 74], D: [54, 45, 30], E: [75, 66, 45], F: [180, 172, 111], G: [217, 208, 164] };
const HARITA = [
  '..ABCCA._',
  '.ACGFFDA_',
  '.ACGDAA._',
  '.ACGDA.._',
  '.AACGFDA_',
  '..AACFDA_',
  '...ACGDA_',
  '...ACGDA_',
  '..AACGDA_',
  '.ACGFFDA.',
  '.AEBFFFA.',
  '.ADDDDDA_',
];
const S_GENIS = 9;

// ---------------------------------------------------------------- yardımcılar
// Oyunun dosyasını aç ve denetle → { kabuk, ic, img }
function atlasAc(xnb, h, ad) {
  const kabuk = xnbAc(xnb), ic = icerikOku(kabuk.ham), t = ic.nesne;
  if (ic.artik || t?.tur !== 'Texture2D' || t.bicim !== 0 || t.w !== ATLAS.w || t.h !== h || t.mipler.length !== 1)
    throw new Error(`${ad}: ${ATLAS.w}x${h} tek katmanlı Color doku değil (${t?.tur} biçim ${t?.bicim} ${t?.w}x${t?.h}, ${t?.mipler?.length} katman, artık ${ic.artik})`);
  return { kabuk, ic, img: dokuRgba(t) };
}
const atlasOffset = (x, y) => (y * ATLAS.w + x) * 4;
// Atlastan bir dikdörtgenin ham RGBA baytları (satır satır, bitişik)
function kareKes(px, x0, y0, w, h) {
  const o = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) px.copy(o, y * w * 4, atlasOffset(x0, y0 + y), atlasOffset(x0, y0 + y) + w * 4);
  return o;
}

// "LV." karesinden "SV." karesi: ilk 9 sütun haritaya göre yeniden yazılır, gerisi özgün.
function kareUret(eskiImg, harita = HARITA) {
  if (harita.length !== ESKI_KARE.h || harita.some((s) => s.length !== S_GENIS)) throw new Error(`harita ${ESKI_KARE.h} satır x ${S_GENIS} sütun olmalı`);
  const px = kareKes(eskiImg.px, ESKI_KARE.x, ESKI_KARE.y, ESKI_KARE.w, ESKI_KARE.h), ozgun = Buffer.from(px);
  const renkler = new Set(Object.values(PAL).map((r) => r.join(',')));
  for (let y = 0; y < ESKI_KARE.h; y++) for (let x = 0; x < S_GENIS; x++) {
    const c = harita[y][x], d = (y * ESKI_KARE.w + x) * 4;
    if (c === '.') { px[d] = px[d + 1] = px[d + 2] = px[d + 3] = 0; continue; }
    if (c === '_') continue;
    const p = PAL[c]; if (!p) throw new Error('haritada bilinmeyen harf ' + c);
    px[d] = p[0]; px[d + 1] = p[1]; px[d + 2] = p[2]; px[d + 3] = 255;
  }
  // Denetim: alfa 0 ise renk de 0 · her opak pikselin rengi oyunun paletinden · "V" ve nokta (c9..c17) özgünle aynı
  for (let y = 0; y < ESKI_KARE.h; y++) for (let x = 0; x < ESKI_KARE.w; x++) {
    const d = (y * ESKI_KARE.w + x) * 4;
    if (px[d + 3] === 0) { if (px[d] || px[d + 1] || px[d + 2]) throw new Error(`kare (${x},${y}): alfa 0 ama renk 0 değil`); continue; }
    if (px[d + 3] !== 255) throw new Error(`kare (${x},${y}): yarı saydam piksel (alfa ${px[d + 3]})`);
    if (!renkler.has(`${px[d]},${px[d + 1]},${px[d + 2]}`)) throw new Error(`kare (${x},${y}): rengi oyunun paletinden değil`);
    if (x >= S_GENIS && Buffer.compare(px.subarray(d, d + 4), ozgun.subarray(d, d + 4)) !== 0) throw new Error(`kare (${x},${y}): "V" ya da nokta özgünden farklı`);
  }
  return px;
}

// Eski atlas (256x256) + yeni kare → 256x512. boz: yalnız karşı test (sina) için bilerek bozar.
function birlestir(eski, kare, boz) {
  const px = Buffer.alloc(ATLAS.w * ATLAS.yeniH * 4);
  eski.px.copy(px, 0, 0, ATLAS.w * ATLAS.eskiH * 4);
  if (boz === 'eski') px[atlasOffset(10, 10)] ^= 1; // karşı test: eski bir pikseli değiştir
  const y0 = boz === 'kayma' ? SV_KARE.y + 1 : SV_KARE.y; // karşı test: kare 1 satır aşağıda
  for (let y = 0; y < SV_KARE.h; y++) kare.copy(px, atlasOffset(SV_KARE.x, y0 + y), y * SV_KARE.w * 4, (y + 1) * SV_KARE.w * 4);
  if (boz === 'sizinti') px[atlasOffset(100, 400) + 3] = 255; // karşı test: boş olması gereken alana piksel
  return { w: ATLAS.w, h: ATLAS.yeniH, px };
}

// Bağımsız denetim: yeni XNB'yi SIFIRDAN açar, eskiyle karşılaştırır. Dönüş: tutmayanların listesi.
function denetle(eskiXnb, yeniXnb, kareler) {
  const h = [], e = atlasAc(eskiXnb, ATLAS.eskiH, 'eski PauseMenu.xnb');
  let y;
  try { y = atlasAc(yeniXnb, ATLAS.yeniH, 'yeni PauseMenu.xnb'); } catch (err) { return [err.message]; }
  if (y.kabuk.sikistirilmis) h.push('yeni XNB sıkıştırılmış');
  if (y.kabuk.platform !== e.kabuk.platform || y.kabuk.surum !== e.kabuk.surum) h.push(`XNB platform/sürüm oyunun dosyasından farklı: ${y.kabuk.platform}${y.kabuk.surum} ≠ ${e.kabuk.platform}${e.kabuk.surum}`);
  if (JSON.stringify(y.ic.okuyucular) !== JSON.stringify(e.ic.okuyucular)) h.push('içerik okuyucuları oyunun dosyasından farklı');
  const eskiBayt = ATLAS.w * ATLAS.eskiH * 4;
  if (Buffer.compare(y.img.px.subarray(0, eskiBayt), e.img.px) !== 0) {
    let n = 0; for (let p = 0; p < eskiBayt; p += 4) if (y.img.px.readUInt32BE(p) !== e.img.px.readUInt32BE(p)) n++;
    h.push(`eski 256 satırdan ${n} piksel değişmiş`);
  }
  const b = kareler[0];
  if (kareler.length !== 1 || !b || b.kare !== SV_KARE.kare || b.x !== SV_KARE.x || b.y !== SV_KARE.y || b.w !== SV_KARE.w || b.h !== SV_KARE.h)
    h.push(`kare yeri/boyu ${JSON.stringify(kareler)} (beklenen kare ${SV_KARE.kare} x=${SV_KARE.x} y=${SV_KARE.y} ${SV_KARE.w}x${SV_KARE.h})`);
  else if (sha256(kareKes(y.img.px, b.x, b.y, b.w, b.h)) !== SV_KARE.ozet) h.push(`kare ${b.kare} (y=${b.y}) atlasta onaylı özetten farklı`);
  // Yeni karenin dışında, y ≥ 256 bölgesinde sıfırdan farklı bayt olmamalı
  let sizinti = 0;
  for (let yy = ATLAS.eskiH; yy < ATLAS.yeniH; yy++) for (let x = 0; x < ATLAS.w; x++) {
    if (x < SV_KARE.w && yy >= SV_KARE.y && yy < SV_KARE.y + SV_KARE.h) continue;
    const d = atlasOffset(x, yy); if (y.img.px[d] | y.img.px[d + 1] | y.img.px[d + 2] | y.img.px[d + 3]) sizinti++;
  }
  if (sizinti) h.push(`yeni karenin dışındaki boş alanda ${sizinti} sıfırdan farklı piksel var (y ≥ ${ATLAS.eskiH})`);
  return h;
}

// Kurulumun kullanacağı işlev. Girdi: kullanıcının ORİJİNAL PauseMenu.xnb'si (Buffer). Dönüş:
//   { xnb: kare 157 eklenmiş sıkıştırmasız PauseMenu.xnb (Color, 256x512), kareler: [{kare, x, y, w, h}] }.
// Girdi beklenen sürüm değilse ya da çıktı denetimi tutmazsa hata atar. ({ boz, harita } yalnız sınama için.)
export function svYamala(oyununXnb, { boz, harita } = {}) {
  const ozet = sha256(oyununXnb);
  if (ozet !== GIRDI_SHA256) throw new Error(`${path.basename(OYUN_REL)}: sha256 tarifteki değil (sha256 ${ozet}, beklenen ${GIRDI_SHA256}; oyun güncellenmiş ya da dosya zaten yamalı), durdum`);
  const oyun = atlasAc(oyununXnb, ATLAS.eskiH, path.basename(OYUN_REL));
  const yeni = birlestir(oyun.img, kareUret(oyun.img, harita), boz);
  const nesne = { ...oyun.ic.nesne, w: yeni.w, h: yeni.h, mipler: [yeni.px] };
  // Biçim oyunun öteki dosyalarındaki gibi (platform, sürüm, okuyucu aynı), yalnız sıkıştırmasız (LZX sıkıştırıcımız yok, FNA bayrak 0'ı okur).
  const xnb = xnbYaz(icerikYaz({ okuyucular: oyun.ic.okuyucular, nesne }), { platform: oyun.kabuk.platform, surum: oyun.kabuk.surum, bayrak: oyun.kabuk.bayrak });
  const kareler = [{ kare: SV_KARE.kare, x: SV_KARE.x, y: SV_KARE.y, w: SV_KARE.w, h: SV_KARE.h }];
  const sorun = denetle(oyununXnb, xnb, kareler);
  if (sorun.length) throw new Error(`PauseMenu yaması tutmadı: ${sorun.join(' · ')}`);
  return { xnb, kareler };
}

// ---------------------------------------------------------------- komutlar
const girdiOku = () => fs.readFileSync(orijinal(OYUN_REL)); // yamalı oyunda yedeği, değilse oyun klasörünü okur

function ozetKomut() {
  const g = girdiOku(), oyun = atlasAc(g, ATLAS.eskiH, 'PauseMenu.xnb');
  console.log('kare özeti   :', sha256(kareUret(oyun.img)));
  // Özet henüz koda yazılmadıysa denetim tutmaz: çıktıyı denetimsiz üretmek için özeti geçici olarak eşitleriz
  SV_KARE.ozet = sha256(kareUret(oyun.img));
  console.log('çıktı özeti  :', sha256(svYamala(g).xnb));
}

function uretKomut(cikis) {
  if (!cikis) throw new Error('kullanım: node tools/sv.mjs uret <cikis>');
  const { xnb, kareler } = svYamala(girdiOku());
  const hedef = path.join(cikis, OYUN_REL);
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, xnb);
  fs.writeFileSync(path.join(cikis, 'Content/Overlays/Menu/PauseMenu-kareler.json'), JSON.stringify(kareler, null, 2) + '\n');
  console.log(`yazıldı: ${hedef} (${xnb.length} bayt) · kare ${kareler[0].kare} (${kareler[0].x},${kareler[0].y}) ${kareler[0].w}x${kareler[0].h}`);
}

// Onaylı önizleme PNG'si (ham/sv-onizle/sv-onizle.png, git dışı) varsa: sağdaki 14x büyütülmüş "SV." karesi bizim
// üretimle piksel piksel aynı mı (saydam piksel önizlemede zemin renginde, opak piksel kendi renginde).
function kimlikOlc(kare) {
  const yol = path.join(KOK, 'ham', 'sv-onizle', 'sv-onizle.png');
  if (!fs.existsSync(yol)) return { durum: 'ATLANDI', ayrinti: 'ham/sv-onizle/sv-onizle.png yok' };
  const png = pngOku(fs.readFileSync(yol)), K = 14, X0 = 18 * K + 20, ZEMIN = [40, 40, 48];
  let fark = 0;
  for (let y = 0; y < SV_KARE.h; y++) for (let x = 0; x < SV_KARE.w; x++) {
    const o = ((y * K + 7) * png.w + X0 + x * K + 7) * 4, d = (y * SV_KARE.w + x) * 4;
    const beklenen = kare[d + 3] ? [kare[d], kare[d + 1], kare[d + 2]] : ZEMIN;
    if (png.px[o] !== beklenen[0] || png.px[o + 1] !== beklenen[1] || png.px[o + 2] !== beklenen[2]) fark++;
  }
  return { durum: fark ? 'FARKLI' : 'AYNI', ayrinti: `${fark} piksel farklı (216 pikselden)` };
}

function sinaKomut() {
  let kaldi = 0;
  const kontrol = (ad, tamam, ayrinti = '') => { console.log(`${tamam ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? ' — ' + ayrinti : ''}`); if (!tamam) kaldi++; };
  const hata = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  const g = girdiOku(), oyun = atlasAc(g, ATLAS.eskiH, 'PauseMenu.xnb');
  const kare = kareUret(oyun.img);
  kontrol('kare özeti koddakiyle aynı', sha256(kare) === SV_KARE.ozet, sha256(kare));
  const k = kimlikOlc(kare);
  kontrol('onaylı önizlemeyle aynı (ham/ varsa)', k.durum !== 'FARKLI', `${k.durum}: ${k.ayrinti}`);
  let a, b;
  const h0 = hata(() => { a = svYamala(g); b = svYamala(g); });
  kontrol('yama üretimi hatasız', h0 === null, h0 ?? '');
  if (!h0) {
    kontrol('belirlenimcilik (iki üretim aynı bayt)', Buffer.compare(a.xnb, b.xnb) === 0);
    kontrol('çıktı sha256 koddakiyle aynı', sha256(a.xnb) === CIKTI_SHA256, sha256(a.xnb));
    kontrol('çıktı 256x512 sıkıştırmasız', a.xnb.length > 524288 && atlasAc(a.xnb, ATLAS.yeniH, 'çıktı').kabuk.sikistirilmis === false, `${a.xnb.length} bayt`);
  }
  // Karşı testler: bilerek boz, denetim yakalamalı
  for (const [boz, bekle] of [['eski', 'eski 256 satırdan'], ['kayma', 'onaylı özetten farklı'], ['sizinti', 'boş alanda']]) {
    const m = hata(() => svYamala(g, { boz }));
    kontrol(`karşı test: ${boz}`, !!m && m.includes(bekle), m ? m.slice(0, 120) : 'YAKALANMADI');
  }
  const mh = hata(() => svYamala(g, { harita: HARITA.map((s, i) => (i === 3 ? s.replace('G', 'B') : s)) }));
  kontrol('karşı test: haritada bir piksel farklı', !!mh && mh.includes('özetten farklı'), mh ? mh.slice(0, 120) : 'YAKALANMADI');
  const mp = hata(() => svYamala(g, { harita: HARITA.map((s, i) => (i === 0 ? '.' + s.slice(1, 8) + 'x' : s)) }));
  kontrol('karşı test: haritada bilinmeyen harf', !!mp && mp.includes('bilinmeyen harf'), mp ? mp.slice(0, 120) : 'YAKALANMADI');
  const bozuk = Buffer.from(g); bozuk[bozuk.length - 1] ^= 1;
  const ms = hata(() => svYamala(bozuk));
  kontrol('karşı test: girdi dosyası bir bayt farklı', !!ms && ms.includes('sha256 tarifteki değil'), ms ? ms.slice(0, 100) : 'YAKALANMADI');
  const my = a ? hata(() => svYamala(a.xnb)) : null;
  kontrol('karşı test: zaten yamalı girdi reddedilir', !!my && my.includes('sha256 tarifteki değil'), my ? my.slice(0, 100) : 'YAKALANMADI');
  console.log('bu sınama şunu göremez: oyunun bu dosyayı yüklediğini ve kare 157\'yi çizdiğini (oyun dışı sınama ve oyunun kendisi) · "S"nin oyundaki gerçek boyut ve renkle güzel görünüp görünmediğini · exe\'nin bu kareyi istediğini · dat girdisinin doğruluğunu (icerik.mjs sınaması)');
  console.log(kaldi ? `HÜKÜM: KALDI (${kaldi} kontrol)` : 'HÜKÜM: GEÇTİ');
  return kaldi ? 1 : 0;
}

async function ana() {
  const [komut, arg] = process.argv.slice(2);
  try {
    if (komut === 'uret') uretKomut(arg);
    else if (komut === 'ozet') ozetKomut();
    else if (komut === 'sina') process.exitCode = sinaKomut();
    else { console.error('kullanım: node tools/sv.mjs uret <cikis> | ozet | sina'); process.exitCode = 2; }
  } catch (e) { console.error('HATA: ' + e.message); process.exitCode = 1; }
}
// Üst düzey await yok (kurulum programı bu modülü icerik.mjs üzerinden esbuild ile CJS paketine alıyor). ana() hatasını kendi yakalar.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ana();
