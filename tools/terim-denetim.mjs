// Terim tutarlılığı: çevrilen kayıtta, İngilizcesinde geçen terimin docs/terimce.md tablosundaki Türkçe
// karşılığı geçiyor mu? `node tools/ceviri.mjs denetle` bunu çağırır ve "terim" kodlu UYARI verir (hata değil:
// sıradan sözcük kullanımı, zamir, eş anlamlı haklı olabilir). Bilinçli sapma, denetlenen klasördeki
// terim-istisna.md'ye gerekçesiyle yazılır; artık uyarı üretmeyen istisna "terim-istisna-eskidi" uyarır.
//
// Eşleşme kuralları (her biri ajan partilerinde ölçülmüş bir yanlış uyarıdan; 11.11.2026):
//  - İngilizce: büyük harf duyarlı, sözcük sınırlı, çoğul/iyelik ekiyle (Orbs, Orb's). Daha uzun bir terimin
//    içindeki geçiş sayılmaz (Eternal Mother'daki Mother, Lachiemi Sun'daki Lachiemi).
//  - Türkçe: karşılığın her sözcüğünün bir kök biçimi metinde bir sözcüğün başında geçmeli. Küçük harf, ı=i,
//    kesme silinir (Asmodeus'un), harf olmayan atılır (Oyun+). Kök: -lı/-li eki atılır (Lachiemli → Lachiem
//    sıfatı) · iyelik -sı/-si atılır (Kozası) · ünsüzden sonraki iyelik ünlüsü atılır (Muhafızı → Muhafızları)
//    · sondaki ünsüzün sert/yumuşak eşi de kabul (Taç → Tacı, Ulağı → Ulakları).
// Göremez: küçük harfli İngilizce geçişi (lieutenants) · terimin yanlış anlamda ya da yanlış yerde kullanılması
// · eş anlamlıyla değiştirilmiş ama karşılığı başka yerde geçen cümle · ünlü düşmesi (ağız → ağzı) uyarı verir.
import fs from 'node:fs';
import path from 'node:path';

const BASLA = '<!-- tablo:başla', BIT = '<!-- tablo:bit -->';

// docs/terimce.md'nin üretilmiş tablosu → [{ en, tr }]. Türkçe hücredeki ⚠ notu (uzunluk ölçümü) atılır.
export function terimTablosu(md) {
  const i = md.indexOf(BASLA), j = md.indexOf(BIT);
  if (i < 0 || j < i) throw new Error('docs/terimce.md: tablo işaretleri bulunamadı');
  const out = [];
  for (const s of md.slice(i, j).split(/\r?\n/)) {
    if (!s.startsWith('| ') || s.startsWith('| İngilizce') || s.startsWith('|---')) continue;
    const h = s.split('|').map((x) => x.trim());
    const en = h[1].split(' · '), tr = h[2].split(' · ');
    if (en.length !== tr.length) throw new Error(`docs/terimce.md: İngilizce ve Türkçe terim sayısı tutmuyor: ${s.slice(0, 80)}`);
    en.forEach((e, k) => {
      const t = tr[k].replace(/\s*⚠\S*/g, '').trim();
      if (e && t) out.push({ en: e, tr: t, re: new RegExp(`\\b${kacis(e)}(?:s|es|'s|s')?\\b`, 'g') });
    });
  }
  if (!out.length) throw new Error('docs/terimce.md: tabloda terim yok');
  return out;
}

const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const kucuk = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/['’]/g, '');
// Metin: sözcük başı araması için harf olmayan her şey tek boşluk, başta ve sonda boşluk.
const metinNorm = (t) => ` ${kucuk(t).replace(/[^\p{L}\p{M}]+/gu, ' ').trim()} `;
const SERT = { p: 'b', ç: 'c', t: 'd', k: 'ğ' }, YUMUSAK = { b: 'p', c: 'ç', d: 't', ğ: 'k' };

// Türkçe karşılığın bir sözcüğü → metinde aranacak kök biçimleri (en az biri geçmeli).
export function kokler(sozcuk) {
  const w = kucuk(sozcuk).replace(/[^\p{L}\p{M}]/gu, '');
  if (!w) return [];
  let k = w;
  if (w.length >= 6 && /l[iuü]$/.test(w)) k = w.slice(0, -2);                // Lachiemli → lachiem, Viletli → vilet
  else if (w.length >= 5 && /s[iuü]$/.test(w)) k = w.slice(0, -2);           // Kozası → koza, Anası → ana
  else if (w.length >= 5 && /[^aeioöuüâîû][iuü]$/.test(w)) k = w.slice(0, -1); // Ulağı → ulağ, Muhafızı → muhafız
  const son = k.at(-1), es = SERT[son] || YUMUSAK[son];
  return es ? [k, k.slice(0, -1) + es] : [k];
}

// Karşılığın metinde eksik sözcükleri ([] = karşılık var).
export function eksikSozcukler(tr, metin) {
  const m = metinNorm(metin);
  return tr.split(/\s+/).filter((s) => { const b = kokler(s); return b.length && !b.some((x) => m.includes(` ${x}`)); });
}

// İngilizce metinde geçen terimler; daha uzun bir terimin geçişinin içinde kalan geçiş sayılmaz.
export function gecenTerimler(en, tablo) {
  const bulunan = [];
  for (const x of tablo) for (const m of en.matchAll(x.re)) bulunan.push({ x, bas: m.index, son: m.index + m[0].length });
  const icinde = (a, b) => b.x !== a.x && b.son - b.bas > a.son - a.bas && b.bas <= a.bas && a.son <= b.son;
  return [...new Set(bulunan.filter((a) => !bulunan.some((b) => icinde(a, b))).map((a) => a.x))];
}

// <klasör>/terim-istisna.md: `| anahtar | İngilizce terim | gerekçe |` satırları. Dosya yoksa istisna yok.
export const ISTISNA_DOSYASI = 'terim-istisna.md';
export function istisnaOku(klasor) {
  const dosya = path.join(klasor, ISTISNA_DOSYASI);
  return fs.existsSync(dosya) ? istisnaAyristir(fs.readFileSync(dosya, 'utf8')) : { dosya: null, satirlar: [] };
}
export function istisnaAyristir(metin) {
  const satirlar = [];
  metin.split(/\r?\n/).forEach((s, i) => {
    if (!s.startsWith('|') || /^\|\s*-/.test(s) || /^\|\s*anahtar\s*\|/.test(s)) return;
    const h = s.split('|').slice(1, -1).map((x) => x.trim());
    satirlar.push({ satir: i + 1, ham: s, anahtar: h[0] || '', en: h[1] || '', gerekce: h[2] || '', bicimHatasi: h.length !== 3 || !h[0] || !h[1] || !h[2] });
  });
  return { dosya: ISTISNA_DOSYASI, satirlar };
}
export const ISTISNA_BASLIK = '| anahtar | İngilizce terim | gerekçe |\n|---|---|---|\n';

// ceviriler: Map(anahtar → { metin, yer, hatali }) · enMetin(anahtar) → İngilizce. Dönüş: uyarılar
// ({ yer, kod, anahtar, aciklama }) ve sayımlar.
export function terimDenetle(ceviriler, enMetin, tablo, istisna = { dosya: null, satirlar: [] }) {
  const uyarilar = [], istMap = new Map(), kullanilan = new Set();
  const istYer = (x) => `${istisna.dosya}:${x.satir}`;
  for (const x of istisna.satirlar) {
    if (x.bicimHatasi) uyarilar.push({ yer: istYer(x), kod: 'terim-istisna-bicim', anahtar: x.anahtar || '-', aciklama: '"| anahtar | İngilizce terim | gerekçe |" biçiminde değil (gerekçe zorunlu)' });
    else istMap.set(`${x.anahtar}\u0000${x.en}`, x);
  }
  let eslesme = 0, bastirilan = 0;
  for (const [anahtar, c] of ceviriler) {
    if (c.hatali) continue;
    const en = enMetin(anahtar);
    if (!en) continue;
    for (const x of gecenTerimler(en, tablo)) {
      eslesme++;
      const eksik = eksikSozcukler(x.tr, c.metin);
      if (!eksik.length) continue;
      const ist = istMap.get(`${anahtar}\u0000${x.en}`);
      if (ist) { kullanilan.add(ist); bastirilan++; continue; }
      uyarilar.push({ yer: c.yer, kod: 'terim', anahtar, aciklama: `"${x.en}" → "${x.tr}" bekleniyor, eksik: ${eksik.join(', ')}` });
    }
  }
  for (const x of istMap.values()) {
    if (!kullanilan.has(x)) uyarilar.push({ yer: istYer(x), kod: 'terim-istisna-eskidi', anahtar: x.anahtar, aciklama: `"${x.en}" bu anahtarda artık uyarı vermiyor (çeviri değişti, silindi ya da terim tablodan çıktı): satırı sil` });
  }
  return { uyarilar, eslesme, bastirilan, istisna: istMap.size };
}

// Tablodan bağımsız birim örnekleri: [Türkçe karşılık, metin, karşılık var mı]. denetle her koşumda uygular.
export const KOK_ORNEKLERI = [
  ['Zaman Ulağı', 'Zaman Ulaklarından biriyim.', true],
  ['Taç', 'İmparatorluk Tacı parlıyor.', true],
  ["Asmodeus'un Gırtlağı", "Asmodeus'un Gırtlağına gir.", true],
  ['Lachiemli', 'Lachiem askerleri geliyor.', true],
  ['Viletli', 'Vilete ordusu yürüyor.', true],
  ['Kraliyet Muhafızı', 'Kraliyet Muhafızları kapıda.', true],
  ['Plazma Kozası', 'Plazma Kozasını aç.', true],
  ['Yeni Oyun+', 'YENİ OYUN+ başlasın.', true],
  ['Kadim Piramit', 'Kadim Piramidin içinde.', true],
  ['Ebedî Ana', 'Ebedî Anne bizi korusun.', false],
  ['Zaman Ulağı', 'Zaman Habercisi geldi.', false],
  ['Küre', 'Bu bir kürek.', true],      // bilinen gevşeklik: sözcük başı yeter (karşı test ölçer)
  ['Küre', 'Bu bir top.', false],
  ['Ana', 'Zamana yolculuk.', false],    // sözcük ortası sayılmaz
];
export function kokSina() {
  return KOK_ORNEKLERI.filter(([tr, m, var_]) => (eksikSozcukler(tr, m).length === 0) !== var_)
    .map(([tr, m, var_]) => `"${tr}" / "${m}": beklenen ${var_ ? 'var' : 'yok'}`);
}
const tabloOrnegi = () => terimTablosu(`${BASLA} -->\n| İngilizce | Türkçe |\n|---|---|\n| Mother · Eternal Mother · Orb | Anne · Ebedî Ana · Küre ⚠90px>80 |\n${BIT}`);
export function golgeSina() {
  const t = tabloOrnegi(), ad = (en) => gecenTerimler(en, t).map((x) => x.en).sort().join(',');
  const r = [];
  if (ad('Praise the Eternal Mother.') !== 'Eternal Mother') r.push('uzun terimin içindeki kısa terim sayıldı');
  if (ad('Mother and the Eternal Mother.') !== 'Eternal Mother,Mother') r.push('bağımsız kısa terim kayboldu');
  if (ad('Two Orbs.') !== 'Orb') r.push('çoğul eşleşmedi');
  if (ad('Smother.') !== '') r.push('sözcük içi eşleşti');
  if (t.find((x) => x.en === 'Orb').tr !== 'Küre') r.push('⚠ notu terime karıştı');
  return r;
}

// Gerçek çeviri üzerinde karşı test: uyarısız her eşleşmede karşılığın köklerini taşıyan sözcükleri sil;
// her biri uyarı vermeli. Dönüş: { denenen, kacan: [açıklama] }.
export function karsiTest(ceviriler, enMetin, tablo) {
  let denenen = 0; const kacan = [];
  for (const [anahtar, c] of ceviriler) {
    if (c.hatali) continue;
    const en = enMetin(anahtar);
    if (!en) continue;
    for (const x of gecenTerimler(en, tablo)) {
      if (eksikSozcukler(x.tr, c.metin).length) continue;
      const kk = x.tr.split(/\s+/).flatMap(kokler);
      const bozuk = c.metin.split(/(\s+)/).map((w) => (kk.some((k) => metinNorm(w).includes(` ${k}`)) ? 'XXX' : w)).join('');
      denenen++;
      if (!eksikSozcukler(x.tr, bozuk).length) kacan.push(`${anahtar}: "${x.tr}"`);
    }
  }
  return { denenen, kacan };
}
