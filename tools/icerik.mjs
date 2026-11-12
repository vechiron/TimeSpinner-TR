// Resimli yazıların Türkçe içerik ağacı: oyunun orijinallerinden altı dosya üretip tek ağaca yazar. oyuna-kur.mjs buradan kurar.
//   Content/Overlays/Menu/LocFlags.xnb            dil menüsüne Türk bayrağı, kare 11 (bayrak.mjs)
//   Content/Overlays/PlayerHUD/LocToastLatin.xnb  "MAKS CAN+ / AURA+ / KUM+", kare 15-17 (bildirim.mjs)
//   Content/Overlays/PlayerHUD/LevelUp.xnb        "Seviye Yükseldi", 128x256 → 128x512, kare 34-37 (seviye.mjs; orijinali var)
//   Content/Overlays/Menu/PauseMenu.xnb           "SV." seviye kısaltması, 256x256 → 256x512, kare 157 (sv.mjs; orijinali var)
//   Content/Overlays/PlayerHUD/AreaTitles_TR.xnb  bölge başlıkları, 24 kare (baslik-ciz.mjs; oyunda olmayan YENİ dosya)
//   Content/TextureDatabase.dat                   bayrak.mjs'in LocFlags yaması + AreaTitles_TR kaydı (AreaTitles_RU'nun
//                                                 hemen ardına) + LocToastLatin FrameCount 15 → 18 ve üç kare
//                                                 + LevelUp Height 256 → 512, FrameCount 34 → 38 ve dört karelik satır
//                                                 + PauseMenu Height 256 → 512, FrameCount 157 → 158 ve tek karelik satır
// Ağaca yalnız oyuna gidecek dosyalar yazılır: araçların `uret` komutları değil işlevleri çağrılır (yan dosya yok).
//
//   node tools/icerik.mjs        ham/icerik/Content/'i baştan yazar, diske yazılanı geri okuyup denetler (çıkış 0/1)
//   node tools/icerik.mjs sina   karşı test: bozulmuş her girdide denetim beklenen yerde hata vermeli; son satır HÜKÜM
// Dışa açılanlar: ICERIK · ICERIK_DOSYALARI · YENI_DOSYALAR · girdiOku · icerikUret · datYamala · denetle
// Oyun klasörüne yazmaz; orijinalleri oyun-yolu.mjs orijinal() ile okur (oyun yamalıyken yedekten).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { orijinal } from './oyun-yolu.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba } from './xnb.mjs';
import { locFlagsYamala, dokuVeritabaniYamala, KARE as BAYRAK_KARE, TR_KARE as BAYRAK_NO } from './bayrak.mjs';
import { locToastYamala, TR_KARELER, REL as BILDIRIM_REL } from './bildirim.mjs';
import { areaTitlesUret, varlikOku, VARLIK_AD, OYUN_REL as BASLIK_REL, TR_REL as BASLIK_TR_REL } from './baslik-ciz.mjs';
import { levelUpYamala, SEVIYE_KARELER, ATLAS as SEVIYE_ATLAS } from './seviye.mjs';
import { svYamala, SV_KARE, ATLAS as SV_ATLAS, OYUN_REL as PAUSE_REL } from './sv.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ICERIK = path.join(KOK, 'ham', 'icerik'); // ağacın kökü: içindeki göreli yollar oyun klasörüne göre

const DAT_REL = 'Content/TextureDatabase.dat';
const LOCFLAGS_REL = 'Content/Overlays/Menu/LocFlags.xnb';
const SEVIYE_REL = BILDIRIM_REL.levelUp; // oyunda var: yedeklenir (YENI_DOSYALAR'a girmez)
export const ICERIK_DOSYALARI = [LOCFLAGS_REL, BILDIRIM_REL.locToast, SEVIYE_REL, PAUSE_REL, BASLIK_TR_REL, DAT_REL]; // PAUSE_REL oyunda var: yedeklenir
export const YENI_DOSYALAR = [BASLIK_TR_REL]; // orijinal oyunda yok: yedeklenmez, kaldırınca silinir

// Girdiler: kullanıcının oyunundaki orijinaller (kurulum programı bu tablodan kendi oyun klasörünü okur: kurucu-uret.mjs)
export const GIRDI = { dat: DAT_REL, locFlags: LOCFLAGS_REL, locToast: BILDIRIM_REL.locToast, levelUp: BILDIRIM_REL.levelUp, pauseMenu: PAUSE_REL, areaTitles: BASLIK_REL };
export function girdiOku() {
  return Object.fromEntries(Object.entries(GIRDI).map(([ad, rel]) => {
    const f = orijinal(rel);
    if (!f || !fs.existsSync(f)) throw new Error(`orijinal ${rel} bulunamadı`);
    return [ad, fs.readFileSync(f)];
  }));
}

// ---------------------------------------------------------------- TextureDatabase.dat: atlas blokları
const ATLAS_SON = '</Atlas>';
const KARE_RE = /^<AtlasFrame DoesNewRowUseStartX="(True|False)" Count="(\d+)" RowWidth="(\d+)" StartIndex="(\d+)" FrameSize="\{X:(\d+) Y:(\d+)\}" StartCoordinates="\{X:(\d+) Y:(\d+)\}" \/>$/;
const kareSatiri = (sablon, k) => sablon.replace(/FrameSize="\{X:\d+ Y:\d+\}"/, `FrameSize="{X:${k.w} Y:${k.h}}"`)
  .replace(/StartCoordinates="\{X:\d+ Y:\d+\}"/, `StartCoordinates="{X:${k.x} Y:${k.y}}"`);
const kalip = (satir) => kareSatiri(satir, { x: '#', y: '#', w: '#', h: '#' }); // biçim karşılaştırması: sayılar dışı
// Tek karelik satırın biçimi: AreaTitles_FR'nin bütün satırları ve bayrak.mjs'in yazdığı satır böyle
const TEK_KARE = '<AtlasFrame DoesNewRowUseStartX="False" Count="1" RowWidth="0" StartIndex="0" FrameSize="{X:# Y:#}" StartCoordinates="{X:# Y:#}" />';
// LevelUp'ın 3-6. karelerinin satırı (dört kare alt alta): yeni dört kare de bu biçimde tek satırla eklenir
const DIKEY_DORT = '<AtlasFrame DoesNewRowUseStartX="False" Count="4" RowWidth="1" StartIndex="0" FrameSize="{X:# Y:#}" StartCoordinates="{X:# Y:#}" />';

// Adı verilen atlasın bloğu (`<Atlas FileName="ad"` … `</Atlas>`); tam bir tane olmalı.
function tekBlok(xml, ad) {
  const anahtar = `<Atlas FileName="${ad}"`, bas = xml.indexOf(anahtar);
  if (bas < 0 || xml.indexOf(anahtar, bas + 1) >= 0) throw new Error(`TextureDatabase: ${ad} atlası yok ya da birden çok`);
  const son = xml.indexOf(ATLAS_SON, bas) + ATLAS_SON.length;
  return { bas, son, metin: xml.slice(bas, son) };
}

// Blok metnini çözer: satır sonu, girintiler, başlık öznitelikleri (sırasıyla), kare satırları ve çerçeve tanımları.
function blokAc(metin) {
  const m = metin.match(/^<Atlas((?: \w+="[^"]*")+)>(\r?\n)( *)</);
  if (!m) throw new Error(`atlas başlığı çözülemedi: ${metin.slice(0, 80)}`);
  const eol = m[2], satirlar = metin.split(eol), kareGirinti = m[3];
  const oz = [...m[1].matchAll(/ (\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]);
  const kareSatir = satirlar.slice(1, -1).map((s) => (s.startsWith(kareGirinti) ? s.slice(kareGirinti.length) : s));
  const cerceve = kareSatir.map((s) => {
    const f = s.match(KARE_RE);
    return f && { yeniSatirX: f[1] === 'True', count: +f[2], rowW: +f[3], start: +f[4], fw: +f[5], fh: +f[6], sx: +f[7], sy: +f[8] };
  });
  return { eol, kareGirinti, atlasGirinti: satirlar.at(-1).match(/^( *)<\/Atlas>$/)?.[1], oz, ozNesne: Object.fromEntries(oz),
    satirlar, kareSatir, cerceve, girintiTutarli: satirlar.slice(1, -1).every((s) => s.startsWith(kareGirinti) && s[kareGirinti.length] === '<') };
}

// Oyunun TextureAtlas.LoadAtlasFrameData mantığı (ham/kod/Timespinner.Core/TextureAtlas.cs), StartIndex ≠ 0 dahil.
// dokuW: dokunun gerçek eni (oyun _texture.Width kullanır). Oyunda num = floor(dokuW / kare eni) 0 olursa bölme hatası.
function kareHesapla(cerceve, dokuW) {
  const kareler = [];
  for (const f of cerceve) {
    const num = Math.floor(dokuW / f.fw);
    if (num < 1) throw new Error(`kare eni ${f.fw} doku eninden (${dokuW}) büyük: oyunda sıfıra bölme`);
    const bas = f.start === 0 ? { x: f.sx, y: f.sy } : { x: (f.start % num) * f.fw, y: Math.floor(f.start / num) * f.fh };
    let x = bas.x, y = bas.y, n = f.start % num;
    for (let i = 0; i < f.count; i++) {
      kareler.push({ x, y, w: f.fw, h: f.fh });
      if (++n < f.rowW) { x += f.fw; continue; }
      x = f.yeniSatirX ? bas.x : 0; y += f.fh; n = 0;
    }
  }
  return kareler;
}

// bayrak.mjs'in yamaladığı dat'a AreaTitles_TR kaydını, LocToastLatin'in üç karesini, LevelUp'ın dört karesini ve
// PauseMenu'nun "SV." karesini ekler.
// baslik: areaTitlesUret().kareler (24 kare, dizi sırası = kare no) · bildirim: locToastYamala().kareler (kare 15-17) ·
// seviye: levelUpYamala().kareler (kare 34-37, alt alta, aynı x ve boy) · pause: svYamala().kareler (kare 157, tek kare).
// Biçim ölçülüp kopyalanır: başlık öznitelikleri, satır sonu, girinti ve kare satırı AreaTitles_FR'den; LocToastLatin'in
// yeni satırları kendi ilk satırından; LevelUp'ın yeni satırı kendi 3-6. kare satırından; PauseMenu'nun yeni satırı kendi
// son kare satırından (tek kare). Zaten yamalıysa ya da beklenen yapı yoksa yazmadan hata atar.
export function datYamala(datBuf, { baslik, bildirim, seviye, pause }) {
  let xml = zlib.inflateSync(datBuf).toString('utf8');
  if (xml.includes('FileName="AreaTitles_TR"') || xml.includes('ContentPath="Overlays/PlayerHUD/AreaTitles_TR"'))
    throw new Error('TextureDatabase: AreaTitles_TR zaten var (dosya zaten yamalı)');
  // 1. LocToastLatin: FrameCount 15 → 18, kareler sona
  const lt = tekBlok(xml, 'LocToastLatin'), ltA = blokAc(lt.metin);
  const ltN = ltA.cerceve.reduce((t, f) => t + (f ? f.count : NaN), 0);
  if (ltA.ozNesne.FrameCount !== '15' || ltN !== 15) throw new Error(`TextureDatabase: LocToastLatin ${ltA.ozNesne.FrameCount} kare (15 bekleniyordu; zaten yamalı ya da oyun güncellenmiş)`);
  if (kalip(ltA.kareSatir[0]) !== TEK_KARE) throw new Error('TextureDatabase: LocToastLatin ilk kare satırı tek kare biçiminde değil; örnek alınamaz');
  if (bildirim.some((k, i) => k.kare !== ltN + i)) throw new Error(`bildirim kareleri ${bildirim.map((k) => k.kare)} (${ltN}'ten sıralı bekleniyordu)`);
  const ltBas = ltA.satirlar[0].replace(/ FrameCount="\d+"/, ` FrameCount="${ltN + bildirim.length}"`);
  const ltYeni = [ltBas, ...ltA.satirlar.slice(1, -1), ...bildirim.map((k) => ltA.kareGirinti + kareSatiri(ltA.kareSatir[0], k)), ltA.satirlar.at(-1)].join(ltA.eol);
  xml = xml.slice(0, lt.bas) + ltYeni + xml.slice(lt.son);
  // 2. LevelUp: Height 256 → 512 (atlas aşağı büyür), FrameCount 34 → 38, sona dört karelik tek satır (kare 34-37)
  const lu = tekBlok(xml, 'LevelUp'), luA = blokAc(lu.metin);
  const luN = luA.cerceve.reduce((t, f) => t + (f ? f.count : NaN), 0);
  if (luA.ozNesne.Width !== String(SEVIYE_ATLAS.w) || luA.ozNesne.Height !== String(SEVIYE_ATLAS.eskiH)
    || luA.ozNesne.FrameCount !== String(SEVIYE_ATLAS.eskiKareSayisi) || luN !== SEVIYE_ATLAS.eskiKareSayisi)
    throw new Error(`TextureDatabase: LevelUp ${luA.ozNesne.Width}x${luA.ozNesne.Height}, ${luA.ozNesne.FrameCount} kare (${SEVIYE_ATLAS.w}x${SEVIYE_ATLAS.eskiH}, ${SEVIYE_ATLAS.eskiKareSayisi} kare bekleniyordu; zaten yamalı ya da oyun güncellenmiş)`);
  if (kalip(luA.kareSatir[1]) !== DIKEY_DORT) throw new Error('TextureDatabase: LevelUp 3-6. kare satırı dört karelik dikey biçimde değil; örnek alınamaz');
  if (seviye.length !== 4 || seviye.some((k, i) => k.kare !== luN + i || k.x !== seviye[0].x || k.w !== seviye[0].w || k.h !== seviye[0].h || k.y !== seviye[0].y + i * k.h))
    throw new Error(`seviye kareleri ${JSON.stringify(seviye)} (${luN}'ten başlayan, alt alta, aynı x ve boyda 4 kare bekleniyordu)`);
  const luBas = luA.satirlar[0].replace(/ Height="\d+"/, ` Height="${SEVIYE_ATLAS.yeniH}"`).replace(/ FrameCount="\d+"/, ` FrameCount="${luN + seviye.length}"`);
  const luYeni = [luBas, ...luA.satirlar.slice(1, -1), luA.kareGirinti + kareSatiri(luA.kareSatir[1], seviye[0]), luA.satirlar.at(-1)].join(luA.eol);
  xml = xml.slice(0, lu.bas) + luYeni + xml.slice(lu.son);
  // 3. PauseMenu: Height 256 → 512 (atlas aşağı büyür), FrameCount 157 → 158, sona tek karelik satır (kare 157, "SV.")
  const pm = tekBlok(xml, 'PauseMenu'), pmA = blokAc(pm.metin);
  const pmN = pmA.cerceve.reduce((t, f) => t + (f ? f.count : NaN), 0);
  if (pmA.ozNesne.Width !== String(SV_ATLAS.w) || pmA.ozNesne.Height !== String(SV_ATLAS.eskiH)
    || pmA.ozNesne.FrameCount !== String(SV_ATLAS.eskiKareSayisi) || pmN !== SV_ATLAS.eskiKareSayisi)
    throw new Error(`TextureDatabase: PauseMenu ${pmA.ozNesne.Width}x${pmA.ozNesne.Height}, ${pmA.ozNesne.FrameCount} kare (${SV_ATLAS.w}x${SV_ATLAS.eskiH}, ${SV_ATLAS.eskiKareSayisi} kare bekleniyordu; zaten yamalı ya da oyun güncellenmiş)`);
  if (kalip(pmA.kareSatir.at(-1)) !== TEK_KARE) throw new Error('TextureDatabase: PauseMenu son kare satırı tek kare biçiminde değil; örnek alınamaz');
  const [sv] = pause;
  if (pause.length !== 1 || sv.kare !== pmN || sv.y < SV_ATLAS.eskiH || sv.y + sv.h > SV_ATLAS.yeniH || sv.x < 0 || sv.x + sv.w > SV_ATLAS.w)
    throw new Error(`pause kareleri ${JSON.stringify(pause)} (${pmN}. kare, atlasın eski bölgesinin altında, tek kare bekleniyordu)`);
  const pmBas = pmA.satirlar[0].replace(/ Height="\d+"/, ` Height="${SV_ATLAS.yeniH}"`).replace(/ FrameCount="\d+"/, ` FrameCount="${pmN + 1}"`);
  const pmYeni = [pmBas, ...pmA.satirlar.slice(1, -1), pmA.kareGirinti + kareSatiri(pmA.kareSatir.at(-1), sv), pmA.satirlar.at(-1)].join(pmA.eol);
  xml = xml.slice(0, pm.bas) + pmYeni + xml.slice(pm.son);
  // 4. AreaTitles_TR: AreaTitles_FR örneğiyle, AreaTitles_RU'nun hemen ardına
  const fr = blokAc(tekBlok(xml, 'AreaTitles_FR').metin), sablon = fr.kareSatir[0];
  if (fr.kareSatir.some((s) => kalip(s) !== TEK_KARE))
    throw new Error('TextureDatabase: AreaTitles_FR kare satırları tek biçimde değil; örnek alınamaz');
  if (baslik.length !== 24) throw new Error(`başlık kareleri ${baslik.length} (24 bekleniyordu)`);
  const trBas = fr.satirlar[0].replace('FileName="AreaTitles_FR"', 'FileName="AreaTitles_TR"')
    .replace('ContentPath="Overlays/PlayerHUD/AreaTitles_FR"', 'ContentPath="Overlays/PlayerHUD/AreaTitles_TR"')
    .replace(/ FrameCount="\d+"/, ` FrameCount="${baslik.length}"`);
  const tr = [trBas, ...baslik.map((k) => fr.kareGirinti + kareSatiri(sablon, k)), fr.satirlar.at(-1)].join(fr.eol);
  const ru = tekBlok(xml, 'AreaTitles_RU');
  xml = xml.slice(0, ru.son) + fr.eol + fr.atlasGirinti + tr + xml.slice(ru.son);
  return zlib.deflateSync(Buffer.from(xml, 'utf8'), { level: 9 });
}

// ---------------------------------------------------------------- üretim
// Girdi: girdiOku() biçiminde orijinaller. Dönüş: { göreli yol → Buffer } (ICERIK_DOSYALARI).
export function icerikUret(girdi) {
  const bildirim = locToastYamala({ locToast: girdi.locToast, levelUp: girdi.levelUp });
  const seviye = levelUpYamala(girdi.levelUp);
  const pause = svYamala(girdi.pauseMenu);
  const baslik = areaTitlesUret(girdi.areaTitles);
  return {
    [LOCFLAGS_REL]: locFlagsYamala(girdi.locFlags),
    [BILDIRIM_REL.locToast]: bildirim.xnb,
    [SEVIYE_REL]: seviye.xnb,
    [PAUSE_REL]: pause.xnb,
    [BASLIK_TR_REL]: baslik.xnb,
    [DAT_REL]: datYamala(dokuVeritabaniYamala(girdi.dat), { baslik: baslik.kareler, bildirim: bildirim.kareler, seviye: seviye.kareler, pause: pause.kareler }),
  };
}

// ---------------------------------------------------------------- denetim (blok bazında)
// Beş atlas: dat'taki adı, dokusunun dosyası ve beklenen boyu, karşılaştırılacağı orijinal.
const ATLASLAR = {
  LocFlags: { rel: LOCFLAGS_REL, w: 256, h: 256, eski: 'locFlags' },       // bayrak.mjs: 256x128 → 256x256
  LocToastLatin: { rel: BILDIRIM_REL.locToast, w: 256, h: 256, eski: 'locToast' }, // bildirim.mjs: atlas büyümedi
  LevelUp: { rel: SEVIYE_REL, w: SEVIYE_ATLAS.w, h: SEVIYE_ATLAS.yeniH, eski: 'levelUp' }, // seviye.mjs: 128x256 → 128x512
  PauseMenu: { rel: PAUSE_REL, w: SV_ATLAS.w, h: SV_ATLAS.yeniH, eski: 'pauseMenu' },       // sv.mjs: 256x256 → 256x512
  AreaTitles_TR: { rel: BASLIK_TR_REL, w: 256, h: 512, eski: 'areaTitles' },  // baslik-ciz.mjs: AreaTitles gibi 256x512
};
const DEGISEN = ['LocFlags', 'LocToastLatin', 'LevelUp', 'PauseMenu'], EKLENEN = 'AreaTitles_TR', ONCEKI = 'AreaTitles_RU';
const BASLIK_ORTAK = [15, 22]; // AreaTitles'ın çerçeve ve tarih kareleri: AreaTitles_TR'de aynı yerde, oyunun pikselleriyle

// XML'i atlas bloklarına böler. iskelet: bloklar yer tutucuyla (aralar, sıra, baş ve son burada karşılaştırılır).
function bol(xml) {
  const bloklar = [];
  const iskelet = xml.replace(/<Atlas FileName="([^"]*)"[^>]*>[\s\S]*?<\/Atlas>/g, (m, ad) => { bloklar.push([ad, m]); return `«${ad}»`; });
  return { iskelet, bloklar, harita: new Map(bloklar), atlasSayisi: xml.split('<Atlas ').length - 1 };
}
const ilkFark = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `${i}. karakterde: ${JSON.stringify(a.slice(i, i + 50))} ≠ ${JSON.stringify(b.slice(i, i + 50))}`; };
const disinda = (k, img) => k.x < 0 || k.y < 0 || k.x + k.w > img.w || k.y + k.h > img.h;
function pikselFarki(a, b, k) { // aynı dikdörtgen iki dokuda
  let n = 0;
  for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) if (a.px.readUInt32BE((y * a.w + x) * 4) !== b.px.readUInt32BE((y * b.w + x) * 4)) n++;
  return n;
}
// Karenin ham RGBA baytlarının sha256'sı (satır satır, R,G,B,A): seviye.mjs ve bildirim.mjs'in `ozet` kuralıyla aynı.
function kareOzeti(img, k) {
  const h = crypto.createHash('sha256');
  for (let y = k.y; y < k.y + k.h; y++) h.update(img.px.subarray((y * img.w + k.x) * 4, (y * img.w + k.x + k.w) * 4));
  return h.digest('hex');
}
function doluPiksel(img, k) { let n = 0; for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++) if (img.px[(y * img.w + x) * 4 + 3]) n++; return n; }
const dikdortgen = (k) => `${k.x},${k.y} ${k.w}x${k.h}`;

// girdi: orijinaller (girdiOku) · dosyalar: ağaçtan geri okunan { göreli yol → Buffer } · agac: ağaçtaki dosyaların göreli yolları.
// Dönüş: hata listesi (boş = sağlam). Her hata "[etiket] ..." biçiminde; sina beklenen etiketi arar.
export function denetle(girdi, dosyalar, agac = Object.keys(dosyalar)) {
  const h = [], hata = (etiket, m) => h.push(`[${etiket}] ${m}`);
  // 1. Ağaç: tam olarak oyuna gidecek altı dosya
  const fazla = agac.filter((r) => !ICERIK_DOSYALARI.includes(r)), eksik = ICERIK_DOSYALARI.filter((r) => !agac.includes(r));
  if (fazla.length || eksik.length) hata('ağaç', `fazla: ${fazla.join(', ') || '-'} · eksik: ${eksik.join(', ') || '-'}`);

  // 2. XNB'ler geri okunur: sıkıştırmasız, artık bayt yok, tek katmanlı Color, beklenen boyda, kabuğu orijinalinki gibi
  const doku = {}, eskiDoku = {};
  for (const [ad, a] of Object.entries(ATLASLAR)) {
    try {
      const k = xnbAc(dosyalar[a.rel]), ic = icerikOku(k.ham), t = ic.nesne, e = xnbAc(girdi[a.eski]), eic = icerikOku(e.ham);
      const sorun = [];
      if (k.sikistirilmis) sorun.push('sıkıştırılmış (bizim yazdığımız sıkıştırmasız olmalı)');
      if (ic.artik) sorun.push(`${ic.artik} bayt artık`);
      if (t?.tur !== 'Texture2D' || t.bicim !== 0 || t.mipler.length !== 1) sorun.push('tek katmanlı Color doku değil');
      if (k.platform !== e.platform || k.surum !== e.surum) sorun.push(`kabuk ${k.platform}/${k.surum} (orijinal ${e.platform}/${e.surum})`);
      if (JSON.stringify(ic.okuyucular) !== JSON.stringify(eic.okuyucular)) sorun.push('okuyucu orijinalinkinden farklı');
      if (t.w !== a.w || t.h !== a.h) sorun.push(`boyut ${t.w}x${t.h} (${a.w}x${a.h} bekleniyordu)`);
      if (sorun.length) hata('xnb', `${a.rel}: ${sorun.join(' · ')}`);
      doku[ad] = dokuRgba(t); eskiDoku[ad] = dokuRgba(eic.nesne);
    } catch (e) { hata('xnb', `${a.rel} açılamadı: ${e.message}`); }
  }

  // 3. dat: iskelet (sıra, aralar, baş, son) ve dokunulmaması gereken her blok metin olarak aynı
  let eX, yX;
  try { yX = zlib.inflateSync(dosyalar[DAT_REL]).toString('utf8'); } catch (e) { hata('dat', `açılamadı: ${e.message}`); return h; }
  eX = zlib.inflateSync(girdi.dat).toString('utf8');
  const e = bol(eX), y = bol(yX);
  if (y.atlasSayisi !== y.bloklar.length) hata('iskelet', `${y.atlasSayisi} <Atlas, ${y.bloklar.length} blok çözüldü`);
  const beklenenIskelet = e.iskelet.replace(`«${ONCEKI}»`, `«${ONCEKI}»\r\n  «${EKLENEN}»`);
  if (!e.iskelet.includes(`«${ONCEKI}»`)) hata('iskelet', `orijinalde ${ONCEKI} yok`);
  else if (y.iskelet !== beklenenIskelet) hata('iskelet', `blok sırası ya da aralar beklenenden farklı (${EKLENEN} ${ONCEKI}'nun hemen ardında, CRLF + 2 boşluk): ${ilkFark(beklenenIskelet, y.iskelet)}`);
  for (const [ad, liste] of [['FileName', [...y.bloklar].map(([a]) => a)], ['ContentPath', [...yX.matchAll(/<Atlas [^>]*ContentPath="([^"]*)"/g)].map((m) => m[1])]]) {
    const cift = liste.filter((v, i) => liste.indexOf(v) !== i);
    if (cift.length) hata('blok', `aynı ${ad} birden çok kez: ${[...new Set(cift)].join(', ')}${ad === 'ContentPath' ? ' (oyun Dictionary.Add\'de durur)' : ''}`);
  }
  const degismemeli = e.bloklar.filter(([ad]) => !DEGISEN.includes(ad));
  const degisen = degismemeli.filter(([ad, m]) => y.harita.get(ad) !== m).map(([ad]) => ad);
  if (degisen.length) hata('blok', `dokunulmaması gereken ${degisen.length} atlas değişmiş: ${degisen.slice(0, 5).join(', ')}`);
  const fazlaBlok = y.bloklar.map(([ad]) => ad).filter((ad) => !e.harita.has(ad) && ad !== EKLENEN);
  if (fazlaBlok.length) hata('blok', `beklenmeyen yeni atlas: ${fazlaBlok.join(', ')}`);

  // 4. Dört atlas: başlık, satır biçimi, eski kareler, yeni kareler, doku içinde, pikseller
  const ac = (harita, ad, etiket) => { const m = harita.get(ad); if (!m) { hata('blok', `${etiket} dat'ta ${ad} yok`); return null; } return blokAc(m); };
  const fr = ac(e.harita, 'AreaTitles_FR', 'orijinal'), en = ac(e.harita, 'AreaTitles', 'orijinal');
  const beklenenler = {
    LocFlags: { eski: ac(e.harita, 'LocFlags', 'orijinal'), oz: { Height: '256', FrameCount: '12' }, yeni: [BAYRAK_KARE], yeniNo: BAYRAK_NO },
    LocToastLatin: { eski: ac(e.harita, 'LocToastLatin', 'orijinal'), oz: { FrameCount: '18' }, yeni: TR_KARELER, yeniNo: 15 },
    // LevelUp: dört yeni kare TEK satırda (Count=4, alt alta), öbürlerinde her kare ayrı satır
    LevelUp: { eski: ac(e.harita, 'LevelUp', 'orijinal'), oz: { Height: String(SEVIYE_ATLAS.yeniH), FrameCount: String(SEVIYE_ATLAS.yeniKareSayisi) },
      yeni: SEVIYE_KARELER, yeniNo: SEVIYE_ATLAS.eskiKareSayisi, yeniSatir: 1, satirKalibi: DIKEY_DORT },
    // PauseMenu: tek yeni kare (kare 157, "SV.") tek karelik satırda; eski 157 kare ve pikselleri (kare 118 "LV." dahil) yerinde
    PauseMenu: { eski: ac(e.harita, 'PauseMenu', 'orijinal'), oz: { Height: String(SV_ATLAS.yeniH), FrameCount: String(SV_ATLAS.yeniKareSayisi) },
      yeni: [SV_KARE], yeniNo: SV_ATLAS.eskiKareSayisi },
  };
  for (const [ad, b] of Object.entries(beklenenler)) {
    const yb = ac(y.harita, ad, 'yeni');
    if (!yb || !b.eski) continue;
    bicimDenetle(ad, yb);
    // başlık: aynı öznitelikler aynı sırada; yalnız beklenenler değişmiş
    const bekOz = b.eski.oz.map(([k, v]) => [k, b.oz[k] ?? v]);
    if (JSON.stringify(yb.oz) !== JSON.stringify(bekOz)) hata('blok', `${ad} başlığı ${JSON.stringify(Object.fromEntries(yb.oz))} (beklenen ${JSON.stringify(Object.fromEntries(bekOz))})`);
    // eski satırlar metin olarak aynı, ardından yalnız yeni kareler
    const n = b.eski.kareSatir.length, ayniDegil = b.eski.kareSatir.findIndex((s, i) => yb.kareSatir[i] !== s);
    if (ayniDegil >= 0) hata('kare', `${ad} eski kare satırı ${ayniDegil} değişmiş: ${yb.kareSatir[ayniDegil]}`);
    const yeniSatir = b.yeniSatir ?? b.yeni.length, satirKalibi = b.satirKalibi ?? TEK_KARE;
    if (yb.kareSatir.length !== n + yeniSatir) hata('kare', `${ad} ${yb.kareSatir.length} kare satırı (${n} + ${yeniSatir} bekleniyordu)`);
    yb.kareSatir.slice(n).forEach((s, i) => { if (kalip(s) !== satirKalibi) hata('blok', `${ad} yeni satır ${n + i} beklenen biçimde (${satirKalibi === TEK_KARE ? 'tek kare' : 'dikey dört kare'}) değil: ${s}`); });
    kareDenetle(ad, yb, (yk) => {
      const ek = b.eski.cerceve.every(Boolean) && eskiDoku[ad] ? kareHesapla(b.eski.cerceve, eskiDoku[ad].w) : [];
      ek.forEach((k, i) => {
        if (dikdortgen(yk[i] || {}) !== dikdortgen(k)) hata('kare', `${ad} eski kare ${i} ${dikdortgen(k)} → ${yk[i] ? dikdortgen(yk[i]) : 'yok'}`);
        else if (doku[ad] && !disinda(k, doku[ad]) && !disinda(k, eskiDoku[ad])) {
          const f = pikselFarki(doku[ad], eskiDoku[ad], k);
          if (f) hata('piksel', `${ad} eski kare ${i} ${f} pikselde orijinalden farklı`);
        }
      });
      b.yeni.forEach((k, i) => {
        const g = yk[b.yeniNo + i];
        if (!g || dikdortgen(g) !== dikdortgen(k)) hata('kare', `${ad} kare ${b.yeniNo + i} ${g ? dikdortgen(g) : 'yok'} (beklenen ${dikdortgen(k)})`);
        // Yeni karenin pikseli araç tablosundaki özetle aynı mı (özeti olan kareler: LevelUp, PauseMenu)
        else if (k.ozet && doku[ad] && !disinda(g, doku[ad]) && kareOzeti(doku[ad], g) !== k.ozet) hata('piksel', `${ad} kare ${b.yeniNo + i} pikseli onaylı özetten farklı`);
      });
    });
  }
  // AreaTitles_TR: FR'nin biçiminde, kare 15-22 AreaTitles'ınkiyle aynı (pikseliyle), öbürleri varlık tablosundaki gibi
  const tr = ac(y.harita, EKLENEN, 'yeni');
  if (tr && fr && en) {
    bicimDenetle(EKLENEN, tr);
    const json = JSON.parse(varlikOku(VARLIK_AD.kareJson).toString('utf8')).kareler;
    const a = ATLASLAR[EKLENEN];
    const bekOz = fr.oz.map(([k, v]) => [k, { FileName: EKLENEN, ContentPath: `Overlays/PlayerHUD/${EKLENEN}`, Width: String(a.w), Height: String(a.h), FrameCount: String(json.length) }[k] ?? v]);
    if (JSON.stringify(tr.oz) !== JSON.stringify(bekOz)) hata('blok', `${EKLENEN} başlığı ${JSON.stringify(Object.fromEntries(tr.oz))} (beklenen ${JSON.stringify(Object.fromEntries(bekOz))})`);
    if (fr.kareSatir.some((s) => kalip(s) !== TEK_KARE)) hata('blok', 'orijinal AreaTitles_FR satırları tek kare biçiminde değil (örnek varsayımı bozuldu)');
    tr.kareSatir.forEach((s, i) => { if (kalip(s) !== TEK_KARE) hata('blok', `${EKLENEN} satır ${i} AreaTitles_FR biçiminde (tek kare) değil: ${s}`); });
    kareDenetle(EKLENEN, tr, (yk) => {
      if (yk.length !== json.length) hata('kare', `${EKLENEN} ${yk.length} kare (${json.length} bekleniyordu)`);
      const ek = en.cerceve.every(Boolean) && eskiDoku[EKLENEN] ? kareHesapla(en.cerceve, eskiDoku[EKLENEN].w) : [];
      json.forEach((j, i) => {
        const g = yk[i], ortak = i >= BASLIK_ORTAK[0] && i <= BASLIK_ORTAK[1], bek = ortak ? ek[i] : j;
        if (!g || !bek || dikdortgen(g) !== dikdortgen(bek)) return hata('kare', `${EKLENEN} kare ${i} ${g ? dikdortgen(g) : 'yok'} (beklenen ${bek ? dikdortgen(bek) : '?'}${ortak ? ', AreaTitles\'tan' : ''})`);
        if (ortak && doku[EKLENEN] && !disinda(g, doku[EKLENEN]) && !disinda(g, eskiDoku[EKLENEN])) {
          const f = pikselFarki(doku[EKLENEN], eskiDoku[EKLENEN], g);
          if (f) hata('piksel', `${EKLENEN} kare ${i} ${f} pikselde AreaTitles'tan farklı`);
        }
      });
    });
  }
  return h;

  // Değişen ya da eklenen bloğun yazımı: CRLF, girinti 2/4, her kare satırı oyunun biçiminde, FrameCount = kare toplamı
  function bicimDenetle(ad, b) {
    if (b.eol !== '\r\n' || b.kareGirinti !== '    ' || b.atlasGirinti !== '  ' || !b.girintiTutarli)
      hata('blok', `${ad} yazımı: satır sonu ${JSON.stringify(b.eol)} · kare girintisi ${JSON.stringify(b.kareGirinti)} · kapanış girintisi ${JSON.stringify(b.atlasGirinti)}${b.girintiTutarli ? '' : ' · girinti tutarsız'}`);
    const bozuk = b.cerceve.findIndex((f) => !f);
    if (bozuk >= 0) hata('blok', `${ad} kare satırı ${bozuk} çözülemedi: ${b.kareSatir[bozuk]}`);
    const toplam = b.cerceve.reduce((t, f) => t + (f ? f.count : 0), 0);
    if (b.ozNesne.FrameCount !== String(toplam)) hata('blok', `${ad} FrameCount="${b.ozNesne.FrameCount}" ama kareler ${toplam}`);
  }
  // Kareleri oyunun yoluyla hesaplar; her kare dokunun içinde ve boş değil; başlıktaki boyut dokununkiyle aynı; sonra özel denetim.
  function kareDenetle(ad, b, ozel) {
    const img = doku[ad];
    if (!img) return; // XNB açılamadı: [xnb] hatası verildi
    if (b.ozNesne.Width !== String(img.w) || b.ozNesne.Height !== String(img.h)) hata('blok', `${ad} başlıkta ${b.ozNesne.Width}x${b.ozNesne.Height}, doku ${img.w}x${img.h}`);
    if (!b.cerceve.every(Boolean)) return;
    let yk;
    try { yk = kareHesapla(b.cerceve, img.w); } catch (e) { return hata('doku', `${ad}: ${e.message}`); }
    yk.forEach((k, i) => {
      if (disinda(k, img)) hata('doku', `${ad} kare ${i} (${dikdortgen(k)}) ${img.w}x${img.h} dokunun dışına taşıyor`);
      else if (!doluPiksel(img, k)) hata('piksel', `${ad} kare ${i} (${dikdortgen(k)}) bomboş`);
    });
    ozel(yk);
  }
}

// ---------------------------------------------------------------- komut satırı
function agacOku(kok) { // kok altındaki bütün dosyalar, göreli yol (/ ile)
  const liste = [];
  const gez = (d) => { for (const g of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, g.name); if (g.isDirectory()) gez(f); else liste.push(path.relative(kok, f).replace(/\\/g, '/')); } };
  if (fs.existsSync(kok)) gez(kok);
  return liste;
}
function agacYaz(kok, dosyalar) {
  fs.rmSync(path.join(kok, 'Content'), { recursive: true, force: true }); // eski sürümden dosya kalmasın
  for (const [rel, buf] of Object.entries(dosyalar)) {
    const f = path.join(kok, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  }
  const agac = agacOku(kok);
  return { agac, geri: Object.fromEntries(agac.map((rel) => [rel, fs.readFileSync(path.join(kok, rel))])) };
}

function ana() {
  const girdi = girdiOku(), dosyalar = icerikUret(girdi);
  const { agac, geri } = agacYaz(ICERIK, dosyalar);
  for (const rel of agac) console.log(`yazıldı: ${path.relative(KOK, path.join(ICERIK, rel)).replace(/\\/g, '/')} (${geri[rel].length} bayt)`);
  const h = denetle(girdi, geri, agac);
  const xml = zlib.inflateSync(geri[DAT_REL]).toString('utf8');
  for (const ad of ['LocFlags', 'LocToastLatin', 'LevelUp', 'PauseMenu', EKLENEN]) {
    const b = blokAc(tekBlok(xml, ad).metin);
    console.log(`atlas ${ad}: ${b.ozNesne.Width}x${b.ozNesne.Height}, ${b.ozNesne.FrameCount} kare`);
  }
  if (h.length) { console.log('DENETİM: TUTMADI\n  ' + h.join('\n  ')); process.exit(1); }
  console.log('DENETİM: TAMAM (diske yazılan geri okundu: ağaçta yalnız 6 dosya · dat\'ta yalnız LocFlags, LocToastLatin, LevelUp, PauseMenu değişti ve AreaTitles_TR RU\'nun ardına eklendi · eski kareler ve pikselleri yerinde · her kare dokusunun içinde ve dolu · yeni karelerin pikseli onaylı özetle aynı (özeti olanlar) · XNB\'ler beklenen boyda)');
  console.log('bu denetim şunu göremez: oyunun bu dosyaları yüklediğini ve kareleri çizdiğini (oyun dışı sınama ve oyunun kendisi) · yeni karelerin pikselinin doğruluğunu (yalnız özeti olan kareler ölçülür: LevelUp, LocToastLatin, PauseMenu; bayrak ve başlıklar için bayrak/baslik-ciz sınamaları) · exe\'nin bu kareleri istediğini');
}

// Karşı test: gerçek üretim geçici klasöre yazılır, geri okunur; bozulmamışta hata olmamalı, her bozmada beklenen etiketle hata.
function sina() {
  const girdi = girdiOku(), kok = fs.mkdtempSync(path.join(os.tmpdir(), 'icerik-sina-'));
  let kotu = 0;
  const sonuc = (tuttu, ad, ayrinti) => { if (!tuttu) kotu++; console.log(`${tuttu ? 'TUTTU  ' : 'TUTMADI'} ${ad}: ${ayrinti}`); };
  try {
    const { agac, geri } = agacYaz(kok, icerikUret(girdi));
    const datBoz = (fn) => ({ ...geri, [DAT_REL]: zlib.deflateSync(Buffer.from(fn(zlib.inflateSync(geri[DAT_REL]).toString('utf8')), 'utf8')) });
    const blokBoz = (ad, fn) => datBoz((x) => { const b = tekBlok(x, ad); return x.slice(0, b.bas) + fn(b.metin) + x.slice(b.son); });
    const degistir = (ad, eski, yeni) => blokBoz(ad, (m) => {
      if (m.split(eski).length !== 2) throw new Error(`karşı test kurulamadı: ${ad} bloğunda "${eski}" tam bir kez yok`);
      return m.replace(eski, yeni);
    });
    const xnbBoz = (rel, fn) => { // dokuyu değiştirip yeniden yazar
      const k = xnbAc(geri[rel]), ic = icerikOku(k.ham), n = fn({ ...ic.nesne, mipler: [Buffer.from(ic.nesne.mipler[0])] });
      return { ...geri, [rel]: xnbYaz(icerikYaz({ okuyucular: ic.okuyucular, nesne: n }), k) };
    };
    const trBlok = () => tekBlok(zlib.inflateSync(geri[DAT_REL]).toString('utf8'), EKLENEN).metin;
    const sonSatir = trBlok().split('\r\n').at(-2); // kare 23
    const k23 = sonSatir.match(/FrameSize="\{X:(\d+) Y:\d+\}" StartCoordinates="\{X:(\d+) Y:(\d+)\}"/);
    const durumlar = [
      ['bozulmamış', geri, agac, null],
      ['ağaçta yan dosya (-kareler.json)', geri, [...agac, 'Content/Overlays/PlayerHUD/AreaTitles_TR-kareler.json'], 'ağaç'],
      ['ağaçta AreaTitles_TR eksik', geri, agac.filter((r) => r !== BASLIK_TR_REL), 'ağaç'],
      ['LocToastLatin eski kare 0 kaymış', () => degistir('LocToastLatin', 'StartCoordinates="{X:0 Y:0}"', 'StartCoordinates="{X:0 Y:1}"'), agac, 'kare'],
      ['LocFlags eski kare kaymış', () => degistir('LocFlags', 'StartCoordinates="{X:0 Y:43}"', 'StartCoordinates="{X:0 Y:44}"'), agac, 'kare'],
      ['başka atlasa dokunulmuş', () => degistir('LunaisSprite', 'Width="504"', 'Width="505"'), agac, 'blok'],
      ['blok arasına bir boşluk', () => datBoz((x) => x.replace('\r\n  <Atlas FileName="LocToastAsian"', '\r\n   <Atlas FileName="LocToastAsian"')), agac, 'iskelet'],
      ['AreaTitles_TR bloğu eksik', () => datBoz((x) => { const b = tekBlok(x, EKLENEN); return x.slice(0, b.bas - 4) + x.slice(b.son); }), agac, 'iskelet'],
      ['AreaTitles_TR yanlış yerde (LocToastLatin\'den sonra)', () => datBoz((x) => {
        const b = tekBlok(x, EKLENEN), y = x.slice(0, b.bas - 4) + x.slice(b.son), lt = tekBlok(y, 'LocToastLatin');
        return y.slice(0, lt.son) + '\r\n  ' + b.metin + y.slice(lt.son);
      }), agac, 'iskelet'],
      ['AreaTitles_TR kare 23 dokudan taşıyor', () => degistir(EKLENEN, `StartCoordinates="{X:${k23[2]} Y:${k23[3]}}"`, `StartCoordinates="{X:${257 - +k23[1]} Y:${k23[3]}}"`), agac, 'doku'],
      ['AreaTitles_TR kare 15 AreaTitles\'tan farklı', () => degistir(EKLENEN, 'StartCoordinates="{X:0 Y:460}"', 'StartCoordinates="{X:0 Y:461}"'), agac, 'kare'],
      ['AreaTitles_TR satır sonu LF', () => blokBoz(EKLENEN, (m) => m.replace(/\r\n/g, '\n')), agac, 'blok'],
      ['AreaTitles_TR ContentPath RU\'nunki', () => degistir(EKLENEN, 'ContentPath="Overlays/PlayerHUD/AreaTitles_TR"', 'ContentPath="Overlays/PlayerHUD/AreaTitles_RU"'), agac, 'blok'],
      ['LocToastLatin FrameCount yazılmamış', () => degistir('LocToastLatin', 'FrameCount="18"', 'FrameCount="15"'), agac, 'blok'],
      ['LocToastLatin kare 15 yanlış yerde', () => degistir('LocToastLatin', 'StartCoordinates="{X:146 Y:106}"', 'StartCoordinates="{X:146 Y:105}"'), agac, 'kare'],
      ['LocToastLatin.xnb oyunun yamasız dosyası', () => ({ ...geri, [BILDIRIM_REL.locToast]: girdi.locToast }), agac, 'xnb'],
      ['LocToastLatin.xnb eski karede bir piksel', () => xnbBoz(BILDIRIM_REL.locToast, (n) => { n.mipler[0][(5 * 256 + 5) * 4] ^= 1; return n; }), agac, 'piksel'],
      ['AreaTitles_TR.xnb çerçeve karesinde bir piksel', () => xnbBoz(BASLIK_TR_REL, (n) => { const p = ((460 + 10) * 256 + 10) * 4; n.mipler[0][p] ^= 0x10; n.mipler[0][p + 3] = 255; return n; }), agac, 'piksel'],
      ['AreaTitles_TR.xnb yarım boy (256x256)', () => xnbBoz(BASLIK_TR_REL, (n) => ({ ...n, h: 256, mipler: [n.mipler[0].subarray(0, 256 * 256 * 4)] })), agac, 'xnb'],
      ['LocFlags.xnb eski bayrakta bir piksel', () => xnbBoz(LOCFLAGS_REL, (n) => { n.mipler[0][(10 * 256 + 10) * 4] ^= 1; return n; }), agac, 'piksel'],
      // LevelUp (seviye.mjs): kare 34-37 y=256..316, 128x20; atlas 128x512, başlıkta Height 512 ve FrameCount 38
      ['ağaçta LevelUp eksik', geri, agac.filter((r) => r !== SEVIYE_REL), 'ağaç'],
      ['LevelUp eski kare kaymış', () => degistir('LevelUp', 'StartCoordinates="{X:114 Y:0}"', 'StartCoordinates="{X:114 Y:1}"'), agac, 'kare'],
      ['LevelUp yeni satır 1 piksel aşağıda', () => degistir('LevelUp', 'StartCoordinates="{X:0 Y:256}"', 'StartCoordinates="{X:0 Y:257}"'), agac, 'kare'],
      ['LevelUp yeni satır dokunun dışına taşıyor', () => degistir('LevelUp', 'StartCoordinates="{X:0 Y:256}"', 'StartCoordinates="{X:0 Y:500}"'), agac, 'doku'],
      ['LevelUp Height yazılmamış', () => degistir('LevelUp', 'Height="512"', 'Height="256"'), agac, 'blok'],
      ['LevelUp FrameCount yazılmamış', () => degistir('LevelUp', 'FrameCount="38"', 'FrameCount="34"'), agac, 'blok'],
      ['LevelUp yeni satır tek kare biçiminde (Count=1)', () => degistir('LevelUp', 'Count="4" RowWidth="1" StartIndex="0" FrameSize="{X:128 Y:20}"', 'Count="1" RowWidth="0" StartIndex="0" FrameSize="{X:128 Y:20}"'), agac, 'blok'],
      ['LevelUp.xnb oyunun yamasız dosyası (128x256)', () => ({ ...geri, [SEVIYE_REL]: girdi.levelUp }), agac, 'xnb'],
      ['LevelUp.xnb eski karede bir piksel', () => xnbBoz(SEVIYE_REL, (n) => { n.mipler[0][(5 * 128 + 5) * 4] ^= 1; return n; }), agac, 'piksel'],
      ['LevelUp.xnb yeni karede bir piksel', () => xnbBoz(SEVIYE_REL, (n) => { n.mipler[0][(260 * 128 + 10) * 4] ^= 1; return n; }), agac, 'piksel'],
      // PauseMenu (sv.mjs): kare 157 (0,256) 18x12; atlas 256x512, başlıkta Height 512 ve FrameCount 158; eski kare 118 "LV." (113,51) yerinde
      ['ağaçta PauseMenu eksik', geri, agac.filter((r) => r !== PAUSE_REL), 'ağaç'],
      ['PauseMenu eski kare (LV.) kaymış', () => degistir('PauseMenu', 'StartCoordinates="{X:113 Y:51}"', 'StartCoordinates="{X:113 Y:52}"'), agac, 'kare'],
      ['PauseMenu yeni satır 1 piksel aşağıda', () => degistir('PauseMenu', 'StartCoordinates="{X:0 Y:256}"', 'StartCoordinates="{X:0 Y:257}"'), agac, 'kare'],
      ['PauseMenu yeni satır dokunun dışına taşıyor', () => degistir('PauseMenu', 'StartCoordinates="{X:0 Y:256}"', 'StartCoordinates="{X:0 Y:505}"'), agac, 'doku'],
      ['PauseMenu Height yazılmamış', () => degistir('PauseMenu', 'Height="512"', 'Height="256"'), agac, 'blok'],
      ['PauseMenu FrameCount yazılmamış', () => degistir('PauseMenu', 'FrameCount="158"', 'FrameCount="157"'), agac, 'blok'],
      ['PauseMenu yeni satır tek kare biçiminde değil (Count=2)', () => degistir('PauseMenu', 'Count="1" RowWidth="0" StartIndex="0" FrameSize="{X:18 Y:12}" StartCoordinates="{X:0 Y:256}"', 'Count="2" RowWidth="2" StartIndex="0" FrameSize="{X:18 Y:12}" StartCoordinates="{X:0 Y:256}"'), agac, 'blok'],
      ['PauseMenu.xnb oyunun yamasız dosyası (256x256)', () => ({ ...geri, [PAUSE_REL]: girdi.pauseMenu }), agac, 'xnb'],
      ['PauseMenu.xnb eski karede bir piksel', () => xnbBoz(PAUSE_REL, (n) => { n.mipler[0][(5 * 256 + 5) * 4] ^= 1; return n; }), agac, 'piksel'],
      ['PauseMenu.xnb özgün "LV." karesinde (118) bir piksel', () => xnbBoz(PAUSE_REL, (n) => { n.mipler[0][(54 * 256 + 116) * 4] ^= 1; return n; }), agac, 'piksel'],
      ['PauseMenu.xnb yeni karede (157) bir piksel', () => xnbBoz(PAUSE_REL, (n) => { n.mipler[0][(260 * 256 + 10) * 4] ^= 1; return n; }), agac, 'piksel'],
    ];
    for (const [ad, d, ag, etiket] of durumlar) {
      let h;
      try { h = denetle(girdi, typeof d === 'function' ? d() : d, ag); } catch (e) { sonuc(false, ad, `denetim/kurulum istisnası: ${e.message}`); continue; }
      const tuttu = etiket ? h.some((m) => m.startsWith(`[${etiket}]`)) : h.length === 0;
      sonuc(tuttu, ad, h.length ? h.slice(0, 2).join(' · ') + (h.length > 2 ? ` (+${h.length - 2})` : '') : 'hata yok');
    }
    // Yamalı dat'a ikinci kez uygulanınca dokunmadan durmalı
    let durdu = false; try { datYamala(geri[DAT_REL], { baslik: [], bildirim: [], seviye: [], pause: [] }); } catch (e) { durdu = /zaten/.test(e.message); }
    sonuc(durdu, 'datYamala ikinci kez', durdu ? 'reddedildi' : 'İKİNCİ KEZ UYGULANDI');
  } finally { fs.rmSync(kok, { recursive: true, force: true }); }
  console.log('bu sınama şunu göremez: oyunun dosyaları yüklediğini · FNA\'nın 128x512 LevelUp ve 256x512 PauseMenu atlasını okuduğunu · yeni karelerin pikselinin doğruluğunu (özeti olmayanlar için öbür araçların sınaması) · ham/icerik/ ağacının güncel olduğunu (node tools/icerik.mjs yeniden yazar)');
  console.log(kotu ? `HÜKÜM: KALDI (${kotu} durum tutmadı)` : 'HÜKÜM: GEÇTİ');
  process.exit(kotu ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const komut = process.argv[2];
  if (komut === 'sina') sina(); else if (!komut) ana();
  else { console.log('kullanım: node tools/icerik.mjs [sina]'); process.exit(2); }
}
