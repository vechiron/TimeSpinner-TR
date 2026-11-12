// Timespinner Türkçe çevirisinin araç zinciri: İngilizce kaynağı partilere böler, çevirmen (ajan)
// için çalışma dosyası yazar, ceviri/*.txt dosyalarını denetler, oyunun okuyacağı TR.txt'yi üretir,
// ilerlemeyi ölçer. Oyun klasörüne hiçbir şey yazmaz; yazdığı her şey ham/ altında (git dışı).
//
//   node tools/ceviri.mjs parti [ad ...] [--klasor <dizin>]   parti listesi + ham/ceviri-is/<parti>.txt
//   node tools/ceviri.mjs denetle [klasör]                    ceviri/*.txt denetimi
//   node tools/ceviri.mjs birlestir [klasör] [çıktı]          denetimden geçerse TR.txt yazar
//   node tools/ceviri.mjs durum [klasör]                      çevrilen anahtar/kelime, parti parti
//   node tools/ceviri.mjs sina                                karşı test (ham/ceviri-sina/ altında)
// Varsayılanlar: klasör = ceviri/ · çıktı = ham/cikti/Content/Localization/TR.txt
// Çıkış: 0 tamam · 1 denetim hatası ya da sınama kaldı · 2 koşamadı (kaynak yok, yanlış kullanım,
// gömülü karşı test bozuk). Oyun yeri: TIMESPINNER_OYUN ortam değişkeni ya da Steam'in varsayılanı.
//
// Çeviri dosyası ceviri/<parti>.txt (UTF-8): her satır `anahtar = Türkçe metin`, ilk " = " ayırıcı;
// `#` ile başlayan satır yorum, boş satır atlanır. Satır kırma yalnız `\n` (iki karakter; oyun kendisi
// çevirir). Metnin baştaki/sondaki boşluğu yok sayılır: İngilizcede varsa birlestir oradan taşır.
// Oyunun İngilizcesi bu dosyalara girmez (telif): yorumda geçen İngilizce cümle de hatadır.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { xnbAc, icerikOku, fontTablosu } from './xnb.mjs';
import { terimTablosu, istisnaAyristir, istisnaOku, ISTISNA_DOSYASI, ISTISNA_BASLIK, terimDenetle, gecenTerimler, kokSina, golgeSina, karsiTest } from './terim-denetim.mjs';

const BU = fileURLToPath(import.meta.url);
const KOK = path.resolve(path.dirname(BU), '..');
const OYUN = process.env.TIMESPINNER_OYUN || 'C:/Program Files (x86)/Steam/steamapps/common/Timespinner';
const LOC = path.join(OYUN, 'Content', 'Localization');
const FONT = path.join(OYUN, 'Content', 'Fonts', 'LatinFont.xnb');
const HAM = path.join(KOK, 'ham');
const CEVIRI = path.join(KOK, 'ceviri');
const IS = path.join(HAM, 'ceviri-is');
const CIKTI = path.join(HAM, 'cikti', 'Content', 'Localization', 'TR.txt');
const SINA = path.join(HAM, 'ceviri-sina');
const TERIMCE = path.join(KOK, 'docs', 'terimce.md');

// Parti büyüklüğü (gerekçe docs/ceviri-yolu.md): kelime hedefi, üst sınır ve bölme bedelleri.
const HEDEF = 2000, UST = 2500;
const BLOK_ICI_CEZA = 500 ** 2; // boş satırla ayrılmış bloğun içinden kesmek = 500 kelimelik sapma kadar kötü
const AILE_CEZA = 300 ** 2;     // bir partide arayüz/envanter/günlük/diyalog ailesi değişirse, her geçiş için
const TAKLIT = 'ES';            // TR.txt iskeleti bu dilinki: İngilizce satırlar + ek anahtarlar aynı yerde
const TAM_DILLER = ['BP', 'CN', 'DE', 'ES', 'FR', 'JP', 'RU'];
// İngilizce dosyada olmayıp kodun kullandığı anahtarlar (MenuRelicInventory: yoksa "ON"/"OFF" yazar).
// Öteki 6 dil bunları DialogueName bloğunun ardına koyuyor; `parti` farklı bir ek anahtar ölçerse uyarır.
const EK = [
  { anahtar: 'RelicsMenuOn', kategori: 'Menu', en: 'ON' },
  { anahtar: 'RelicsMenuOff', kategori: 'Menu', en: 'OFF' },
];
const BASLIK = 'Category\tKey\tText\tSpeaker\tTarget\tTextNotes\tLocalization Notes\tEditor Notes\tStatus\tLanguage';
// Metin içinde oyunun yorumladığı öğeler (ölçüm: DialogueLine.cs `$`+karakter = tuş simgesi;
// string.Format `{0}`; StringLibrary.ProcessText `\n`; `#11` `#13` deney numarası).
const RE = {
  tus: /\$[\s\S]?/g,
  yer: /\{\d+(?:,-?\d+)?(?::[^{}]*)?\}/g,
  kirma: /\\n/g,
  numara: /#\d+/g,
  hepsi: /\$[\s\S]?|\{\d+(?:,-?\d+)?(?::[^{}]*)?\}|\\n|#\d+|[{}]/g,
};
const SATIR_SONU = /[\r\u2028\u2029\u0085]/;

class Dur extends Error {}
const ogeler = (m, re) => m.match(re) || [];
const kelime = (m) => m.replace(/\\n/g, ' ').split(/\s+/).filter(Boolean).length;
const gorunur = (ham) => ham.replace(/^"+/, '').replace(/"+$/, ''); // oyun baştaki/sondaki " kırpar
const basBosluk = (m) => m.match(/^\s*/)[0];
const sonBosluk = (m) => (m.trim() ? m.match(/\s*$/)[0] : '');
const bin = (n) => n.toLocaleString('tr-TR');
const goreli = (p) => path.relative(KOK, p).replace(/\\/g, '/') || '.';
const kod = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// ---------------------------------------------------------------- oyunun yükleyicisinin taklidi
// StringLibrary.ProcessText: \n → satır sonu, baştaki/sondaki " kırpılır; kıvrık tırnak yalnız EN/BP/RU'da.
export function islenmis(ham, dil) {
  let t = ham.split('\\n').join('\n');
  t = t.replace(/^"+/, '').replace(/"+$/, '');
  if (dil === 'EN') t = t.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  else if (dil === 'BP' || dil === 'RU') t = t.replace(/[“”]/g, '"');
  return t;
}

// StringLibrary.LoadTables: StreamReader (BOM'a göre kodlama, yoksa UTF-8), ReadLine (\r\n, \n, \r),
// Split('\t'), "Category" satırı atlanır, array[1..3] okunur (4'ten az sütun = IndexOutOfRange = çökme),
// boş anahtar atlanır, aynı anahtarda ilki kalır.
export function oyunYukle(buf, dil) {
  let s;
  if (buf[0] === 0xff && buf[1] === 0xfe) s = buf.subarray(2).toString('utf16le');
  else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) s = buf.subarray(3).toString('utf8');
  else s = buf.toString('utf8');
  const satirlar = s.split(/\r\n|\n|\r/);
  if (satirlar.at(-1) === '') satirlar.pop();
  const tablo = new Map();
  satirlar.forEach((x, i) => {
    const a = x.split('\t');
    if (a[0] === 'Category') return;
    if (a.length < 4) throw new Error(`satır ${i + 1}: ${a.length} sütun, oyun IndexOutOfRangeException ile çöker`);
    if (a[1] && !tablo.has(a[1])) tablo.set(a[1], { metin: islenmis(a[2], dil), konusmaci: a[3] });
  });
  return tablo;
}

// ---------------------------------------------------------------- kaynak
function locSatirlari(buf, dosya) {
  if (buf[0] !== 0xff || buf[1] !== 0xfe) throw new Dur(`${dosya}: UTF-16 LE BOM yok`);
  const s = buf.subarray(2).toString('utf16le');
  const satirlar = s.split('\r\n');
  if (satirlar.at(-1) === '') satirlar.pop();
  return satirlar.map((x) => x.split('\t'));
}

const _diller = new Map();
function digerDil(kod) {
  if (!_diller.has(kod)) {
    const f = path.join(LOC, `${kod}.txt`);
    _diller.set(kod, fs.existsSync(f) ? locSatirlari(fs.readFileSync(f), f) : null);
  }
  return _diller.get(kod);
}

const aileOf = (k) => (k.kategori === 'Dialogue' || k.kategori === 'DialogueName' ? 'diyalog'
  : k.anahtar.startsWith('inv_jou_') ? 'gunluk'
  : k.kategori === 'Inventory' || k.kategori === 'Bestiary' ? 'envanter' : 'arayuz');

// Bölünmez birim: diyalogda sahne/aşama (q_nel_1_nel_05 → q_nel_1, cs_qend_lun_66 → cs_qend),
// öbürlerinde öğe (inv_jou_Memory7_3 → inv_jou_Memory7, Enemy_X_desc → Enemy_X).
function sahne(k) {
  if (k.ek) return 'ek';
  const p = k.anahtar.split('_');
  if (k.kategori === 'Dialogue') {
    const i = p.findIndex((s, j) => j > 0 && j < p.length - 1 && /^\d+$/.test(s));
    if (i > 0) return p.slice(0, i + 1).join('_');
    return p.slice(0, Math.max(1, p.length - 2)).join('_');
  }
  let s = k.anahtar.replace(/_(desc|name)$/, '').replace(/_\d+[a-z]*$/, '');
  if (s.startsWith('inv_jou_quest_')) s = s.split('_').slice(0, 4).join('_');
  return s;
}

// İngilizce kaynağın (TimespinnerStrings.txt) Buffer'ından kaynak modeli kurar. Dosya sistemine ve modül
// sabitlerine (OYUN, LOC) dokunmaz: kurulum programı oyunun kullanıcıdaki dosyalarıyla çağırır.
//   enBuf: TimespinnerStrings.txt içeriği · esSatirlari: ES.txt'nin `locSatirlari` çıktısı (satır × sütun)
//   ya da null (ek anahtarların yeri taklit edilemez, son DialogueName'in ardına konur) · dosyaAdi: hata iletisi için.
export function kaynakOlustur(enBuf, esSatirlari, dosyaAdi) {
  const dosya = dosyaAdi, buf = enBuf;
  const satirlar = locSatirlari(buf, dosya);
  if (satirlar[0].join('\t') !== BASLIK) throw new Dur(`${dosya}: başlık satırı beklenen gibi değil`);
  const kayitlar = [], harita = new Map();
  let blok = 0;
  for (let i = 1; i < satirlar.length; i++) {
    const r = satirlar[i];
    if (r.length !== 10) throw new Dur(`${dosya} satır ${i + 1}: ${r.length} sütun (10 bekleniyordu)`);
    if (!r[1]) { blok++; continue; } // boş satır bloğu ayırır
    if (harita.has(r[1])) continue; // oyun ilkini alır
    const metin = gorunur(r[2]);
    const k = { satir: i, kategori: r[0], anahtar: r[1], ham: r[2], metin, konusmaci: r[3], hedef: r[4], blok,
      ek: false, cevrilir: metin.trim() !== '', kelime: kelime(metin) };
    kayitlar.push(k); harita.set(k.anahtar, k);
  }
  // Ek anahtarların yeri: taklit edilen dilde onlardan önce gelen anahtarın ardı (yoksa son DialogueName).
  let ekOnceki = null;
  const es = esSatirlari;
  if (es) { const i = es.findIndex((r) => r[1] === EK[0].anahtar); if (i > 1 && es[i - 1][1]) ekOnceki = es[i - 1][1]; }
  if (!ekOnceki || !harita.has(ekOnceki)) ekOnceki = [...kayitlar].reverse().find((k) => k.kategori === 'DialogueName')?.anahtar ?? kayitlar.at(-1).anahtar;
  const onceki = harita.get(ekOnceki);
  const ekler = EK.map((e) => ({ satir: -1, kategori: e.kategori, anahtar: e.anahtar, ham: e.en, metin: e.en, konusmaci: '',
    hedef: '', blok: onceki.blok, ek: true, cevrilir: true, kelime: kelime(e.en) }));
  for (const e of ekler) {
    if (harita.has(e.anahtar)) throw new Dur(`ek anahtar ${e.anahtar} artık İngilizce kaynakta var: EK listesinden çıkar`);
    harita.set(e.anahtar, e);
  }
  kayitlar.splice(kayitlar.indexOf(onceki) + 1, 0, ...ekler);
  // Blok ailesi: blokta en çok kelimesi olan aile (bloğun içindeki tek tük Tutorial satırı ayrı aile sayılmaz).
  const blokKelime = new Map();
  for (const k of kayitlar) if (k.cevrilir) {
    const m = blokKelime.get(k.blok) || new Map();
    m.set(aileOf(k), (m.get(aileOf(k)) || 0) + k.kelime);
    blokKelime.set(k.blok, m);
  }
  const blokAile = new Map([...blokKelime].map(([b, m]) => [b, [...m].reduce((a, x) => (x[1] > a[1] ? x : a))[0]]));
  const ayniMetin = new Map();
  for (const k of kayitlar) if (k.cevrilir && !k.ek) ayniMetin.set(k.metin, [...(ayniMetin.get(k.metin) || []), k.anahtar]);
  const uzunMetinler = [...new Set(kayitlar.filter((k) => !k.ek && k.kelime >= 5).map((k) => k.metin))];
  const ozet = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  return { dosya, satirlar, kayitlar, harita, ekler, ekOnceki, blokAile, ayniMetin, uzunMetinler, ozet };
}

// Geliştirme yolu: oyunun yerini modül sabitlerinden okur, kaynak modeli bir kez kurar ve önbellekler.
let _K;
function kaynak() {
  if (_K) return _K;
  const dosya = path.join(LOC, 'TimespinnerStrings.txt');
  if (!fs.existsSync(dosya)) throw new Dur(`İngilizce kaynak bulunamadı: ${dosya} (başka yer: TIMESPINNER_OYUN)`);
  _K = kaynakOlustur(fs.readFileSync(dosya), digerDil(TAKLIT), dosya);
  return _K;
}

let _font;
function fontKumesi() {
  if (!_font) {
    if (!fs.existsSync(FONT)) throw new Dur(`yazı tipi bulunamadı: ${FONT}`);
    const ic = icerikOku(xnbAc(fs.readFileSync(FONT)).ham);
    _font = new Set(fontTablosu(ic.nesne).map((r) => r.c));
  }
  return _font;
}

// Öteki dillerde olup İngilizcede olmayan anahtarlar; EK listesiyle tutmazsa uyarı döner.
function ekOlcum(K) {
  const say = new Map(), metinler = new Map();
  for (const d of TAM_DILLER) {
    const t = digerDil(d);
    if (!t) continue;
    for (const r of t.slice(1)) if (r[1] && !K.harita.has(r[1]) || (r[1] && K.harita.get(r[1])?.ek)) {
      say.set(r[1], (say.get(r[1]) || 0) + 1);
      if (K.harita.get(r[1])?.ek) metinler.set(r[1], [...(metinler.get(r[1]) || []), `${d} ${gorunur(r[2] || '')}`]);
    }
  }
  const uyari = [...say.keys()].filter((a) => !EK.some((e) => e.anahtar === a));
  return { uyari, metinler };
}

// ---------------------------------------------------------------- partiler
let _P;
function partiler(K = kaynak()) {
  if (_P) return _P;
  const birimler = [];
  for (const k of K.kayitlar) {
    if (!k.cevrilir) continue;
    const s = sahne(k), son = birimler.at(-1);
    if (son && son.blok === k.blok && son.sahne === s) { son.kayitlar.push(k); son.kelime += k.kelime; }
    else birimler.push({ sahne: s, blok: k.blok, aile: K.blokAile.get(k.blok), kayitlar: [k], kelime: k.kelime });
  }
  // En iyi bölme (dinamik programlama): Σ (parti kelimesi − HEDEF)² + aile geçişi + blok içi kesim bedeli;
  // parti UST'ü aşamaz (tek birim aşarsa tek başına kalır). Eşitlikte ilk bulunan: sonuç deterministik.
  const n = birimler.length, enIyi = new Array(n + 1).fill(Infinity), geri = new Array(n + 1).fill(-1);
  enIyi[0] = 0;
  for (let i = 1; i <= n; i++) {
    let w = 0, gecis = 0;
    for (let j = i - 1; j >= 0; j--) {
      w += birimler[j].kelime;
      if (j < i - 1 && birimler[j].aile !== birimler[j + 1].aile) gecis++;
      if (w > UST && j < i - 1) break;
      const kesim = j > 0 && birimler[j - 1].blok === birimler[j].blok ? BLOK_ICI_CEZA : 0;
      const m = enIyi[j] + (w - HEDEF) ** 2 + AILE_CEZA * gecis + kesim;
      if (m < enIyi[i]) { enIyi[i] = m; geri[i] = j; }
    }
  }
  const araliklar = [];
  for (let i = n; i > 0; i = geri[i]) araliklar.unshift([geri[i], i]);
  const liste = araliklar.map(([a, b], no) => {
    const bs = birimler.slice(a, b), kayitlar = bs.flatMap((x) => x.kayitlar);
    const aileKelime = new Map();
    for (const x of bs) aileKelime.set(x.aile, (aileKelime.get(x.aile) || 0) + x.kelime);
    const aile = [...aileKelime].reduce((p, x) => (x[1] > p[1] ? x : p))[0];
    return { ad: `${String(no + 1).padStart(2, '0')}-${aile}`, birimler: bs, kayitlar,
      kelime: kayitlar.reduce((s, k) => s + k.kelime, 0), bloklar: [...new Set(bs.map((x) => x.blok))],
      bastanKesik: a > 0 && birimler[a - 1].blok === birimler[a].blok };
  });
  const partiAdi = new Map();
  for (const p of liste) for (const k of p.kayitlar) partiAdi.set(k.anahtar, p.ad);
  _P = { liste, partiAdi, adlar: new Set(liste.map((p) => p.ad)), birimler };
  return _P;
}

const blokAdi = (b) => `B${String(b).padStart(2, '0')}`;
const blokAraligi = (bs) => (bs.length === 1 ? blokAdi(bs[0]) : `${blokAdi(bs[0])}–${blokAdi(bs.at(-1))}`);

function isDosyasi(p, no, toplam, K, P, ceviriler, ekMetin) {
  const s = [];
  s.push(`# Timespinner Türkçe — çalışma dosyası ${p.ad} (parti ${no}/${toplam})`);
  s.push(`# ${bin(p.kayitlar.length)} anahtar · ${bin(p.kelime)} İngilizce kelime · bloklar ${blokAraligi(p.bloklar)} · kaynak özeti ${K.ozet}`);
  s.push('# Bu dosya git dışıdır (oyunun İngilizcesi telifli). Çeviriyi şu dosyaya yaz:');
  s.push(`#   ceviri/${p.ad}.txt   her satır:  anahtar = Türkçe metin   (ilk " = " ayırıcı, # ile başlayan satır yorum)`);
  s.push('# Kurallar (node tools/ceviri.mjs denetle sınar):');
  s.push('#   - $A $X … (tuş simgesi), {0}, #11 ve \\n sayısı İngilizceyle birebir; yerleri Türkçe cümleye göre değişebilir');
  s.push('#   - satır kırma yalnız \\n (iki karakter); sekme ve gerçek satır sonu yok, başka ters bölü yok');
  s.push('#   - metin düz " ile başlayıp bitemez (oyun siler); gerekirse “ ” kullan');
  s.push('#   - yalnız yazı tipindeki karakterler (Türkçe harflerin hepsi var; ₺ ve emoji yok)');
  s.push('#   - baştaki/sondaki boşluğu yazma: İngilizcede varsa birlestir ekler');
  s.push('#   - İngilizceyi ceviri/ dosyasına yorum olarak bile yazma');
  s.push('# Kayıt: [anahtar] konuşan → dinlenen · EN: İngilizce · not: araç notu · TR: varsa mevcut çeviri');
  let blok = null, birim = null;
  for (const b of p.birimler) {
    if (b.blok !== blok) {
      blok = b.blok;
      const ks = [...new Set(p.kayitlar.filter((k) => k.blok === blok).map((k) => k.kategori))].join('+');
      s.push('', `## ==== ${blokAdi(blok)} · ${ks} ====`);
    }
    if (b.aile === 'diyalog' || b.aile === 'gunluk') if (b.sahne !== birim) s.push('', `### sahne ${b.sahne}`);
    birim = b.sahne;
    for (const k of b.kayitlar) {
      const bas = [`[${k.anahtar}]`];
      if (k.konusmaci) bas.push(k.hedef ? `${k.konusmaci} → ${k.hedef}` : k.konusmaci);
      if (k.kategori !== 'Dialogue' && b.aile === 'diyalog' && k.kategori !== 'DialogueName') bas.push(`(${k.kategori})`);
      s.push('', bas.join('  '));
      s.push(`EN: ${k.metin.trim()}`);
      const not = [];
      const og = ogeler(k.metin, RE.hepsi);
      if (og.length) {
        const say = new Map();
        for (const o of og) say.set(o, (say.get(o) || 0) + 1);
        not.push('korunacak: ' + [...say].map(([o, c]) => (c > 1 ? `${o} ×${c}` : o)).join(', '));
      }
      if (sonBosluk(k.metin) || basBosluk(k.metin)) not.push('İngilizcede baş/son boşluk var (birlestir ekler)');
      if (k.kategori === 'DialogueName') not.push('konuşmacı adı: diyalog kutusunun başlığı');
      if (k.ek) not.push(`İngilizce dosyada yok; oyun yoksa "${k.metin}" yazar · öteki diller: ${(ekMetin.get(k.anahtar) || []).join(' · ')}`);
      if ((b.aile === 'arayuz' || /_name$/.test(k.anahtar) || k.kategori === 'DialogueName') && k.metin.length <= 40) not.push(`EN ${k.metin.trim().length} karakter`);
      const ayni = (K.ayniMetin.get(k.metin) || []).filter((a) => a !== k.anahtar);
      if (ayni.length) not.push('aynı İngilizce: ' + ayni.slice(0, 3).map((a) => `${a} (${P.partiAdi.get(a)})`).join(', ') + (ayni.length > 3 ? ` +${ayni.length - 3}` : ''));
      if (not.length) s.push(`not: ${not.join(' · ')}`);
      const c = ceviriler.get(k.anahtar);
      if (c) s.push(`TR: ${c.metin}`);
    }
  }
  return s.join('\n') + '\n';
}

// ---------------------------------------------------------------- denetim
// font: yazı tipindeki karakterlerin kümesi; null ise yazı tipi denetimi yapılmaz (kurulum yolunda yazı tipi yok).
function metinDenetle(tr, en, font) {
  if (tr === '') return [['bos-ceviri', 'çeviri boş']];
  const r = [];
  if (tr.includes('\t')) r.push(['sekme', 'metinde sekme var (TR.txt sütunlarını kaydırır)']);
  if (SATIR_SONU.test(tr)) r.push(['satir-sonu', 'metinde gerçek satır sonu var; \\n yaz']);
  if (/^"|"$/.test(tr)) r.push(['tirnak', 'baştaki/sondaki düz " oyunda silinir; “ ” kullan ya da cümleyi değiştir']);
  const coklu = (a) => [...a].sort().join('\u0000');
  const yaz = (a) => (a.length ? a.join(' ') : '(yok)');
  const fark = (ad, re, kodu) => {
    const a = ogeler(en, re), b = ogeler(tr, re);
    if (coklu(a) !== coklu(b)) r.push([kodu, `${ad}: İngilizce ${yaz(a)} · Türkçe ${yaz(b)}`]);
  };
  fark('tuş simgesi', RE.tus, 'tus-simgesi');
  fark('yer tutucu', RE.yer, 'yer-tutucu');
  if (!r.some((x) => x[0] === 'yer-tutucu')) {
    const say = (m, c) => m.split(c).length - 1;
    if (say(en, '{') !== say(tr, '{') || say(en, '}') !== say(tr, '}')) r.push(['yer-tutucu', `süslü parantez sayısı: İngilizce {${say(en, '{')} }${say(en, '}')} · Türkçe {${say(tr, '{')} }${say(tr, '}')}`]);
  }
  fark('\\n sayısı', RE.kirma, 'satir-kirma');
  fark('numara', RE.numara, 'numara');
  if (/\\(?!n)/.test(tr)) r.push(['ters-bolu', 'yalnız \\n kaçışı geçerli; tek \\ ekranda görünür']);
  const yok = font ? [...new Set([...tr].filter((c) => !font.has(c) && c !== '\t' && !SATIR_SONU.test(c)))] : [];
  if (yok.length) r.push(['yazi-tipi', 'yazı tipinde yok: ' + yok.map((c) => `${JSON.stringify(c)} ${kod(c)}`).join(', ')]);
  return r;
}

// Terim denetiminin girdisi: tablo docs/terimce.md'den, istisnalar denetlenen klasörün terim-istisna.md'sinden.
function terimBaglami(klasor) {
  let tablo;
  try { tablo = terimTablosu(fs.readFileSync(TERIMCE, 'utf8')); } catch (e) { throw new Dur(e.message); }
  return { tablo, istisna: klasor ? istisnaOku(klasor) : { dosya: null, satirlar: [] } };
}

// Çeviri dosyalarını okuyup anahtar → çeviri Map'ini kurar (satır biçimi, anahtar, yinelenme, biçim öğeleri).
// Dosya sistemine ve modül sabitlerine dokunmaz. dosyalar: [{ ad, icerik }] (icerik: metin; ada göre sıralı
// işlenir). Yazı tipi, terim ve parti denetimi İSTEĞE BAĞLI: font (karakter kümesi) verilmezse yazı tipi
// denetimi, P (partiler) verilmezse dosya adı/parti uyarıları yoktur. Terim denetimi bu işlevde hiç yok.
// Dönüş: hatalar, uyarılar, geçerli+hatalı çeviriler, çeviri satırı sayısı.
export function ceviriOku(dosyalar, K, font = null, P = null) {
  const hatalar = [], uyarilar = [], ceviriler = new Map(), ilkYer = new Map();
  let satirSay = 0;
  for (const d of [...dosyalar].sort((a, b) => (a.ad < b.ad ? -1 : a.ad > b.ad ? 1 : 0))) {
    const parti = d.ad.replace(/\.txt$/i, '');
    if (P && !P.adlar.has(parti)) uyarilar.push({ yer: d.ad, kod: 'bilinmeyen-dosya', anahtar: '-', aciklama: 'dosya adı bir parti adı değil (node tools/ceviri.mjs parti)' });
    let icerik = d.icerik;
    if (icerik.charCodeAt(0) === 0xfeff) icerik = icerik.slice(1);
    icerik.split('\n').forEach((ham, i) => {
      const s = ham.endsWith('\r') ? ham.slice(0, -1) : ham;
      const yer = `${d.ad}:${i + 1}`;
      if (!s.trim()) return;
      if (s.startsWith('#')) {
        const m = K.uzunMetinler.find((x) => s.includes(x));
        if (m) hatalar.push({ yer, kod: 'ingilizce-yorum', anahtar: '-', aciklama: `yorumda oyunun İngilizcesi var (telif): "${m.slice(0, 50)}…"` });
        return;
      }
      satirSay++;
      let anahtar, metin;
      const ay = s.indexOf(' = ');
      if (ay >= 0) { anahtar = s.slice(0, ay).trim(); metin = s.slice(ay + 3); }
      else if (s.trimEnd().endsWith(' =')) { anahtar = s.trimEnd().slice(0, -2).trim(); metin = ''; }
      else { hatalar.push({ yer, kod: 'satir-bicimi', anahtar: '-', aciklama: `"anahtar = metin" biçiminde değil: ${JSON.stringify(s.slice(0, 60))}` }); return; }
      metin = metin.replace(/^ +| +$/g, '');
      const h = (kodu, aciklama) => hatalar.push({ yer, kod: kodu, anahtar, aciklama });
      const k = K.harita.get(anahtar);
      if (!k) return h('bilinmeyen-anahtar', 'İngilizce kaynakta böyle bir anahtar yok');
      if (!k.cevrilir) return h('kaynak-bos', 'İngilizcesi boş anahtar; çevrilecek bir şey yok');
      if (ilkYer.has(anahtar)) return h('yinelenen', `aynı anahtar daha önce ${ilkYer.get(anahtar)}`);
      ilkYer.set(anahtar, yer);
      const sorunlar = metinDenetle(metin, k.metin.trim(), font);
      for (const [kodu, a] of sorunlar) h(kodu, a);
      ceviriler.set(anahtar, { metin, yer, dosya: d.ad, hatali: sorunlar.length > 0 });
      if (metin === k.metin.trim() && k.kelime >= 4) uyarilar.push({ yer, kod: 'ingilizceyle-ayni', anahtar, aciklama: 'çeviri İngilizceyle birebir aynı' });
      if (P && P.adlar.has(parti) && P.partiAdi.get(anahtar) !== parti) uyarilar.push({ yer, kod: 'baska-parti', anahtar, aciklama: `anahtar ${P.partiAdi.get(anahtar)} partisinin` });
    });
  }
  return { hatalar, uyarilar, ceviriler, satirSay };
}

// dosyalar: [{ ad, icerik }] (ada göre sıralı işlenir). T: terim bağlamı (verilmezse terim denetimi yok).
// Dönüş: hatalar, uyarılar, geçerli+hatalı çeviriler, terim sayımları.
export function denetle(dosyalar, K, font, P, T) {
  const { hatalar, uyarilar, ceviriler, satirSay } = ceviriOku(dosyalar, K, font, P);
  let terim = null;
  if (T) {
    for (const x of T.istisna.satirlar) {
      const m = K.uzunMetinler.find((u) => x.ham.includes(u));
      if (m) hatalar.push({ yer: `${T.istisna.dosya}:${x.satir}`, kod: 'ingilizce-yorum', anahtar: x.anahtar || '-', aciklama: `gerekçede oyunun İngilizcesi var (telif): "${m.slice(0, 50)}…"` });
    }
    terim = terimDenetle(ceviriler, (a) => K.harita.get(a)?.metin.trim(), T.tablo, T.istisna);
    uyarilar.push(...terim.uyarilar);
  }
  return { hatalar, uyarilar, ceviriler, satirSay, terim };
}

function klasorOku(klasor) {
  if (!fs.existsSync(klasor)) return [];
  return fs.readdirSync(klasor).filter((f) => f.toLowerCase().endsWith('.txt')).sort()
    .map((f) => ({ ad: f, icerik: fs.readFileSync(path.join(klasor, f), 'utf8') }));
}

// Gömülü karşı test tablosu: her bozuk örnek tam olarak beklenen hatayı vermeli, sağlam küme hiç vermemeli.
// Anahtarlar kaynaktan koşulla seçilir; `sina` aynı tabloyu dosyaya yazıp komut satırından da koşar.
function karsiOrnekler(K, P, T) {
  const terimsiz = (k) => !gecenTerimler(k.metin, T.tablo).length; // sağlam örnek terim uyarısı vermesin
  const bul = (ad, f, kosul = terimsiz) => {
    const k = K.kayitlar.find((x) => x.cevrilir && !x.ek && kosul(x) && f(x));
    if (!k) throw new Dur(`karşı test kurulamadı: "${ad}" koşulunu tutan anahtar yok`);
    return k;
  };
  const ozel = /[$\\{}#"]/;
  const trm = bul('tek terimli, özel öğesiz', (k) => !ozel.test(k.metin) && kelime(k.metin) >= 3, (k) => gecenTerimler(k.metin, T.tablo).length === 1);
  const terim = gecenTerimler(trm.metin, T.tablo)[0];
  const tus = bul('$A $X ve tek \\n', (k) => ogeler(k.metin, RE.tus).sort().join() === '$A,$X' && ogeler(k.metin, RE.kirma).length === 1 && !/[{}#]/.test(k.metin));
  const yer = bul('tek {0}', (k) => /\{0\}/.test(k.metin) && ogeler(k.metin, /[{}]/g).length === 2 && !/[$\\#]/.test(k.metin));
  // #sayılı kayıtların hepsinde terim var (Experiment): sağlam metin terimlerin Türkçesini taşır
  const num = bul('tek #sayı', (k) => ogeler(k.metin, RE.numara).length === 1 && !/[$\\{}]/.test(k.metin), () => true);
  const numTerim = gecenTerimler(num.metin, T.tablo).map((x) => x.tr).join(' ') || 'Deney';
  const bosluk = bul('sonda boşluk', (k) => / $/.test(k.metin) && !ozel.test(k.metin));
  const ad = bul('boşluklu konuşmacı adı', (k) => k.kategori === 'DialogueName' && k.anahtar.includes(' ') && !ozel.test(k.metin)
    && K.kayitlar.some((x) => x.kategori === 'Dialogue' && x.konusmaci === k.anahtar), () => true); // adlarda unvan terimi var
  const adTerim = gecenTerimler(ad.metin, T.tablo).map((x) => x.tr).join(' ') || 'Klan Anası';
  const diy = bul('özel öğesiz diyalog', (k) => k.kategori === 'Dialogue' && !ozel.test(k.metin) && kelime(k.metin) >= 6);
  const bos = K.kayitlar.find((k) => !k.cevrilir);
  if (!bos) throw new Dur('karşı test kurulamadı: İngilizcesi boş anahtar yok');
  const ek = K.harita.get(EK[0].anahtar);
  const saglam = new Map([
    [tus, 'Devam etmek için $A tuşuna bas.\\nSilmek için $X tuşunu basılı tut.'],
    [yer, 'Çözünürlük: {0}'],
    [num, `${numTerim} ${ogeler(num.metin, RE.numara)[0]}`],
    [bosluk, 'Yoldaş:'],
    [ad, `${adTerim} Şükran`],
    [diy, 'Işığın ötesinde çağların gölgesi düşüyor, İnci gibi parlıyor.'],
    [ek, 'AÇIK'],
    [trm, `${terim.tr} ışığın ötesinde parlıyor.`],
  ]);
  const D = (k) => `${P.partiAdi.get(k.anahtar)}.txt`;
  const tek = (k, metin, onEk = '') => ({ [D(k)]: `${onEk}${k.anahtar} = ${metin}\n` });
  const saglamDosyalar = {};
  for (const [k, m] of saglam) saglamDosyalar[D(k)] = (saglamDosyalar[D(k)] || '') + `${k.anahtar} = ${m}\r\n`;
  const S = (k) => saglam.get(k);
  const ornekler = [
    { ad: 'sağlam küme', dosyalar: saglamDosyalar, hata: [], uyari: [] },
    { ad: 'ayırıcı yok', dosyalar: { [D(diy)]: `${diy.anahtar} ${S(diy)}\n` }, hata: ['satir-bicimi'] },
    { ad: 'kaynakta olmayan anahtar', dosyalar: { [D(diy)]: `YokBoyleBirAnahtar = ${S(diy)}\n` }, hata: ['bilinmeyen-anahtar'] },
    { ad: 'İngilizcesi boş anahtar', dosyalar: { [D(diy)]: `${bos.anahtar} = Bir şey yazıldı\n` }, hata: ['kaynak-bos'] },
    { ad: 'aynı dosyada iki kez', dosyalar: { [D(diy)]: `${diy.anahtar} = ${S(diy)}\n${diy.anahtar} = ${S(diy)}\n` }, hata: ['yinelenen'] },
    { ad: 'iki dosyada aynı anahtar', dosyalar: { [D(diy)]: `${diy.anahtar} = ${S(diy)}\n`, '99-sina.txt': `${diy.anahtar} = ${S(diy)}\n` }, hata: ['yinelenen'], uyari: ['bilinmeyen-dosya'] },
    { ad: 'boş çeviri', dosyalar: { [D(diy)]: `${diy.anahtar} =   \n` }, hata: ['bos-ceviri'] },
    { ad: 'sekme', dosyalar: tek(diy, 'Işığın ötesinde\tçağların gölgesi düşüyor.'), hata: ['sekme'] },
    { ad: 'gerçek satır sonu (CR)', dosyalar: tek(diy, 'Işığın ötesinde\rçağların gölgesi düşüyor.'), hata: ['satir-sonu'] },
    { ad: 'gerçek satır sonu (LF): satır ikiye bölünür', dosyalar: tek(diy, 'Işığın ötesinde\nçağların gölgesi düşüyor.'), hata: ['satir-bicimi'] },
    { ad: 'baştaki düz tırnak', dosyalar: tek(diy, '"Işığın ötesinde çağların gölgesi düşüyor.'), hata: ['tirnak'] },
    { ad: 'sondaki düz tırnak', dosyalar: tek(diy, 'Işığın ötesinde çağların gölgesi düşüyor."'), hata: ['tirnak'] },
    { ad: 'tuş simgesi eksik', dosyalar: tek(tus, 'Devam etmek için $A tuşuna bas.\\nSilmek için tuşu basılı tut.'), hata: ['tus-simgesi'] },
    { ad: 'tuş simgesi küçük harf', dosyalar: tek(tus, 'Devam etmek için $a tuşuna bas.\\nSilmek için $X tuşunu basılı tut.'), hata: ['tus-simgesi'] },
    { ad: 'fazla tuş simgesi', dosyalar: tek(diy, `${S(diy)} $A`), hata: ['tus-simgesi'] },
    { ad: 'yer tutucu eksik', dosyalar: tek(yer, 'Çözünürlük:'), hata: ['yer-tutucu'] },
    { ad: 'yer tutucu değişmiş', dosyalar: tek(yer, 'Çözünürlük: {1}'), hata: ['yer-tutucu'] },
    { ad: 'fazla süslü parantez', dosyalar: tek(yer, 'Çözünürlük: {0} }'), hata: ['yer-tutucu'] },
    { ad: '\\n eksik', dosyalar: tek(tus, 'Devam etmek için $A tuşuna bas. Silmek için $X tuşunu basılı tut.'), hata: ['satir-kirma'] },
    { ad: '#numara eksik', dosyalar: tek(num, `${numTerim} numarası yok`), hata: ['numara'] },
    { ad: 'tek ters bölü', dosyalar: tek(diy, 'Işığın ötesinde\\tçağların gölgesi düşüyor.'), hata: ['ters-bolu'] },
    { ad: 'yazı tipinde olmayan karakter', dosyalar: tek(diy, 'Fiyatı 5 ₺ oldu, çok pahalı değil mi?'), hata: ['yazi-tipi'] },
    { ad: 'yorumda İngilizce', dosyalar: tek(diy, S(diy), `# ${diy.metin}\n`), hata: ['ingilizce-yorum'] },
    { ad: 'İngilizceyle aynı çeviri (uyarı, hata değil)', dosyalar: tek(diy, diy.metin.trim()), hata: [], uyari: ['ingilizceyle-ayni'] },
    { ad: `terimin karşılığı eksik (uyarı): "${terim.en}"`, dosyalar: tek(trm, 'Işığın ötesinde çağların gölgesi düşüyor.'), hata: [], uyari: ['terim'] },
    { ad: 'istisnadaki terim uyarı vermez', dosyalar: { ...tek(trm, 'Işığın ötesinde çağların gölgesi düşüyor.'), [ISTISNA_DOSYASI]: ist(trm, terim.en, 'sınama') }, hata: [] },
    { ad: 'eskimiş istisna (karşılık artık var)', dosyalar: { ...tek(trm, S(trm)), [ISTISNA_DOSYASI]: ist(trm, terim.en, 'sınama') }, hata: [], uyari: ['terim-istisna-eskidi'] },
    { ad: 'gerekçesiz istisna sayılmaz', dosyalar: { ...tek(trm, 'Işığın ötesinde çağların gölgesi düşüyor.'), [ISTISNA_DOSYASI]: ist(trm, terim.en, '') }, hata: [], uyari: ['terim', 'terim-istisna-bicim'] },
    { ad: 'istisna gerekçesinde İngilizce', dosyalar: { ...tek(trm, 'Işığın ötesinde çağların gölgesi düşüyor.'), [ISTISNA_DOSYASI]: ist(trm, terim.en, diy.metin.trim()) }, hata: ['ingilizce-yorum'] },
  ].map((o) => ({ uyari: [], ...o }));
  return { ornekler, saglam, secilen: { tus, yer, num, bosluk, ad, diy, bos, ek, trm } };
}
const ist = (k, en, gerekce) => `${ISTISNA_BASLIK}| ${k.anahtar} | ${en} | ${gerekce} |\n`;

const kume = (a) => [...new Set(a)].sort().join(',');
function gomuluKarsiTest(K, font, P, T) {
  const { ornekler } = karsiOrnekler(K, P, T);
  const kalan = [];
  for (const o of ornekler) {
    const ist = o.dosyalar[ISTISNA_DOSYASI];
    const dosyalar = Object.entries(o.dosyalar).filter(([ad]) => ad !== ISTISNA_DOSYASI).map(([ad, icerik]) => ({ ad, icerik }));
    const r = denetle(dosyalar, K, font, P, { tablo: T.tablo, istisna: ist ? istisnaAyristir(ist) : { dosya: null, satirlar: [] } });
    const h = kume(r.hatalar.map((x) => x.kod)), u = kume(r.uyarilar.map((x) => x.kod));
    if (h !== kume(o.hata) || u !== kume(o.uyari)) kalan.push(`${o.ad}: beklenen hata [${kume(o.hata)}] uyarı [${kume(o.uyari)}], çıkan [${h}] [${u}]`);
  }
  // terim eşleştirmesinin tablodan bağımsız birim örnekleri (kök biçimleri, uzun terimin gölgesi)
  for (const x of [...kokSina(), ...golgeSina()]) kalan.push(`terim birimi: ${x}`);
  return { sayi: ornekler.length, kalan };
}

// ---------------------------------------------------------------- TR.txt
export function trUret(K, ceviriler) {
  const satirlar = [BASLIK];
  let ekKondu = false;
  const ekSatirlari = () => K.ekler.map((e) => [e.kategori, e.anahtar, ceviriler.get(e.anahtar)?.metin ?? e.ham, '', '', '', '', '', '', ''].join('\t'));
  for (const r of K.satirlar.slice(1)) {
    const o = r.slice();
    const c = r[1] ? ceviriler.get(r[1]) : null;
    if (c) { const k = K.harita.get(r[1]); o[2] = basBosluk(k.metin) + c.metin + sonBosluk(k.metin); }
    satirlar.push(o.join('\t'));
    if (!ekKondu && r[1] === K.ekOnceki) { satirlar.push(...ekSatirlari()); ekKondu = true; }
  }
  if (!ekKondu) satirlar.push(...ekSatirlari());
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(satirlar.join('\r\n') + '\r\n', 'utf16le')]);
}

// Oyunun bu TR.txt'den ne okuyacağı (anahtar → işlenmiş metin), yalnız İngilizce + çeviriden hesaplanır.
export function beklenen(K, ceviriler) {
  const m = new Map();
  for (const k of K.kayitlar) {
    const c = ceviriler.get(k.anahtar);
    m.set(k.anahtar, { metin: islenmis(c ? basBosluk(k.metin) + c.metin + sonBosluk(k.metin) : k.ham, 'TR'), konusmaci: k.konusmaci });
  }
  return m;
}

// TR.txt'yi dosya düzeyinde ve oyunun yükleyicisinin gözüyle doğrular; sorun listesi döner (boşsa sağlam).
export function trDogrula(buf, K, bek) {
  const sorun = [];
  if (buf[0] !== 0xff || buf[1] !== 0xfe) sorun.push('UTF-16 LE BOM yok');
  const s = buf.subarray(2).toString('utf16le');
  if (!s.endsWith('\r\n')) sorun.push('dosya CRLF ile bitmiyor');
  const satirlar = s.split('\r\n');
  satirlar.pop();
  satirlar.forEach((x, i) => {
    if (/[\r\n]/.test(x)) sorun.push(`satır ${i + 1}: CRLF dışında satır sonu`);
    const n = x.split('\t').length;
    if (n !== 10) sorun.push(`satır ${i + 1}: ${n} sütun`);
  });
  if (satirlar[0] !== BASLIK) sorun.push('başlık satırı İngilizceyle aynı değil');
  let tablo;
  try { tablo = oyunYukle(buf, 'TR'); } catch (e) { sorun.push(`oyunun yükleyicisi: ${e.message}`); return sorun; }
  const fazla = [...tablo.keys()].filter((a) => !bek.has(a)), eksik = [...bek.keys()].filter((a) => !tablo.has(a));
  if (fazla.length) sorun.push(`İngilizcede olmayan anahtar: ${fazla.slice(0, 5).join(', ')}${fazla.length > 5 ? ' …' : ''}`);
  if (eksik.length) sorun.push(`eksik anahtar: ${eksik.slice(0, 5).join(', ')}${eksik.length > 5 ? ' …' : ''}`);
  let metinFark = 0, konusmaciFark = 0, ilk = null;
  for (const [a, b] of bek) {
    const t = tablo.get(a);
    if (!t) continue;
    if (t.metin !== b.metin) { metinFark++; ilk ??= a; }
    if (t.konusmaci !== b.konusmaci) { konusmaciFark++; ilk ??= a; }
  }
  if (metinFark) sorun.push(`${metinFark} anahtarın metni beklenenden farklı (ilki ${ilk})`);
  if (konusmaciFark) sorun.push(`${konusmaciFark} anahtarın Speaker sütunu İngilizceden farklı (portre ve konuşmacı adı bozulur)`);
  return sorun;
}

// Kurulum programının yolu: oyunun kullanıcıdaki İngilizce/İspanyolca dosyaları ve gömülü çeviri dosyalarından
// TR.txt'nin baytlarını üretir. Dosya sistemine, ortam değişkenine ve modül sabitlerine (OYUN, LOC, FONT, HAM)
// dokunmaz; yazı tipi ve terim tablosu istemez (onlar geliştirmede `denetle`nin işi, kurulumda yok).
//   enBuf:    Content/Localization/TimespinnerStrings.txt (Buffer)
//   esBuf:    Content/Localization/ES.txt (Buffer; ek anahtarların yeri bu dosyadan taklit edilir)
//   dosyalar: [{ ad, icerik }] çeviri dosyaları (ceviri/<parti>.txt; icerik: UTF-8 metin)
// Çeviri satırında biçim hatası (ceviriOku), üretilen dosyada yükleyici taklidi sorunu (trDogrula) ya da
// eksik girdi varsa Error fırlatır; fırlarsa çağıran HİÇBİR ŞEY yazmamalıdır.
export function trKurulum({ enBuf, esBuf, dosyalar }) {
  if (!Buffer.isBuffer(enBuf) || !Buffer.isBuffer(esBuf) || !Array.isArray(dosyalar) || !dosyalar.length) {
    throw new Error('trKurulum: enBuf ve esBuf Buffer, dosyalar boş olmayan [{ ad, icerik }] dizisi olmalı');
  }
  if (dosyalar.some((d) => typeof d?.ad !== 'string' || typeof d?.icerik !== 'string')) {
    throw new Error('trKurulum: her çeviri dosyası { ad: metin, icerik: metin } olmalı');
  }
  const K = kaynakOlustur(enBuf, locSatirlari(esBuf, 'ES.txt'), 'TimespinnerStrings.txt');
  const r = ceviriOku(dosyalar, K);
  if (r.hatalar.length) {
    const ilk = r.hatalar.slice(0, 5).map((x) => `${x.yer} ${x.kod} ${x.anahtar}`).join(' | ');
    throw new Error(`trKurulum: çeviri dosyalarında ${r.hatalar.length} hata (ilk ${Math.min(5, r.hatalar.length)}: ${ilk})`);
  }
  const buf = trUret(K, r.ceviriler);
  const sorun = trDogrula(buf, K, beklenen(K, r.ceviriler));
  if (sorun.length) throw new Error(`trKurulum: üretilen TR.txt oyunun yükleyicisi taklidinden geçmedi: ${sorun.slice(0, 5).join(' · ')}`);
  return buf;
}

// TR.txt'nin satır iskeleti (Category, Key, Speaker, Target, sütun sayısı) taklit edilen dilinkiyle aynı mı.
function iskeletFarki(buf) {
  const es = digerDil(TAKLIT);
  if (!es) return [`${TAKLIT}.txt yok, karşılaştırılmadı`];
  const tr = buf.subarray(2).toString('utf16le').split('\r\n').slice(0, -1).map((x) => x.split('\t'));
  const fark = [];
  if (tr.length !== es.length) fark.push(`satır sayısı TR ${tr.length} · ${TAKLIT} ${es.length}`);
  for (let i = 0; i < Math.min(tr.length, es.length); i++) {
    const a = tr[i], b = es[i];
    if (a.length !== b.length || [0, 1, 3, 4].some((c) => a[c] !== b[c])) { fark.push(`satır ${i + 1}: TR ${a.slice(0, 2).join('/')} · ${TAKLIT} ${b.slice(0, 2).join('/')}`); if (fark.length > 4) break; }
  }
  return fark;
}

// ---------------------------------------------------------------- komutlar
function yazilabilir(p) {
  const r = path.resolve(p).toLowerCase(), h = path.resolve(HAM).toLowerCase() + path.sep;
  if (r.includes('steamapps')) throw new Dur(`oyun klasörüne yazılmaz: ${p}`);
  if (!r.startsWith(h)) throw new Dur(`yalnız ham/ altına yazılır: ${p}`);
  return p;
}

function cmdParti(args) {
  const K = kaynak(), P = partiler(K);
  let klasor = IS;
  const ki = args.indexOf('--klasor');
  if (ki >= 0) { klasor = path.resolve(args[ki + 1] || ''); args.splice(ki, 2); }
  yazilabilir(path.join(klasor, 'x'));
  const bilinmeyen = args.filter((a) => !P.adlar.has(a));
  if (bilinmeyen.length) throw new Dur(`bilinmeyen parti: ${bilinmeyen.join(', ')}`);
  const { uyari, metinler } = ekOlcum(K);
  const { ceviriler } = denetle(klasorOku(CEVIRI), K, fontKumesi(), P);
  console.log(`== Partiler · kaynak özeti ${K.ozet} · hedef ${bin(HEDEF)} kelime, üst sınır ${bin(UST)}`);
  console.log('  parti            anahtar  kelime  bloklar   ilk anahtar → son anahtar');
  for (const p of P.liste) {
    console.log(`  ${p.ad.padEnd(15)} ${String(p.kayitlar.length).padStart(7)} ${String(p.kelime).padStart(7)}  ${blokAraligi(p.bloklar).padEnd(8)}  ${p.kayitlar[0].anahtar} → ${p.kayitlar.at(-1).anahtar}${p.bastanKesik ? '  (blok içinden başlar)' : ''}`);
  }
  const ks = P.liste.map((p) => p.kelime);
  console.log(`  TOPLAM: ${P.liste.length} parti · ${bin(P.liste.reduce((s, p) => s + p.kayitlar.length, 0))} anahtar · ${bin(ks.reduce((a, b) => a + b, 0))} kelime · parti büyüklüğü ${bin(Math.min(...ks))}–${bin(Math.max(...ks))} kelime`);
  const kesik = P.liste.filter((p) => p.bastanKesik).map((p) => `${p.ad} (${blokAdi(p.birimler[0].blok)} içinden, sahne ${p.birimler[0].sahne})`);
  console.log(`  blok içinden kesilen: ${kesik.length ? kesik.join(' · ') : 'yok'}`);
  if (uyari.length) console.log(`  UYARI: öteki dillerde olup İngilizcede ve EK listesinde olmayan anahtar: ${uyari.join(', ')}`);
  const secilen = args.length ? P.liste.filter((p) => args.includes(p.ad)) : P.liste;
  fs.mkdirSync(klasor, { recursive: true });
  if (!args.length) for (const f of fs.readdirSync(klasor)) if (f.endsWith('.txt') && !P.adlar.has(f.slice(0, -4))) fs.rmSync(path.join(klasor, f));
  for (const p of secilen) fs.writeFileSync(path.join(klasor, `${p.ad}.txt`), isDosyasi(p, P.liste.indexOf(p) + 1, P.liste.length, K, P, ceviriler, metinler));
  console.log(`  yazıldı: ${goreli(klasor)}/ (${secilen.length} çalışma dosyası)`);
  return 0;
}

function denetimBas(r, baslik) {
  console.log(baslik);
  for (const x of r.hatalar) console.log(`HATA   ${x.yer}  ${x.kod}  ${x.anahtar} — ${x.aciklama}`);
  for (const x of r.uyarilar) console.log(`UYARI  ${x.yer}  ${x.kod}  ${x.anahtar} — ${x.aciklama}`);
}

function cmdDenetle(args) {
  const K = kaynak(), font = fontKumesi(), P = partiler(K);
  const klasor = path.resolve(args[0] || CEVIRI);
  const T = terimBaglami(klasor);
  const g = gomuluKarsiTest(K, font, P, T);
  if (g.kalan.length) {
    for (const x of g.kalan) console.log(`KARŞI TEST KALDI  ${x}`);
    console.log('HÜKÜM: KOŞAMADI (denetleyici bozuk örneği yakalamıyor ya da sağlamı reddediyor)');
    return 2;
  }
  const dosyalar = klasorOku(klasor);
  const r = denetle(dosyalar, K, font, P, T);
  denetimBas(r, `== Denetim: ${goreli(klasor)}/ · ${dosyalar.length} dosya · ${r.satirSay} çeviri satırı · gömülü karşı test ${g.sayi}/${g.sayi}`
    + `\n   terim: ${T.tablo.length} terim (docs/terimce.md) · ${r.terim.eslesme} eşleşme · ${r.terim.bastirilan} istisnayla susturuldu (${T.istisna.dosya ? `${ISTISNA_DOSYASI}, ${r.terim.istisna} satır` : `${ISTISNA_DOSYASI} yok`})`);
  console.log(r.hatalar.length ? `HÜKÜM: KALDI (${r.hatalar.length} hata, ${r.uyarilar.length} uyarı)` : `HÜKÜM: GEÇTİ (${r.uyarilar.length} uyarı)`);
  return r.hatalar.length ? 1 : 0;
}

function cmdBirlestir(args) {
  const K = kaynak(), font = fontKumesi(), P = partiler(K);
  const klasor = path.resolve(args[0] || CEVIRI), cikti = path.resolve(args[1] || CIKTI);
  yazilabilir(cikti);
  const r = denetle(klasorOku(klasor), K, font, P, terimBaglami(klasor));
  if (r.hatalar.length) {
    denetimBas(r, `== Birleştirme: ${goreli(klasor)}/ denetimden geçmedi, TR.txt yazılmadı`);
    console.log(`HÜKÜM: YAZILMADI (${r.hatalar.length} hata)`);
    return 1;
  }
  const buf = trUret(K, r.ceviriler);
  const sorun = trDogrula(buf, K, beklenen(K, r.ceviriler));
  if (sorun.length) {
    for (const x of sorun) console.log(`SORUN  ${x}`);
    console.log('HÜKÜM: YAZILMADI (üretilen TR.txt oyunun yükleyicisi taklidinden geçmedi)');
    return 1;
  }
  fs.mkdirSync(path.dirname(cikti), { recursive: true });
  fs.writeFileSync(cikti, buf);
  const fark = iskeletFarki(buf);
  const cevrilir = K.kayitlar.filter((k) => k.cevrilir).length;
  console.log(`== Birleştirme: ${goreli(klasor)}/ → ${goreli(cikti)}`);
  console.log(`  ${bin(buf.length)} bayt · ${K.satirlar.length + K.ekler.length} satır · Türkçe ${r.ceviriler.size}/${cevrilir} anahtar · İngilizce kalan ${cevrilir - r.ceviriler.size}`);
  console.log(`  oyunun yükleyicisi taklidi: anahtar kümesi = İngilizce + ${K.ekler.map((e) => e.anahtar).join(', ')}; metinler ve Speaker beklendiği gibi`);
  console.log(`  ${TAKLIT}.txt iskeletiyle (Category/Key/Speaker/Target, satır sırası): ${fark.length ? 'FARKLI — ' + fark.join(' · ') : 'aynı'}`);
  console.log(`HÜKÜM: YAZILDI${r.uyarilar.length ? ` (${r.uyarilar.length} uyarı: node tools/ceviri.mjs denetle)` : ''}`);
  return 0;
}

function cmdDurum(args) {
  const K = kaynak(), font = fontKumesi(), P = partiler(K);
  const klasor = path.resolve(args[0] || CEVIRI);
  const r = denetle(klasorOku(klasor), K, font, P);
  const hataDosya = new Map();
  for (const x of r.hatalar) { const d = x.yer.split(':')[0].replace(/\.txt$/i, ''); hataDosya.set(d, (hataDosya.get(d) || 0) + 1); }
  console.log(`== Çeviri durumu: ${goreli(klasor)}/ · kaynak özeti ${K.ozet} (sayım yalnız hatasız çeviriler)`);
  console.log('  parti            anahtar        kelime          dosya hatası');
  let tA = 0, tAM = 0, tK = 0, tKM = 0, dosyada = 0;
  for (const p of P.liste) {
    let a = 0, k = 0;
    for (const x of p.kayitlar) { const c = r.ceviriler.get(x.anahtar); if (c) dosyada++; if (c && !c.hatali) { a++; k += x.kelime; } }
    tA += a; tK += k; tAM += p.kayitlar.length; tKM += p.kelime;
    const yuzde = p.kelime ? Math.floor((100 * k) / p.kelime) : 0;
    console.log(`  ${p.ad.padEnd(15)} ${`${a}/${p.kayitlar.length}`.padStart(9)}  ${`${k}/${p.kelime}`.padStart(11)} %${String(yuzde).padEnd(3)} ${hataDosya.get(p.ad) || '-'}`);
  }
  console.log(`  TOPLAM          ${`${tA}/${tAM}`.padStart(9)}  ${`${tK}/${tKM}`.padStart(11)} %${Math.floor((100 * tK) / tKM)}`);
  if (dosyada !== tA) console.log(`  dosyada ${dosyada} çeviri var; ${dosyada - tA} tanesi hatalı olduğu için sayılmadı (node tools/ceviri.mjs denetle)`);
  if (r.hatalar.length) console.log(`  denetim: ${r.hatalar.length} hata`);
  console.log(`ölçü (kelime): ${tK}/${tKM}`);
  console.log(`ölçü (anahtar): ${tA}/${tAM}`);
  return 0;
}

// ---------------------------------------------------------------- karşı test
function cmdSina() {
  const K = kaynak(), font = fontKumesi(), P = partiler(K);
  const sonuc = [];
  const sina = (ad, kosul, ayrinti = '') => { sonuc.push(!!kosul); console.log(`  [${kosul ? 'GEÇTİ' : 'KALDI'}] ${ad}${ayrinti ? ` — ${ayrinti}` : ''}`); };
  const kos = (...a) => spawnSync(process.execPath, [BU, ...a], { cwd: KOK, encoding: 'utf8' });
  const dosyalariYaz = (klasor, dosyalar) => {
    fs.rmSync(klasor, { recursive: true, force: true });
    fs.mkdirSync(klasor, { recursive: true });
    for (const [ad, icerik] of Object.entries(dosyalar)) fs.writeFileSync(path.join(klasor, ad), icerik);
  };
  const cevImza = () => (fs.existsSync(CEVIRI) ? fs.readdirSync(CEVIRI).map((f) => { const s = fs.statSync(path.join(CEVIRI, f)); return `${f}:${s.size}:${s.mtimeMs}`; }).join('|') : 'yok');
  const imzaOnce = cevImza();
  yazilabilir(path.join(SINA, 'x'));
  fs.rmSync(SINA, { recursive: true, force: true });

  console.log('== 1. Partiler');
  const P2 = (() => { const eski = _P; _P = null; const y = partiler(K); _P = eski; return y; })();
  sina('aynı kaynaktan iki kez aynı bölme', JSON.stringify(P.liste.map((p) => p.kayitlar.map((k) => k.anahtar))) === JSON.stringify(P2.liste.map((p) => p.kayitlar.map((k) => k.anahtar))));
  const cevrilir = K.kayitlar.filter((k) => k.cevrilir);
  const say = new Map();
  for (const p of P.liste) for (const k of p.kayitlar) say.set(k.anahtar, (say.get(k.anahtar) || 0) + 1);
  sina('her çevrilecek anahtar tam bir partide', cevrilir.every((k) => say.get(k.anahtar) === 1) && say.size === cevrilir.length, `${say.size}/${cevrilir.length}`);
  const birimParti = new Map();
  for (const p of P.liste) for (const b of p.birimler) birimParti.set(b, p.ad);
  const bolunen = P.birimler.filter((b) => !birimParti.has(b));
  sina('hiçbir sahne/öğe birimi iki partiye bölünmedi', bolunen.length === 0 && P.liste.reduce((s, p) => s + p.birimler.length, 0) === P.birimler.length);
  const asan = P.liste.filter((p) => p.kelime > UST && p.birimler.length > 1);
  sina(`hiçbir parti ${UST} kelimeyi aşmıyor (tek birimlik parti hariç)`, asan.length === 0, `büyüklük ${Math.min(...P.liste.map((p) => p.kelime))}–${Math.max(...P.liste.map((p) => p.kelime))}`);
  const isK = path.join(SINA, 'is');
  const r1 = kos('parti', '--klasor', isK);
  const ilk = fs.existsSync(isK) ? fs.readdirSync(isK).sort().map((f) => fs.readFileSync(path.join(isK, f), 'utf8')) : [];
  const r2 = kos('parti', '--klasor', isK);
  const ikinci = fs.readdirSync(isK).sort().map((f) => fs.readFileSync(path.join(isK, f), 'utf8'));
  sina('parti komutu çıkış 0, iki koşumda bayt bayt aynı çalışma dosyaları', r1.status === 0 && r2.status === 0 && ilk.length === P.liste.length && ilk.join('\u0001') === ikinci.join('\u0001'), `${ilk.length} dosya`);
  const isAnahtar = new Map();
  for (const t of ilk) for (const m of t.matchAll(/^\[(.+?)\]/gm)) isAnahtar.set(m[1], (isAnahtar.get(m[1]) || 0) + 1);
  sina('çalışma dosyalarında her çevrilecek anahtar tam bir kez', cevrilir.every((k) => isAnahtar.get(k.anahtar) === 1) && isAnahtar.size === cevrilir.length);

  console.log('== 2. Denetim karşı testi (her örnek ayrı klasörde, komut satırından)');
  const { ornekler, saglam, secilen } = karsiOrnekler(K, P, terimBaglami(null));
  ornekler.forEach((o, i) => {
    const klasor = path.join(SINA, 'denetim', String(i + 1).padStart(2, '0'));
    dosyalariYaz(klasor, o.dosyalar);
    const r = kos('denetle', klasor);
    const kodlar = (tur) => kume([...r.stdout.matchAll(new RegExp(`^${tur} +\\S+ +(\\S+)`, 'gm'))].map((m) => m[1]));
    const beklenenCikis = o.hata.length ? 1 : 0;
    const tamam = r.status === beklenenCikis && kodlar('HATA') === kume(o.hata) && kodlar('UYARI') === kume(o.uyari);
    sina(`${o.ad} → ${o.hata.length ? o.hata.join(',') : 'hatasız'}${o.uyari.length ? ` + uyarı ${o.uyari.join(',')}` : ''}`, tamam,
      tamam ? '' : `çıkış ${r.status}, hata [${kodlar('HATA')}], uyarı [${kodlar('UYARI')}] ${r.stderr.slice(0, 200)}`);
  });

  console.log('== 3. Birleştirme: küçük sağlam küme');
  const kucuk = path.join(SINA, 'birlestir-kucuk'), ciktiK = path.join(SINA, 'cikti-kucuk', 'TR.txt');
  dosyalariYaz(kucuk, ornekler[0].dosyalar);
  const rb = kos('birlestir', kucuk, ciktiK);
  sina('birlestir çıkış 0 ve TR.txt yazıldı', rb.status === 0 && fs.existsSync(ciktiK), rb.status ? rb.stdout.slice(-300) : '');
  if (fs.existsSync(ciktiK)) {
    const buf = fs.readFileSync(ciktiK);
    const ceviriler = new Map([...saglam].map(([k, m]) => [k.anahtar, { metin: m }]));
    const bek = beklenen(K, ceviriler);
    const sorun = trDogrula(buf, K, bek);
    sina('dosya düzeyi (BOM, CRLF, her satır 10 sütun) ve yükleyici taklidi', sorun.length === 0, sorun.join(' · '));
    const fark = iskeletFarki(buf);
    sina(`${TAKLIT}.txt iskeletiyle satır satır aynı (Category/Key/Speaker/Target, ek anahtarların yeri)`, fark.length === 0, fark.join(' · '));
    const tablo = oyunYukle(buf, 'TR'), en = oyunYukle(fs.readFileSync(K.dosya), 'TR');
    const enAnahtar = new Set(en.keys()), trAnahtar = new Set(tablo.keys());
    const ekA = K.ekler.map((e) => e.anahtar);
    sina('oyunun okuduğu anahtar kümesi = İngilizce + ek anahtarlar', trAnahtar.size === enAnahtar.size + ekA.length && [...enAnahtar].every((a) => trAnahtar.has(a)) && ekA.every((a) => trAnahtar.has(a)), `${trAnahtar.size} = ${enAnahtar.size} + ${ekA.length}`);
    const turkce = [...saglam].every(([k, m]) => tablo.get(k.anahtar).metin === islenmis(basBosluk(k.metin) + m + sonBosluk(k.metin), 'TR'));
    sina('çevrilen anahtarlar Türkçe döner (\\n gerçek satır sonu, sondaki boşluk İngilizceden)', turkce && tablo.get(secilen.tus.anahtar).metin.includes('\n') && tablo.get(secilen.bosluk.anahtar).metin.endsWith(' '),
      `${secilen.tus.anahtar} → ${JSON.stringify(tablo.get(secilen.tus.anahtar).metin)}`);
    const kalanEn = [...en].filter(([a]) => !saglam.has(K.harita.get(a))).every(([a, v]) => tablo.get(a).metin === v.metin);
    sina('çevrilmeyen anahtarlar İngilizce kalır (TR kuralıyla işlenmiş hâli)', kalanEn);
    const ekKalan = K.ekler.filter((e) => !saglam.has(e)).every((e) => tablo.get(e.anahtar).metin === e.metin);
    sina('ek anahtarlar: çevrilen Türkçe, çevrilmeyen kodun yedeği', tablo.get(secilen.ek.anahtar).metin === 'AÇIK' && ekKalan);
    const konusan = K.kayitlar.find((k) => k.kategori === 'Dialogue' && k.konusmaci === secilen.ad.anahtar);
    const gorunen = tablo.get(tablo.get(konusan.anahtar).konusmaci)?.metin;
    sina('diyalog kutusu konuşmacı adını Türkçe bulur (Loc.Get(İngilizce Speaker))', gorunen === saglam.get(secilen.ad), `${konusan.anahtar}: Speaker "${tablo.get(konusan.anahtar).konusmaci}" → "${gorunen}"`);
    const konusmacilar = [...new Set(K.kayitlar.map((k) => k.konusmaci).filter(Boolean))];
    const adsiz = konusmacilar.filter((x) => !tablo.has(x));
    const enAdsiz = konusmacilar.filter((x) => !en.has(x));
    sina('anahtarı olmayan konuşmacı adı İngilizcedekilerle aynı (TR yeni eksik getirmiyor)', kume(adsiz) === kume(enAdsiz), `${konusmacilar.length - adsiz.length}/${konusmacilar.length} var; yok: ${adsiz.join(', ')}`);

    console.log('== 4. Yükleyici taklidinin karşı testi (bozulmuş TR.txt yakalanmalı)');
    const metin = buf.subarray(2).toString('utf16le');
    const tr = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
    const hedefSatir = metin.split('\r\n').find((x) => x.split('\t')[1] === secilen.diy.anahtar);
    const bozuklar = [
      ['metne sekme girmiş', tr(metin.replace(hedefSatir, hedefSatir.replace('Işığın ', 'Işığın\t')))],
      ['metne gerçek satır sonu girmiş', tr(metin.replace(hedefSatir, hedefSatir.replace('Işığın ', 'Işığın\r\n')))],
      ['dosyanın ortasında boş satır', tr(metin.replace(hedefSatir + '\r\n', hedefSatir + '\r\n\r\n'))],
      ['bir anahtar düşmüş', tr(metin.replace(hedefSatir + '\r\n', ''))],
      ['Speaker sütunu çevrilmiş', tr(metin.replace(hedefSatir, hedefSatir.split('\t').map((c, i) => (i === 3 ? 'Lünais' : c)).join('\t')))],
      ['BOM\'suz UTF-8', Buffer.from(metin, 'utf8')],
      ['çeviri kaybolmuş (İngilizce yazılmış)', tr(metin.replace(hedefSatir, [...hedefSatir.split('\t').slice(0, 2), secilen.diy.ham, ...hedefSatir.split('\t').slice(3)].join('\t')))],
    ];
    for (const [ad, b] of bozuklar) { const s = trDogrula(b, K, bek); sina(`${ad} → yakalandı`, s.length > 0, s.slice(0, 2).join(' · ')); }
  }

  console.log('== 5. Birleştirme: bozuk küme yazılmamalı');
  const bozukK = path.join(SINA, 'birlestir-bozuk'), ciktiB = path.join(SINA, 'cikti-bozuk', 'TR.txt');
  dosyalariYaz(bozukK, ornekler.find((o) => o.hata[0] === 'tus-simgesi').dosyalar);
  const rbb = kos('birlestir', bozukK, ciktiB);
  sina('birlestir çıkış 1 ve TR.txt yok', rbb.status === 1 && !fs.existsSync(ciktiB));
  // oyunda yama kuruluysa TR.txt bizimdir (tools/oyuna-kur.mjs): denetim "yok mu" değil "değişmedi mi"
  const oyunTR = path.join(OYUN, 'Content', 'Localization', 'TR.txt');
  const trOzet = () => (fs.existsSync(oyunTR) ? crypto.createHash('sha256').update(fs.readFileSync(oyunTR)).digest('hex') : 'yok');
  const onceTR = trOzet();
  const rd = kos('birlestir', kucuk, oyunTR);
  sina('oyun klasörüne yazma reddedildi (çıkış 2)', rd.status === 2 && trOzet() === onceTR);

  console.log('== 6. Tam küme: her anahtara yapay Türkçe (biçim öğeleri korunur), uçtan uca');
  const tam = path.join(SINA, 'birlestir-tam'), ciktiT = path.join(SINA, 'cikti-tam', 'TR.txt');
  const yapay = (k) => `Çğıİöşü ${k.anahtar.length} ${ogeler(k.metin, RE.hepsi).join(' ')}`.trim();
  const tamDosyalar = {};
  for (const p of P.liste) tamDosyalar[`${p.ad}.txt`] = p.kayitlar.map((k) => `${k.anahtar} = ${yapay(k)}`).join('\n') + '\n';
  dosyalariYaz(tam, tamDosyalar);
  const rtd = kos('denetle', tam);
  sina('denetle çıkış 0', rtd.status === 0, rtd.status ? rtd.stdout.split('\n').filter((x) => x.startsWith('HATA')).slice(0, 3).join(' | ') : '');
  const rtu = kos('durum', tam);
  const olcu = rtu.stdout.match(/^ölçü \(kelime\): (\d+)\/(\d+)$/m), olcuA = rtu.stdout.match(/^ölçü \(anahtar\): (\d+)\/(\d+)$/m);
  sina('durum ölçüsü N/M ve N = M', olcu && olcu[1] === olcu[2] && olcuA && olcuA[1] === olcuA[2], olcu ? `kelime ${olcu[1]}/${olcu[2]} · anahtar ${olcuA[1]}/${olcuA[2]}` : rtu.stdout.slice(-200));
  const rtb = kos('birlestir', tam, ciktiT);
  sina('birlestir çıkış 0', rtb.status === 0);
  if (fs.existsSync(ciktiT)) {
    const buf = fs.readFileSync(ciktiT), tablo = oyunYukle(buf, 'TR');
    const ceviriler = new Map(cevrilir.map((k) => [k.anahtar, { metin: yapay(k) }]));
    const sorun = trDogrula(buf, K, beklenen(K, ceviriler));
    sina('yükleyici taklidi: her çevrilen anahtar yapay Türkçesini döndürür', sorun.length === 0 && cevrilir.every((k) => tablo.get(k.anahtar).metin.startsWith('Çğıİöşü')), sorun.join(' · '));
    sina(`${TAKLIT}.txt iskeletiyle aynı`, iskeletFarki(buf).length === 0);
  }
  console.log('== 7. Terim denetimi gerçek çeviri üzerinde (ceviri/ okunur, yazılmaz)');
  const Tg = terimBaglami(CEVIRI);
  const rg = denetle(klasorOku(CEVIRI), K, font, P, Tg);
  const kt = karsiTest(rg.ceviriler, (a) => K.harita.get(a)?.metin.trim(), Tg.tablo);
  sina('uyarısız her eşleşmede karşılık silinince uyarı çıkar', kt.denenen > 0 && kt.kacan.length === 0, `${kt.denenen} eşleşme denendi, kaçan ${kt.kacan.length}${kt.kacan.length ? ': ' + kt.kacan.slice(0, 3).join(' · ') : ''}`);
  // Bilinçli sapmalar ceviri/terim-istisna.md'de; kalan her terim uyarısı (eskimiş ya da bozuk istisna dahil) bir kusurdur.
  const terimU = rg.uyarilar.filter((u) => u.kod.startsWith('terim'));
  sina('gerçek çeviride terim uyarısı yok (istisnalar sayıldıktan sonra)', Tg.istisna.dosya && rg.hatalar.length === 0 && terimU.length === 0,
    `${rg.terim.bastirilan} istisna · ${terimU.length} uyarı · ${rg.hatalar.length} hata${terimU.length ? ': ' + terimU.slice(0, 3).map((u) => `${u.anahtar} ${u.kod}`).join(' · ') : ''}`);

  sina('ceviri/ klasörüne dokunulmadı', cevImza() === imzaOnce);

  const kalan = sonuc.filter((x) => !x).length;
  console.log(kalan ? `HÜKÜM: KALDI (${kalan}/${sonuc.length} durum)` : `HÜKÜM: GEÇTİ (${sonuc.length}/${sonuc.length} durum)`);
  return kalan ? 1 : 0;
}

// ---------------------------------------------------------------- giriş
const KOMUTLAR = { parti: cmdParti, denetle: cmdDenetle, birlestir: cmdBirlestir, durum: cmdDurum, sina: cmdSina };
if (path.resolve(process.argv[1] || '') === BU) {
  const [komut, ...args] = process.argv.slice(2);
  let cikis;
  try {
    if (!KOMUTLAR[komut]) {
      console.error('kullanım: node tools/ceviri.mjs parti [ad ...] [--klasor <dizin>] | denetle [klasör] | birlestir [klasör] [çıktı] | durum [klasör] | sina');
      cikis = 2;
    } else cikis = KOMUTLAR[komut](args);
  } catch (e) {
    console.error(e instanceof Dur ? `DURDU: ${e.message}` : e.stack);
    cikis = 2;
  }
  process.exitCode = cikis;
}
