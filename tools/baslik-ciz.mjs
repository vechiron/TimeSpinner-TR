// Türkçe bölge başlıkları: AreaTitles_TR.xnb. Oyun yeni bölgeye girince adı bu atlastan resim olarak gösterir
// (GCM.LoadLocalizedContent). Önizlemelerden Alegreya Italic (OFL) ile çizilen yumuşak çeşit seçildi.
//
//   node tools/baslik-ciz.mjs ciz            geliştirme: yazı tipini (yoksa) indirir ve md5'ini doğrular,
//                                            tools/baslik-ciz.cs'yi derler, adları çizer, tools/varlik/'e iki dosya yazar
//   node tools/baslik-ciz.mjs uret <cikis>   <cikis>/Content/Overlays/PlayerHUD/AreaTitles_TR.xnb + yanına
//                                            AreaTitles_TR-kareler.json (girdi: oyunun orijinal AreaTitles.xnb'si)
//   node tools/baslik-ciz.mjs sina           denetim + karşı testler; son satır HÜKÜM: GEÇTİ / KALDI (çıkış 0 / 1)
//
// Depodaki dosyalar (tools/varlik/): AreaTitles_TR-adlar.tsv (adların tek yeri) · AreaTitles_TR-bizim.png (yalnız
// bizim çizdiğimiz pikseller, oyunun bölgesi şeffaf) · AreaTitles_TR-kareler.json (24 kare, hangisi kimin).
// Oyunun bölgesi (çerçeve, süs, tarih: kare 15-22) kurulumda kullanıcının AreaTitles.xnb'sinden alınır.
// Kurulum yolu (areaTitlesUret) yalnız Node ister; yazı tipi ve C# yalnız geliştirmede (ciz, sina).
// tools/varlik/ dosyaları YALNIZ `varlikOku(ad)` ile okunur: normal Node'da dosyadan, Node SEA'da (tek exe kurulum
// programı) exe'ye gömülü varlıktan (node:sea getAsset). Varlık adı = tools/varlik/'ten göreli yol, "/" ile
// (VARLIK_AD): SEA yapılandırmasında anahtar tam bu ad olmalı ("AreaTitles_TR-bizim.png": "tools/varlik/AreaTitles_TR-bizim.png").
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { orijinal, OYUN } from './oyun-yolu.mjs';
import { xnbAc, xnbYaz, icerikOku, icerikYaz, dokuRgba, pngOku, pngKodla } from './xnb.mjs';
import { atlasKareleri } from './bayrak.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VARLIK = path.join(KOK, 'tools', 'varlik');
export const VARLIK_AD = { adlar: 'AreaTitles_TR-adlar.tsv', bizimPng: 'AreaTitles_TR-bizim.png', kareJson: 'AreaTitles_TR-kareler.json' };
export const ADLAR = path.join(VARLIK, VARLIK_AD.adlar);        // yollar yalnız YAZMA ve gösterme için;
export const BIZIM_PNG = path.join(VARLIK, VARLIK_AD.bizimPng); // okuma varlikOku(ad) ile
export const KARE_JSON = path.join(VARLIK, VARLIK_AD.kareJson);
const CALISMA = path.join(KOK, 'ham', 'baslik'); // git dışı: yazı tipi, derlenen exe, sınama çıktısı
const ONIZLEME = path.join(KOK, 'ham', 'onizleme', 'yazitipi', 'alegreya'); // onaylı önizleme: kimlik ölçütü
export const OYUN_REL = 'Content/Overlays/PlayerHUD/AreaTitles.xnb';
export const TR_REL = 'Content/Overlays/PlayerHUD/AreaTitles_TR.xnb';
// Oyunun orijinal AreaTitles.xnb'si (Steam, 11.11.2026). Başka bir dosyada bizim bölgemiz yanlış yere oturabilir.
export const OYUN_SHA256 = '52e9cbc23950ee1c7be1c9905f6a1728b102ae4c37ab1c4aac03aa0c8b2cd8a7';
const YAZI_TIPI = { // google/fonts'ta dosyaya dokunan son commit'e sabit: main değişse de aynı bayt gelir
  url: 'https://raw.githubusercontent.com/google/fonts/40478177239cbf3bac07908ef0738afee0f72be7/ofl/alegreya/Alegreya-Italic%5Bwght%5D.ttf',
  md5: '2e58806da43978f674df51a46f34ce4d',
  yol: path.join(CALISMA, 'yazitipi', 'Alegreya-Italic[wght].ttf'),
};
const FW = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319';

// Çizimin değişmezleri (önizlemede ölçüldü: ham/onizleme/yazitipi/RAPOR.md): x-yüksekliği 12 px · dolgu 8 tonluk gri
// palete nicemlenir · kontur = dolgunun 4-komşu genişletmesi, renk 24 · kare 30 px · kare en çok 250 px (FR'nin en
// genişi). Ton eğrisi önizlemede orijinalin ton dağılımına uydurulmuştu (üs 1/1.8, eşik 0.02); burada sabit, yoksa
// bir ad değişince öbür başlıkların da görünüşü kayardı.
const XH = 12, PALET = [24, 44, 74, 109, 146, 182, 211, 232], KONTUR = 24, KARE = 30, PAY = 10, SINIR = 250;
export const TON = { us: 1.8, esik: 0.02 };
const W = 256, H = 512, KARE_NO = [...Array(15).keys(), 23];
// Oyunun bölgesi: y≥455, kare 23'ün şeridi (455≤y<485, x≥48) hariç. Kare 15-22 burada (sina ölçer).
export const oyunBolgesi = (x, y) => y >= 455 && (y >= 485 || x < 48);

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

// ---------------------------------------------------------------- varlık okuma (dosya ya da SEA)
// tools/varlik/ varlıklarının TEK okuma yeri. Dönüş her çağrıda yeni bir Buffer (dosyadan okuyanla aynı sözleşme).
// ad: tools/varlik/'ten göreli yol, "/" ile; başında "/" , ".." , "\" , ":" , boş parça olamaz.
const varlikAdiDenetle = (ad) => {
  if (typeof ad !== 'string' || !ad || ad.split('/').some((p) => !p || p === '.' || p === '..' || /[\\:\0]/.test(p)))
    throw new Error(`varlık adı geçersiz: ${JSON.stringify(ad)} (tools/varlik/'ten göreli yol, "/" ile; ".." ve kök olamaz)`);
};

function varlikDosyadan(ad) {
  const yol = path.join(VARLIK, ...ad.split('/'));
  try { return fs.readFileSync(yol); } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`varlık bulunamadı: "${ad}" (dosya yok: ${yol})`, { cause: e });
    throw e;
  }
}

// sea: node:sea benzeri nesne ({ getAsset(ad) → ArrayBuffer, yoksa hata fırlatır }). getAsset kopya döndürür; Buffer onu sarar.
function varlikSeaDan(sea, ad) {
  let veri;
  try { veri = sea.getAsset(ad); } catch (e) {
    throw new Error(`varlık bulunamadı: "${ad}" (kurulum exe'sine gömülü değil: ${e.message})`, { cause: e });
  }
  if (Object.prototype.toString.call(veri) === '[object ArrayBuffer]') return Buffer.from(veri);
  if (ArrayBuffer.isView(veri)) return Buffer.from(veri.buffer, veri.byteOffset, veri.byteLength);
  throw new Error(`varlık bulunamadı: "${ad}" (getAsset ${veri == null ? String(veri) : typeof veri} döndürdü, ArrayBuffer bekleniyordu)`);
}

// SEA mı? `node betik.mjs` koşumunda (argv[1] betik dosyası; SEA'da argv[1] exe yoludur) node:sea'ya hiç dokunulmaz.
// Aksi halde modül tembel yüklenir (en üstte içe aktarılmaz; yoksa ya da hata verirse dosya yolu kullanılır) ve
// kararı isSea() verir. Node >= 22.3 (process.getBuiltinModule). SEA dışında getAsset hiç çağrılmaz.
function seaBul() {
  if (/\.[cm]?js$/i.test(process.argv[1] ?? '')) return null;
  try {
    const sea = process.getBuiltinModule?.('node:sea');
    return sea?.isSea?.() ? sea : null;
  } catch { return null; }
}

// Okuyucu üretir: sea verilmişse (sınamada sahte) oradan, null ise dosyadan.
export function varlikOkuYap(sea) {
  return (ad) => { varlikAdiDenetle(ad); return sea ? varlikSeaDan(sea, ad) : varlikDosyadan(ad); };
}

let okuyucu = null; // ilk çağrıda SEA mı bakılır, süreç boyunca aynı kalır
export function varlikOku(ad) {
  okuyucu ??= varlikOkuYap(seaBul());
  return okuyucu(ad);
}

// ---------------------------------------------------------------- adlar
// dosya verilmezse varlık okunur (VARLIK_AD.adlar); verilirse o dosya (yalnız deneme için).
export function adlariOku(dosya) {
  const etiket = dosya ? path.basename(dosya) : VARLIK_AD.adlar;
  const metin = dosya ? fs.readFileSync(dosya, 'utf8') : varlikOku(VARLIK_AD.adlar).toString('utf8');
  const adlar = metin.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => {
    const m = l.match(/^(\d+)\t(\S.*)$/);
    if (!m) throw new Error(`${etiket}: satır "kare<TAB>ad" değil: ${l}`);
    return [+m[1], m[2]];
  });
  if (adlar.map(([no]) => no).join() !== KARE_NO.join()) throw new Error(`${etiket}: kareler sırayla ${KARE_NO.join(',')} olmalı`);
  return adlar;
}

// ---------------------------------------------------------------- çizim (geliştirme: yazı tipi + C#)
async function yaziTipi(indir) {
  const { yol, url } = YAZI_TIPI;
  if (fs.existsSync(yol)) {
    if (md5(fs.readFileSync(yol)) !== YAZI_TIPI.md5) throw new Error(`${yol}: md5 tutmuyor; dosyayı silip ciz'i yeniden koşun`);
    return yol;
  }
  if (!indir) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`yazı tipi indirilemedi: HTTP ${r.status} ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (md5(b) !== YAZI_TIPI.md5) throw new Error(`indirilen yazı tipinin md5'i ${md5(b)} (beklenen ${YAZI_TIPI.md5}); yazılmadı`);
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, b);
  console.log(`yazı tipi indirildi, md5 tuttu: ${path.relative(KOK, yol)}`);
  return yol;
}

export function derle() { // seviye.mjs de aynı çiziciyi kullanır
  const exe = path.join(CALISMA, 'baslik-ciz.exe');
  fs.mkdirSync(CALISMA, { recursive: true });
  // /codepage:65001: kaynak BOM'suz UTF-8 · /platform:x64: önizlemedeki cizici.exe de öyle derlenmişti
  const r = spawnSync(`${FW}/csc.exe`, ['/nologo', '/utf8output', '/codepage:65001', '/platform:x64', '/target:exe', `/out:${exe}`,
    `/r:${FW}/WPF/PresentationCore.dll`, `/r:${FW}/WPF/WindowsBase.dll`, `/r:${FW}/System.Xaml.dll`, path.join(KOK, 'tools', 'baslik-ciz.cs')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`baslik-ciz.cs derlenemedi (çıkış ${r.status}):\n${r.stdout || ''}${r.stderr || r.error || ''}`);
  return exe;
}

// baslik-ciz.exe → her başlık için kapsama haritası {W, H, k} (H = KARE + 2*PAY)
function kapsamaCiz(exe, ttf, metinler, carpanlar) {
  const txt = path.join(CALISMA, 'metinler.txt'), bin = path.join(CALISMA, 'kapsama.bin');
  fs.writeFileSync(txt, metinler.map((m, i) => `${carpanlar[i]}\t${m}`).join('\n') + '\n', 'utf8');
  const r = spawnSync(exe, [ttf, String(XH), txt, bin], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`baslik-ciz.exe çıkış ${r.status}: ${r.stderr || r.error}`);
  const b = fs.readFileSync(bin);
  fs.rmSync(bin);
  const k = [];
  for (let i = 0, o = 4; i < b.readInt32LE(0); i++) {
    const w = b.readInt32LE(o), h = b.readInt32LE(o + 4); o += 8 + 16;
    k.push({ W: w, H: h, k: Buffer.from(b.subarray(o, o + w * h)) }); o += w * h;
  }
  return k;
}

const enYakin = (v) => PALET.reduce((a, p) => (Math.abs(p - v) < Math.abs(a - v) ? p : a), PALET[0]);
// kapsama → dolgu tonu: c<eşik ise boş; değilse 24 + 208*c^(1/üs) en yakın palet tonuna (24 kontura ayrılmış)
function tonla({ W: w, H: h, k }, { us, esik }) {
  const t = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = k[i] / 255;
    if (c > 0 && c >= esik) { const v = enYakin(24 + 208 * Math.pow(c, 1 / us)); t[i] = v > KONTUR ? v : 0; }
  }
  return t;
}
const komsuDolgu = (g, w, h, x, y) => (x > 0 && g[y * w + x - 1]) || (x < w - 1 && g[y * w + x + 1]) || (y > 0 && g[(y - 1) * w + x]) || (y < h - 1 && g[(y + 1) * w + x]);

// Tuvalden 30 px'lik kare: dikeyde dolgu kontur payıyla [1, 28]'e sığsın, kaydırma 0'a en yakın; sığmıyorsa ihlali
// (kare dışında ya da kenarda kontursuz kalan dolgu pikseli) en aza indiren kaydırma. Kare genişliği = sağ mürekkep + 4, çift.
function kareYap({ W: w, H: h }, t) {
  const satirDolgu = Array.from({ length: h }, (_, y) => { let n = 0; for (let x = 0; x < w; x++) if (t[y * w + x]) n++; return n; });
  const ihlal = (k) => satirDolgu.reduce((s, n, y) => s + (y - PAY - k < 1 || y - PAY - k > 28 ? n : 0), 0);
  let k = 0, enI = Infinity;
  for (let d = 0; d <= PAY - 1; d++) for (const kk of d ? [d, -d] : [0]) { const i = ihlal(kk); if (i < enI) { enI = i; k = kk; } }
  const g = new Uint8Array(w * KARE);
  for (let y = 0; y < KARE; y++) for (let x = 0; x < w; x++) g[y * w + x] = t[(y + PAY + k) * w + x];
  const disarida = satirDolgu.reduce((s, n, y) => s + (y - PAY - k < 0 || y - PAY - k > 29 ? n : 0), 0);
  const px = Buffer.alloc(w * KARE * 4);
  let sagM = -1;
  for (let y = 0; y < KARE; y++) for (let x = 0; x < w; x++) {
    const v = g[y * w + x], c = v || (komsuDolgu(g, w, KARE, x, y) ? KONTUR : 0);
    if (c) { const d = (y * w + x) * 4; px[d] = px[d + 1] = px[d + 2] = c; px[d + 3] = 255; sagM = Math.max(sagM, x); }
  }
  let Wk = sagM + 4; if (Wk % 2) Wk++;
  return { W: w, Wk, px, sagM, kenarIhlal: enI, disarida };
}

// Adları çizer → { img: 256x512 yalnız bizim pikseller, tablo: bizim karelerin yeri }. 250 px'i aşan başlık yalnız
// kendisi yatay daraltılır (en çok 4 tur).
export function cizim({ exe, ttf, adlar, ton = TON }) {
  const metinler = adlar.map(([, m]) => m), carpan = adlar.map(() => 1);
  const kareler = () => kapsamaCiz(exe, ttf, metinler, carpan).map((kp) => kareYap(kp, tonla(kp, ton)));
  let kr = kareler();
  for (let tur = 0; tur < 4; tur++) {
    const asan = kr.map((k, j) => (k.Wk > SINIR ? j : -1)).filter((j) => j >= 0);
    if (!asan.length) break;
    for (const j of asan) carpan[j] = Math.floor(carpan[j] * (SINIR - 4 - 3) / (kr[j].sagM - 3) * 1000) / 1000;
    kr = kareler();
  }
  const img = { w: W, h: H, px: Buffer.alloc(W * H * 4) }, tablo = [];
  for (const [j, [no, ad]] of adlar.entries()) {
    const k = kr[j];
    if (k.Wk > SINIR) throw new Error(`kare ${no} "${ad}" daraltmadan sonra da ${k.Wk} px (sınır ${SINIR})`);
    const X = no === 23 ? Math.max(48, Math.min(92, W - k.Wk)) : 0, Y = no === 23 ? 455 : no * KARE;
    if (X + k.sagM + 1 > W) throw new Error(`kare ${no} "${ad}" atlastan ${X + k.sagM + 1 - W} px taşıyor`);
    for (let y = 0; y < KARE; y++) for (let x = 0; x < Math.min(k.W, W - X); x++) {
      const s = (y * k.W + x) * 4;
      if (k.px[s + 3]) k.px.copy(img.px, ((Y + y) * W + X + x) * 4, s, s + 4);
    }
    tablo.push({ no, ad, x: X, y: Y, w: Math.min(k.Wk, W - X), h: KARE, carpan: carpan[j], ihlal: `${k.kenarIhlal}/${k.disarida}` });
  }
  return { img, tablo };
}

// 24 karelik tablo: bizim kareler çizimden, öbürleri (15-22) oyunun TextureDatabase'indeki AreaTitles kaydından.
function kareTablosu(tablo, datXml) {
  const oyun = atlasKareleri(datXml, 'AreaTitles');
  if (oyun.length !== 24) throw new Error(`TextureDatabase: AreaTitles ${oyun.length} kare (24 bekleniyordu)`);
  return oyun.map((k, i) => {
    const b = tablo.find((t) => t.no === i);
    return b ? { x: b.x, y: b.y, w: b.w, h: b.h, kaynak: 'bizim', ad: b.ad } : { ...k, kaynak: 'oyun' };
  });
}

// Her karenin dikdörtgeni tümüyle kendi kaynağının bölgesinde mi? Dönüş: ihlal eden piksel sayısı.
function bolgeIhlali(kareler) {
  let n = 0;
  for (const k of kareler) for (let y = k.y; y < k.y + k.h; y++) for (let x = k.x; x < k.x + k.w; x++)
    if (oyunBolgesi(x, y) !== (k.kaynak === 'oyun')) n++;
  return n;
}

function jsonMetni(kareler, pngBuf) {
  return '{\n  "aciklama": "AreaTitles_TR atlası 256x512, dizi sırası = kare numarası. kaynak=bizim: AreaTitles_TR-bizim.png · kaynak=oyun: kurulumda kullanıcının AreaTitles.xnb dosyasından (tools/baslik-ciz.mjs).",\n'
    + `  "png_sha256": "${sha256(pngBuf)}",\n  "kareler": [\n${kareler.map((k) => '    ' + JSON.stringify(k)).join(',\n')}\n  ]\n}\n`;
}

const datXml = () => zlib.inflateSync(fs.readFileSync(orijinal('Content/TextureDatabase.dat'))).toString('utf8');

async function cizKomut() {
  const ttf = await yaziTipi(true), exe = derle(), adlar = adlariOku();
  const { img, tablo } = cizim({ exe, ttf, adlar });
  const kareler = kareTablosu(tablo, datXml());
  const ihlal = bolgeIhlali(kareler);
  if (ihlal) throw new Error(`kare tablosu bölgelere oturmuyor (${ihlal} piksel): yazılmadı`);
  const png = pngKodla(img);
  fs.mkdirSync(VARLIK, { recursive: true });
  fs.writeFileSync(BIZIM_PNG, png);
  fs.writeFileSync(KARE_JSON, jsonMetni(kareler, png));
  console.log('kare\tad\tyatay çarpan\tyer (x,y,w)\tkenarda kontursuz/dışarıda kalan dolgu pikseli');
  for (const t of tablo) console.log(`${t.no}\t${t.ad}\t${t.carpan}\t${t.x},${t.y},${t.w}\t${t.ihlal}`);
  console.log(`yazıldı: ${path.relative(KOK, BIZIM_PNG)} (${png.length} bayt) · ${path.relative(KOK, KARE_JSON)}`);
}

// ---------------------------------------------------------------- kurulum yolu (yalnız Node)
function bizimAtlasOku() {
  const pngBuf = varlikOku(VARLIK_AD.bizimPng), json = JSON.parse(varlikOku(VARLIK_AD.kareJson).toString('utf8'));
  if (sha256(pngBuf) !== json.png_sha256) throw new Error('AreaTitles_TR-bizim.png ile -kareler.json birbirini tutmuyor (biri ciz koşulmadan değişmiş)');
  const png = pngOku(pngBuf);
  if (png.w !== W || png.h !== H || json.kareler.length !== 24) throw new Error(`varlık beklenen biçimde değil: ${png.w}x${png.h}, ${json.kareler.length} kare`);
  return { pngBuf, png, json };
}

// Bizim pikseller + oyunun bölgesi (oyunMu yalnız karşı test için değişir)
function birlestir(oyun, bizim, oyunMu = oyunBolgesi) {
  const px = Buffer.from(bizim.px);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (oyunMu(x, y)) oyun.px.copy(px, (y * W + x) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4);
  return { w: W, h: H, px };
}

// Oyunun dosyasını aç ve denetle → { kabuk, ic, img }
function oyunuAc(oyununXnb) {
  const ozet = sha256(oyununXnb);
  if (ozet !== OYUN_SHA256) throw new Error(`AreaTitles.xnb beklenen dosya değil (sha256 ${ozet}, beklenen ${OYUN_SHA256}): oyun güncellenmiş ya da yanlış dosya`);
  const kabuk = xnbAc(oyununXnb), ic = icerikOku(kabuk.ham), t = ic.nesne;
  if (ic.artik || t?.tur !== 'Texture2D' || t.bicim !== 0 || t.w !== W || t.h !== H || t.mipler.length !== 1) throw new Error('AreaTitles.xnb: 256x512 tek katmanlı Color doku değil');
  return { kabuk, ic, img: dokuRgba(t) };
}
// Biçim oyunun AreaTitles_*.xnb dosyalarındaki gibi (platform w, sürüm 5, Texture2D Color 256x512, tek katman, aynı
// okuyucu), yalnız sıkıştırmasız: LZX sıkıştırıcımız yok, FNA bayrak 0'ı okur (LocFlags.xnb de böyle kuruluyor).
const xnbOlustur = ({ kabuk, ic }, img) => xnbYaz(icerikYaz({ okuyucular: ic.okuyucular, nesne: { ...ic.nesne, mipler: [img.px] } }),
  { platform: kabuk.platform, surum: kabuk.surum, bayrak: kabuk.bayrak });

// Girdi: kullanıcının ORİJİNAL AreaTitles.xnb'si (Buffer). Çıktı: { xnb: AreaTitles_TR.xnb Buffer'ı, kareler: 24 kare
// {x, y, w, h, kaynak, ad?} — TextureDatabase.dat'taki AreaTitles_TR kaydı bunlardan yazılır }.
export function areaTitlesUret(oyununXnb) {
  const oyun = oyunuAc(oyununXnb), { png, json } = bizimAtlasOku();
  return { xnb: xnbOlustur(oyun, birlestir(oyun.img, png)), kareler: json.kareler };
}

function uretKomut(cikis, sessiz = false) {
  if (!cikis) throw new Error('kullanım: node tools/baslik-ciz.mjs uret <cikis-klasoru>');
  const kok = path.resolve(cikis);
  if ((kok + path.sep).toLowerCase().startsWith(path.resolve(OYUN).toLowerCase() + path.sep)) throw new Error('oyun klasörüne yazılmaz');
  const { xnb, kareler } = areaTitlesUret(fs.readFileSync(orijinal(OYUN_REL)));
  const hedef = path.join(kok, TR_REL), jsonYol = path.join(path.dirname(hedef), 'AreaTitles_TR-kareler.json');
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, xnb);
  fs.writeFileSync(jsonYol, `{\n  "atlas": "AreaTitles_TR", "contentPath": "Overlays/PlayerHUD/AreaTitles_TR", "w": ${W}, "h": ${H},\n  "kareler": [\n${kareler.map((k) => '    ' + JSON.stringify(k)).join(',\n')}\n  ]\n}\n`);
  if (!sessiz) console.log(`yazıldı: ${hedef} (${xnb.length} bayt)\nyazıldı: ${jsonYol}`);
  return { hedef, jsonYol };
}

// ---------------------------------------------------------------- sınama
const pikselFarki = (a, b, haric = () => false) => {
  if (a.w !== b.w || a.h !== b.h) return Infinity;
  let n = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (!haric(x, y) && a.px.readUInt32BE((y * a.w + x) * 4) !== b.px.readUInt32BE((y * a.w + x) * 4)) n++;
  return n;
};
// Onaylı önizlemeyle kimlik. Adı önizlemedekinden farklı karenin şeridi karşılaştırılmaz (ad değişince o şerit
// zaten değişir; öbür şeritler ve oyunun bölgesi yine aynı olmalı). Önizleme yoksa null.
function kimlik(img, adlar) {
  const refYol = path.join(ONIZLEME, 'AreaTitles_TR.png'), adYol = path.join(ONIZLEME, 'basliklar.txt');
  if (!fs.existsSync(refYol) || !fs.existsSync(adYol)) return null;
  const refAd = fs.readFileSync(adYol, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')[1]);
  const haric = adlar.filter(([, ad], j) => refAd[j] !== ad).map(([no]) => no);
  const haricMi = (x, y) => haric.some((no) => (no === 23 ? y >= 455 && y < 485 && x >= 48 : y >= no * KARE && y < (no + 1) * KARE));
  return { fark: pikselFarki(img, pngOku(refYol), haricMi), haric };
}
// Önizlemenin olcum.txt'sindeki kare genişliği ve yeriyle (aynı adlı kareler)
function olcumFarki(kareler) {
  const yol = path.join(ONIZLEME, 'olcum.txt');
  if (!fs.existsSync(yol)) return null;
  const metin = fs.readFileSync(yol, 'utf8'), bas = metin.indexOf('== seçilen çeşit');
  const farklar = [];
  let n = 0;
  for (const m of metin.slice(bas).matchAll(/^(\d+)\t([^\t]+)\t[\d.]+\t\d+\t(\d+)\tX=(\d+) Y=(\d+)/gm)) {
    const k = kareler[+m[1]];
    if (k.ad !== m[2]) continue;
    n++;
    if (k.x !== +m[4] || k.y !== +m[5] || k.w !== +m[3] || k.h !== KARE) farklar.push(`kare ${m[1]}: ${JSON.stringify(k)} ≠ x${m[4]} y${m[5]} w${m[3]}`);
  }
  return { n, farklar };
}
const sizinti = (img) => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (oyunBolgesi(x, y) && img.px.readUInt32BE((y * W + x) * 4)) n++; return n; };

async function sinaKomut() {
  let kotu = 0, atlanan = 0;
  const kayit = (ad, tuttu, ayrinti) => {
    if (tuttu === null) atlanan++; else if (!tuttu) kotu++;
    console.log(`${tuttu === null ? 'ATLANDI' : tuttu ? 'TUTTU  ' : 'TUTMADI'}  ${ad}: ${ayrinti}`);
  };
  const oyunXnb = fs.readFileSync(orijinal(OYUN_REL)), oyun = oyunuAc(oyunXnb), xml = datXml();
  const { pngBuf, png: bizim, json } = bizimAtlasOku(), adlar = adlariOku();

  // 0. adlar dosyası ile depodaki kare tablosu aynı adları mı taşıyor (yazı tipisiz bayatlık denetimi)
  const bayat = adlar.filter(([no, ad]) => json.kareler[no].ad !== ad).map(([no]) => no);
  kayit('adlar güncel', bayat.length === 0, bayat.length ? `kare ${bayat.join(',')} adı değişmiş: ciz yeniden koşulmalı` : `${adlar.length} ad depodaki tabloyla aynı`);

  // (a) kimlik: uret'in diske yazdığı xnb geri okunur, onaylı önizlemeyle piksel piksel
  const cikis = path.join(CALISMA, 'sina-cikti');
  fs.rmSync(cikis, { recursive: true, force: true });
  const { hedef, jsonYol } = uretKomut(cikis, true);
  const ac = xnbAc(fs.readFileSync(hedef)), ic = icerikOku(ac.ham), t = ic.nesne, oyunIc = oyun.ic;
  const bicim = [ac.platform === oyun.kabuk.platform, ac.surum === oyun.kabuk.surum, !ac.sikistirilmis, ic.artik === 0,
    JSON.stringify(ic.okuyucular) === JSON.stringify(oyunIc.okuyucular), t.tur === 'Texture2D', t.bicim === oyunIc.nesne.bicim,
    t.w === W, t.h === H, t.mipler.length === 1];
  kayit('XNB biçimi', bicim.every(Boolean), `platform ${ac.platform} · sürüm ${ac.surum} · bayrak ${ac.bayrak} · ${t.tur} biçim ${t.bicim} ${t.w}x${t.h} · ${t.mipler.length} katman · okuyucu oyunla ${bicim[4] ? 'aynı' : 'FARKLI'}`);
  const uretilen = dokuRgba(t), km = kimlik(uretilen, adlar);
  if (!km) kayit('kimlik', false, `onaylı önizleme yok (${path.relative(KOK, ONIZLEME)}): ölçüt olmadan geçmez`);
  else kayit('kimlik (uret → önizleme)', km.fark === 0, `${km.fark} piksel farklı · karşılaştırılmayan şerit: ${km.haric.length ? 'kare ' + km.haric.join(',') + ' (adı önizlemeden farklı)' : 'yok, atlasın tamamı'}`);
  const uretJson = JSON.parse(fs.readFileSync(jsonYol, 'utf8')).kareler;
  kayit('uret kare tablosu = depodaki', JSON.stringify(uretJson) === JSON.stringify(json.kareler), `${uretJson.length} kare`);
  const of = olcumFarki(json.kareler);
  if (!of) kayit('kare yerleri (önizleme olcum.txt)', false, 'olcum.txt yok');
  else kayit('kare yerleri (önizleme olcum.txt)', of.farklar.length === 0, of.farklar.length ? of.farklar.join(' · ') : `${of.n} kare aynı (ör. kare 23: x=${json.kareler[23].x} w=${json.kareler[23].w})`);

  // (b) depodaki PNG'de oyunun bölgesi tümüyle şeffaf · kareler bölgelerine oturuyor · orijinalde bizim bölgedeki
  // her opak piksel bir başlık karesinin (0-14, 23) içinde (yani üstüne yazdığımız yerde oyunun başka resmi yok)
  const sz = sizinti(bizim);
  kayit('depodaki PNG\'de oyunun pikseli yok', sz === 0, `oyun bölgesinde ${sz} şeffaf olmayan piksel`);
  const bi = bolgeIhlali(json.kareler);
  kayit('kareler bölgelerine oturuyor', bi === 0 && json.kareler.slice(15, 23).every((k) => k.kaynak === 'oyun'), `${bi} piksel ihlal · kare 15-22 kaynak: ${json.kareler.slice(15, 23).map((k) => k.kaynak).join(',')}`);
  const orjKare = atlasKareleri(xml, 'AreaTitles').filter((_, i) => i < 15 || i === 23);
  let disari = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (!oyunBolgesi(x, y) && oyun.img.px[(y * W + x) * 4 + 3] && !orjKare.some((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h)) disari++;
  kayit('bizim bölgede oyunun başlık dışı pikseli yok', disari === 0, `${disari} piksel`);

  // (c) belirlenimcilik: ciz yeniden koşulunca depodaki PNG bayt bayt aynı
  const ttf = await yaziTipi(false);
  let exe = null;
  if (!ttf) kayit('belirlenimcilik', null, `yazı tipi yok (${path.relative(KOK, YAZI_TIPI.yol)}; ciz indirir): yeniden çizim denenmedi`);
  else {
    exe = derle();
    const yeni = cizim({ exe, ttf, adlar }), yeniPng = pngKodla(yeni.img), yeniKare = kareTablosu(yeni.tablo, xml);
    const ayni = Buffer.compare(yeniPng, pngBuf) === 0 && JSON.stringify(yeniKare) === JSON.stringify(json.kareler);
    kayit('belirlenimcilik (ciz yeniden)', ayni, `PNG ${Buffer.compare(yeniPng, pngBuf) === 0 ? 'bayt bayt aynı' : `FARKLI (${pikselFarki(yeni.img, bizim)} piksel)`} · kare tablosu ${JSON.stringify(yeniKare) === JSON.stringify(json.kareler) ? 'aynı' : 'FARKLI'}`);
  }

  // (d) sha256 tutmayan girdi: üretmeden durmalı
  const tekBayt = Buffer.from(oyunXnb); tekBayt[tekBayt.length - 1] ^= 1;
  for (const [ad, girdi] of [['FR dosyası', fs.readFileSync(orijinal('Content/Overlays/PlayerHUD/AreaTitles_FR.xnb'))], ['son baytı değişmiş', tekBayt]]) {
    let hata = null, cikti = null;
    try { cikti = areaTitlesUret(girdi); } catch (e) { hata = e; }
    kayit(`sha256 tutmayan girdi (${ad})`, !cikti && /sha256/.test(hata?.message), hata ? 'durdu, çıktı yok' : 'DURMADI');
  }

  // (e) karşı testler: aracın bir parçası bilerek bozulur, yukarıdaki piksel denetimi yakalamalı
  const kimlikBoz = (img) => { const k = kimlik(dokuRgba(icerikOku(xnbAc(xnbOlustur(oyun, img)).ham).nesne), adlar); return k ? k.fark : 0; };
  const k1 = kimlikBoz(birlestir(oyun.img, bizim, (x, y) => y >= 485));
  kayit('karşı test: birleştirme 455≤y<485, x<48 kolunu unutuyor', k1 > 0, `kimlik ${k1} piksel fark buldu`);
  const tekPiksel = { ...bizim, px: Buffer.from(bizim.px) };
  let ilk = 5 * KARE * W;
  while (ilk < 6 * KARE * W && !(tekPiksel.px[ilk * 4 + 3] && tekPiksel.px[ilk * 4] === 232)) ilk++;
  tekPiksel.px.fill(211, ilk * 4, ilk * 4 + 3);
  const k2 = kimlikBoz(birlestir(oyun.img, tekPiksel));
  kayit('karşı test: kare 5\'te tek pikselin tonu 232→211', k2 === 1, `kimlik ${k2} piksel fark buldu`);
  const k3 = sizinti(birlestir(oyun.img, bizim));
  kayit('karşı test: depoya bütün atlas yazılmış (oyunun pikseli sızmış)', k3 > 0, `sızıntı denetimi ${k3} piksel buldu`);
  if (!exe) kayit('karşı test: ton eğrisi üssü 1.8→1.6', null, 'yazı tipi yok');
  else {
    const boz = cizim({ exe, ttf, adlar, ton: { ...TON, us: 1.6 } }), k4 = pikselFarki(boz.img, bizim);
    kayit('karşı test: ton eğrisi üssü 1.8→1.6', k4 > 0 && Buffer.compare(pngKodla(boz.img), pngBuf) !== 0, `yeniden çizim depodakinden ${k4} piksel farklı`);
  }

  console.log('bu sınama şunu göremez: başlığın oyunda çizildiğini ve çerçeveyle uyumunu (AreaTitleToast) · FNA\'nın bu XNB\'yi '
    + 'yüklediğini (oyun dışı sınamada ölçülür) · adların doğruluğunu (terimce) · başka makinede WPF çiziminin aynı çıktığını');
  if (atlanan) console.log(`atlanan denetim: ${atlanan}`);
  console.log(kotu ? `HÜKÜM: KALDI (${kotu} denetim tutmadı)` : 'HÜKÜM: GEÇTİ');
  return kotu ? 1 : 0;
}

// ---------------------------------------------------------------- komut satırı
// Üst düzey await yok: kurulum programı bu modülü esbuild ile CJS paketine alıyor ve CJS üst düzey await'i
// reddediyor (paket hiç üretilmiyor). ana() hatasını kendi yakalar, dışarıya söz fırlatmaz.
async function ana() {
  const [komut, arg] = process.argv.slice(2);
  try {
    if (komut === 'ciz') await cizKomut();
    else if (komut === 'uret') uretKomut(arg);
    else if (komut === 'sina') process.exitCode = await sinaKomut();
    else { console.error('kullanım: node tools/baslik-ciz.mjs ciz | uret <cikis-klasoru> | sina'); process.exitCode = 2; }
  } catch (e) {
    console.error(`HATA: ${e.message}`);
    if (komut === 'sina') console.log('HÜKÜM: KALDI (sınama koşamadı)');
    process.exitCode = 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ana();
