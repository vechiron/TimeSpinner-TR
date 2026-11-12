// Dil menüsüne Türk bayrağı: LocFlags.xnb'ye 12. kare (dizin 11 = ELanguageLocale.TR) ve
// TextureDatabase.dat'taki LocFlags atlasına o karenin tanımı.
// Oyunun dosyası dağıtılmaz: kurulum programı bu işlevleri kullanıcının kendi dosyasına uygular.
// Türk bayrağı burada koddan çizilir (Bayrak Kanunu tüzüğündeki oranlar), oyunun bayrak kurallarıyla:
// oyunun beyazı ve Rus bayrağının kırmızısı, kırmızı alanın 1 px koyu kenarı, eğri kenarda 3 ara ton (Japon dairesi gibi).
//
//   node tools/bayrak.mjs            oyun klasöründen okur, ham/bayrak/Content/ altına yazar, denetler, önizleme PNG'si döker
//   node tools/bayrak.mjs --sina     karşı test: bilerek bozulmuş çıktıları denetimin yakaladığını gösterir
// Dışa açılanlar: turkBayragi · locFlagsYamala · dokuVeritabaniYamala · atlasKareleri · denetle
// Oyun klasörüne yazmaz. Bir denetim tutmazsa çıkış kodu 1.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { orijinal } from './oyun-yolu.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba, pngKodla, buyut } from './xnb.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'ham/bayrak');

export const TR_KARE = 11;                       // ELanguageLocale.TR: kare dizini = dil numarası
export const KARE = { x: 0, y: 128, w: 64, h: 42 }; // eski resmin (256x128) hemen altı
const YENI_BOY = { w: 256, h: 256 };
const KIRMIZI = [0xdc, 0x0b, 0x1c], KENAR = [0x4d, 0x0b, 0x11], BEYAZ = [0xf3, 0xf3, 0xf3]; // oyunun RU/FR paletinden ölçüldü
const ATLAS_SATIR = `<AtlasFrame DoesNewRowUseStartX="False" Count="1" RowWidth="0" StartIndex="0" FrameSize="{X:${KARE.w} Y:${KARE.h}}" StartCoordinates="{X:${KARE.x} Y:${KARE.y}}" />`;

// ---------------------------------------------------------------- Türk bayrağı (64x42 RGBA)
// G = yükseklik. Dış ay merkezi uçkurdan 1/2 G, çapı 1/2 G; iç ay merkezi 1/16 G sağda, çapı 0,4 G;
// yıldız çemberi iç aydan 1/3 G uzakta (iç ayın sol kenarından), çapı 1/4 G, bir ucu hilale bakar.
export function turkBayragi(w = KARE.w, h = KARE.h, alt = 16) {
  const G = h, sx = w / (1.5 * G), cy = h / 2;
  const dis = { x: 0.5 * G * sx, r: 0.25 * G };
  const ic = { x: (0.5 + 1 / 16) * G * sx, r: 0.2 * G };
  const yR = 0.125 * G, yx = ((0.5 + 1 / 16) * G - 0.2 * G + G / 3 + yR) * sx;
  const koseler = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + k * Math.PI / 5, r = k % 2 ? yR * Math.sin(Math.PI / 10) / Math.sin(3 * Math.PI / 10) : yR;
    koseler.push([yx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const yildizda = (x, y) => { // çift-tek kuralı (yıldız 10 köşeli basit çokgen)
    let ici = false;
    for (let i = 0, j = koseler.length - 1; i < koseler.length; j = i++) {
      const [xi, yi] = koseler[i], [xj, yj] = koseler[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ici = !ici;
    }
    return ici;
  };
  const beyazda = (x, y) => {
    const d1 = (x - dis.x) ** 2 + (y - cy) ** 2, d2 = (x - ic.x) ** 2 + (y - cy) ** 2;
    return (d1 <= dis.r ** 2 && d2 > ic.r ** 2) || yildizda(x, y);
  };
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let renk;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) renk = KENAR;
    else {
      let n = 0;
      for (let j = 0; j < alt; j++) for (let i = 0; i < alt; i++) if (beyazda(x + (i + 0.5) / alt, y + (j + 0.5) / alt)) n++;
      const q = Math.round((n / (alt * alt)) * 4) / 4; // 0 · ¼ · ½ · ¾ · 1
      renk = KIRMIZI.map((k, c) => Math.round(k + (BEYAZ[c] - k) * q));
    }
    px.set([...renk, 255], (y * w + x) * 4);
  }
  return { w, h, px };
}

// ---------------------------------------------------------------- LocFlags.xnb
// Girdi: oyunun LocFlags.xnb'si (LZX sıkıştırmalı, 256x128 Color). Çıktı: sıkıştırmasız XNB, 256x256,
// eski pikseller yerinde, Türk bayrağı KARE'de. Beklenen dosya değilse hata atar (yazmadan).
export function locFlagsYamala(buf) {
  const kabuk = xnbAc(buf), ic = icerikOku(kabuk.ham), t = ic.nesne;
  if (ic.artik !== 0) throw new Error(`LocFlags: ${ic.artik} bayt artık`);
  if (t?.tur !== 'Texture2D' || t.bicim !== 0 || t.mipler.length !== 1) throw new Error('LocFlags: beklenen tek katmanlı Color doku değil');
  if (t.w !== 256 || t.h !== 128) throw new Error(`LocFlags: boyut ${t.w}x${t.h} (256x128 bekleniyordu; zaten yamalı ya da oyun güncellenmiş)`);
  const eski = dokuRgba(t), yeni = Buffer.alloc(YENI_BOY.w * YENI_BOY.h * 4); // boş pikseller 0,0,0,0 (eskisi gibi)
  for (let y = 0; y < eski.h; y++) eski.px.copy(yeni, y * YENI_BOY.w * 4, y * eski.w * 4, (y + 1) * eski.w * 4);
  const tr = turkBayragi();
  for (let y = 0; y < tr.h; y++) tr.px.copy(yeni, ((KARE.y + y) * YENI_BOY.w + KARE.x) * 4, y * tr.w * 4, (y + 1) * tr.w * 4);
  const nesne = { ...t, w: YENI_BOY.w, h: YENI_BOY.h, mipler: [yeni] };
  return xnbYaz(icerikYaz({ okuyucular: ic.okuyucular, nesne }), { platform: kabuk.platform, surum: kabuk.surum, bayrak: kabuk.bayrak });
}

// ---------------------------------------------------------------- TextureDatabase.dat (zlib + XML)
const ATLAS_RE = /(<Atlas FileName="LocFlags" ContentPath="Overlays\/Menu\/LocFlags" Width=")(\d+)(" Height=")(\d+)(" FrameCount=")(\d+)(">)([\s\S]*?)(\r?\n)(\s*)(<\/Atlas>)/;
export function dokuVeritabaniYamala(buf) {
  const xml = zlib.inflateSync(buf).toString('utf8');
  const m = xml.match(ATLAS_RE);
  if (!m || xml.split('FileName="LocFlags"').length !== 2) throw new Error('TextureDatabase: LocFlags atlası bulunamadı ya da birden çok');
  if (m[2] !== '256' || m[4] !== '128' || m[6] !== '11') throw new Error(`TextureDatabase: LocFlags ${m[2]}x${m[4]}, ${m[6]} kare (256x128, 11 bekleniyordu; zaten yamalı ya da oyun güncellenmiş)`);
  const girinti = m[8].match(/\n(\s*)<AtlasFrame/)[1];
  const yeni = m[1] + YENI_BOY.w + m[3] + YENI_BOY.h + m[5] + (TR_KARE + 1) + m[7] + m[8] + m[9] + girinti + ATLAS_SATIR + m[9] + m[10] + m[11];
  return zlib.deflateSync(Buffer.from(xml.replace(ATLAS_RE, () => yeni), 'utf8'), { level: 9 });
}

// Oyunun TextureAtlas.LoadAtlasFrameData mantığı (decompile'dan): atlasın kare dikdörtgenleri.
export function atlasKareleri(xml, ad = 'LocFlags') {
  const blok = xml.match(new RegExp(`<Atlas FileName="${ad}"[^>]*>([\\s\\S]*?)</Atlas>`))[1];
  const kareler = [];
  for (const f of blok.matchAll(/<AtlasFrame DoesNewRowUseStartX="(\w+)" Count="(\d+)" RowWidth="(\d+)" StartIndex="(\d+)" FrameSize="\{X:(\d+) Y:(\d+)\}" StartCoordinates="\{X:(\d+) Y:(\d+)\}" \/>/g)) {
    const [, yeniSatirX, count, rowW, start, fw, fh, sx, sy] = f.map((v, i) => (i === 1 ? v : +v));
    if (start !== 0) throw new Error('StartIndex ≠ 0 desteklenmiyor (LocFlags\'ta yok)');
    let x = sx, y = sy, n = 0;
    for (let i = 0; i < count; i++) {
      kareler.push({ x, y, w: fw, h: fh });
      if (++n < rowW) { x += fw; continue; }
      x = yeniSatirX === 'True' ? sx : 0; y += fh; n = 0;
    }
  }
  return kareler;
}

// ---------------------------------------------------------------- denetim
// Eski ve yeni dosya çiftlerini karşılaştırır; tutmayan her şeyi listeler (boş liste = sağlam).
export function denetle({ eskiXnb, yeniXnb, eskiDat, yeniDat }) {
  const hatalar = [];
  const eski = dokuRgba(icerikOku(xnbAc(eskiXnb).ham).nesne);
  const ac = xnbAc(yeniXnb), ic = icerikOku(ac.ham), yeni = dokuRgba(ic.nesne);
  if (ac.sikistirilmis) hatalar.push('yeni XNB sıkıştırılmış görünüyor');
  if (ic.artik !== 0) hatalar.push(`yeni XNB'de ${ic.artik} bayt artık`);
  if (yeni.w !== YENI_BOY.w || yeni.h !== YENI_BOY.h) hatalar.push(`yeni doku ${yeni.w}x${yeni.h}`);
  const p = (img, x, y) => img.px.readUInt32BE((y * img.w + x) * 4);
  let eskiFark = 0, disOpak = 0, bayrakFark = 0;
  const tr = turkBayragi();
  for (let y = 0; y < yeni.h; y++) for (let x = 0; x < yeni.w; x++) {
    const kareIci = x >= KARE.x && x < KARE.x + KARE.w && y >= KARE.y && y < KARE.y + KARE.h;
    if (y < eski.h) { if (p(yeni, x, y) !== p(eski, x, y)) eskiFark++; }
    else if (kareIci) { if (p(yeni, x, y) !== p(tr, x - KARE.x, y - KARE.y)) bayrakFark++; }
    else if (p(yeni, x, y) !== 0) disOpak++;
  }
  if (eskiFark) hatalar.push(`eski 256x128 alanda ${eskiFark} piksel değişmiş`);
  if (bayrakFark) hatalar.push(`Türk bayrağı karesinde ${bayrakFark} piksel çizilenden farklı`);
  if (disOpak) hatalar.push(`kare dışındaki yeni alanda ${disOpak} boş olmayan piksel`);
  // Bayrağın kendisi: kenar tam, iç yalnız kırmızı-beyaz karışımı, beyaz alan makul
  let beyaz = 0;
  for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
    const v = p(tr, x, y) >>> 8, kenar = x === 0 || y === 0 || x === tr.w - 1 || y === tr.h - 1;
    if (kenar && v !== 0x4d0b11) { hatalar.push(`bayrak kenarı (${x},${y}) ${v.toString(16)}`); break; }
    if (v === 0xf3f3f3) beyaz++;
  }
  const oran = beyaz / (tr.w * tr.h);
  if (oran < 0.03 || oran > 0.15) hatalar.push(`bayrakta beyaz oranı %${(oran * 100).toFixed(1)} (hilal+yıldız için beklenmedik)`);
  // Veri dosyası: yalnız LocFlags atlası değişmiş olmalı, eski 11 kare yerinde, 12. kare KARE
  const eX = zlib.inflateSync(eskiDat).toString('utf8'), yX = zlib.inflateSync(yeniDat).toString('utf8');
  const eS = eX.split('\r\n'), yS = yX.split('\r\n');
  if (yS.length !== eS.length + 1) hatalar.push(`TextureDatabase satır sayısı ${eS.length} → ${yS.length} (bir satır eklenmeliydi)`);
  const farkli = [];
  for (let i = 0, j = 0; i < eS.length || j < yS.length;) {
    if (eS[i] === yS[j]) { i++; j++; continue; }
    farkli.push(yS[j]); if (yS[j]?.includes('<AtlasFrame')) j++; else { i++; j++; }
  }
  if (farkli.length !== 2 || !farkli[0]?.includes('FileName="LocFlags"') || farkli[1]?.trim() !== ATLAS_SATIR)
    hatalar.push(`TextureDatabase'de beklenmeyen fark: ${JSON.stringify(farkli).slice(0, 300)}`);
  const ek = atlasKareleri(eX), yk = atlasKareleri(yX);
  if (yk.length !== TR_KARE + 1) hatalar.push(`yeni atlas ${yk.length} kare (12 bekleniyordu)`);
  if (JSON.stringify(yk.slice(0, ek.length)) !== JSON.stringify(ek)) hatalar.push('eski 11 karenin dikdörtgeni değişmiş');
  if (JSON.stringify(yk[TR_KARE]) !== JSON.stringify(KARE)) hatalar.push(`kare ${TR_KARE} = ${JSON.stringify(yk[TR_KARE])}`);
  for (const k of yk) if (k.x + k.w > yeni.w || k.y + k.h > yeni.h) hatalar.push(`kare dokudan taşıyor: ${JSON.stringify(k)}`);
  if (!/<Atlas FileName="LocFlags" ContentPath="Overlays\/Menu\/LocFlags" Width="256" Height="256" FrameCount="12">/.test(yX)) hatalar.push('atlas başlığı (256x256, 12 kare) yazılmamış');
  return hatalar;
}

// ---------------------------------------------------------------- önizleme: oyundaki dil menüsü gibi
// LocSelectionScreen.DrawMenu: üst çerçeve (kare 8) (0,0) · alt çerçeve (9) (0,26) · bayrak (6,4) · oklar (10) (-17,18) ve (79,18) aynalı.
function menuOnizleme(img, kareler, dizin) {
  const W = 130, H = 60, ox = 27, oy = 4, px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([24, 22, 30, 255], i * 4);
  const ciz = (k, dx, dy, ayna = false) => {
    for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) {
      const s = ((k.y + y) * img.w + k.x + (ayna ? k.w - 1 - x : x)) * 4;
      if (img.px[s + 3] === 0) continue;
      const tx = ox + dx + x, ty = oy + dy + y;
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) img.px.copy(px, (ty * W + tx) * 4, s, s + 4);
    }
  };
  ciz(kareler[8], 0, 0); ciz(kareler[9], 0, 26); ciz(kareler[dizin], 6, 4); ciz(kareler[10], -17, 18); ciz(kareler[10], 79, 18, true);
  return { w: W, h: H, px };
}

// ---------------------------------------------------------------- komut satırı
function uret() {
  const eskiXnb = fs.readFileSync(orijinal('Content/Overlays/Menu/LocFlags.xnb')) // oyun yamalıysa yedekten;
  const eskiDat = fs.readFileSync(orijinal('Content/TextureDatabase.dat'));
  return { eskiXnb, eskiDat, yeniXnb: locFlagsYamala(eskiXnb), yeniDat: dokuVeritabaniYamala(eskiDat) };
}

function ana() {
  const d = uret();
  const xnbYol = path.join(CIKTI, 'Content/Overlays/Menu/LocFlags.xnb'), datYol = path.join(CIKTI, 'Content/TextureDatabase.dat');
  fs.mkdirSync(path.dirname(xnbYol), { recursive: true });
  fs.writeFileSync(xnbYol, d.yeniXnb); fs.writeFileSync(datYol, d.yeniDat);
  // Denetim diske yazılanı geri okuyarak yapılır
  const hatalar = denetle({ ...d, yeniXnb: fs.readFileSync(xnbYol), yeniDat: fs.readFileSync(datYol) });
  const img = dokuRgba(icerikOku(xnbAc(fs.readFileSync(xnbYol)).ham).nesne);
  const kareler = atlasKareleri(zlib.inflateSync(fs.readFileSync(datYol)).toString('utf8'));
  fs.writeFileSync(path.join(CIKTI, 'LocFlags-x4.png'), pngKodla(buyut(img, 4)));
  fs.writeFileSync(path.join(CIKTI, 'turk-bayragi-x10.png'), pngKodla(buyut(turkBayragi(), 10)));
  fs.writeFileSync(path.join(CIKTI, 'menu-TR-x5.png'), pngKodla(buyut(menuOnizleme(img, kareler, TR_KARE), 5)));
  fs.writeFileSync(path.join(CIKTI, 'menu-RU-x5.png'), pngKodla(buyut(menuOnizleme(img, kareler, 7), 5)));
  console.log(`yazıldı: ${path.relative(KOK, xnbYol)} (${d.yeniXnb.length} bayt, eski ${d.eskiXnb.length})`);
  console.log(`yazıldı: ${path.relative(KOK, datYol)} (${d.yeniDat.length} bayt, eski ${d.eskiDat.length})`);
  console.log(`önizleme: ham/bayrak/LocFlags-x4.png · turk-bayragi-x10.png · menu-TR-x5.png · menu-RU-x5.png`);
  console.log(`atlas: ${kareler.length} kare, kare ${TR_KARE} = ${JSON.stringify(kareler[TR_KARE])}`);
  if (hatalar.length) { console.log('DENETİM: TUTMADI\n  ' + hatalar.join('\n  ')); process.exit(1); }
  console.log('DENETİM: TAMAM (eski pikseller ve 11 kare yerinde, kare 11 Türk bayrağı, veri dosyasında yalnız LocFlags atlası değişti)');
  console.log('bu denetim şunu göremez: oyunun sıkıştırmasız XNB\'yi ve Node\'un zlib çıktısını okuduğunu (oyunda ya da sınama programında ölçülür) · bayrağın gözle doğru göründüğünü');
}

// Karşı test: her bozmada denetim en az bir hata vermeli; bozulmamışta hiç vermemeli.
function sina() {
  const d = uret();
  const xnbBoz = (fn) => { const ic = icerikOku(xnbAc(d.yeniXnb).ham); const m = Buffer.from(ic.nesne.mipler[0]); fn(m); return xnbYaz(icerikYaz({ okuyucular: ic.okuyucular, nesne: { ...ic.nesne, mipler: [m] } })); };
  const datBoz = (fn) => zlib.deflateSync(Buffer.from(fn(zlib.inflateSync(d.yeniDat).toString('utf8')), 'utf8'));
  // Bozma yalnız LocFlags bloğunun içinde: aynı metin başka atlaslarda da geçiyor (ilk sürümde başkası bozuluyordu)
  const locBoz = (eski, yeni) => datBoz((x) => x.replace(/<Atlas FileName="LocFlags"[\s\S]*?<\/Atlas>/, (b) => {
    if (!b.includes(eski)) throw new Error(`karşı test: LocFlags bloğunda "${eski}" yok`);
    return b.replace(eski, yeni);
  }));
  const durumlar = [
    ['bozulmamış', d, false],
    ['eski alanda bir piksel', { ...d, yeniXnb: xnbBoz((m) => { m[(10 * 256 + 10) * 4] ^= 1; }) }, true],
    ['bayrakta bir piksel', { ...d, yeniXnb: xnbBoz((m) => { m[((KARE.y + 20) * 256 + 20) * 4 + 1] ^= 0x40; }) }, true],
    ['kare dışında opak piksel', { ...d, yeniXnb: xnbBoz((m) => { m.set([1, 2, 3, 255], (200 * 256 + 100) * 4); }) }, true],
    ['kare koordinatı kaymış', { ...d, yeniDat: locBoz('StartCoordinates="{X:0 Y:128}"', 'StartCoordinates="{X:0 Y:129}"') }, true],
    ['eski kare değişmiş', { ...d, yeniDat: locBoz('StartCoordinates="{X:242 Y:112}"', 'StartCoordinates="{X:241 Y:112}"') }, true],
    ['başka atlas değişmiş', { ...d, yeniDat: datBoz((x) => x.replace('FileName="LunaisSprite" ContentPath="Sprites/Heroes/LunaisSprite" Width="504"', 'FileName="LunaisSprite" ContentPath="Sprites/Heroes/LunaisSprite" Width="505"')) }, true],
    ['kare sayısı yazılmamış', { ...d, yeniDat: locBoz('FrameCount="12"', 'FrameCount="11"') }, true],
    ['resim boyu yazılmamış', { ...d, yeniDat: locBoz('Height="256"', 'Height="128"') }, true],
  ];
  let kotu = 0;
  for (const [ad, girdi, hataBekle] of durumlar) {
    const h = denetle(girdi), tuttu = hataBekle ? h.length > 0 : h.length === 0;
    if (!tuttu) kotu++;
    console.log(`${tuttu ? 'TUTTU ' : 'TUTMADI'}  ${ad}: ${h.length ? h[0] : 'hata yok'}`);
  }
  // Yamalı dosyaya ikinci kez uygulanınca dokunmadan durmalı
  for (const [ad, fn, girdi] of [['LocFlags ikinci kez', locFlagsYamala, d.yeniXnb], ['TextureDatabase ikinci kez', dokuVeritabaniYamala, d.yeniDat]]) {
    let durdu = false; try { fn(girdi); } catch { durdu = true; }
    if (!durdu) kotu++;
    console.log(`${durdu ? 'TUTTU ' : 'TUTMADI'}  ${ad}: ${durdu ? 'reddedildi' : 'İKİNCİ KEZ UYGULANDI'}`);
  }
  console.log(kotu ? `KARŞI TEST: ${kotu} durum tutmadı` : `KARŞI TEST: ${durumlar.length + 2}/${durumlar.length + 2} tuttu`);
  process.exit(kotu ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--sina') sina(); else ana();
}
