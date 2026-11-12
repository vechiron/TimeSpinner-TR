// Kurulum çekirdeği: yamayı oyun klasörüne kurar, geri alır, durumunu söyler. Denetim → yedek → kopya → özet.
// Saf modül: içe aktarılınca hiçbir şey yapmaz (komut satırı yok, çıktı basmaz, dosya okumaz) ve projenin başka
// hiçbir dosyasını içe aktarmaz; yalnız node:fs, node:path, node:crypto. Bu yüzden tek-exe kurulum programının
// içine paketlenebilir. Yol sabiti yok: oyun klasörü (`oyun`), yedek klasörü (`yedek`) ve kurulacak dosyalar
// (`kaynak`) hep parametre. Orijinal oyunda olmayan dosyaların kümesi (`yeni`) de parametredir: o dosyalar
// yedeklenmez, kaldırınca silinir. Komut satırı ve proje yolları: tools/oyuna-kur.mjs.
//
// Parametreler (kur · durum · kaldir ortak):
//   oyun    oyun klasörünün yolu
//   yedek   yedek klasörünün yolu (içinde yedek.json: { oyun, tarih, dosyalar: { <göreli yol>: { orijinal, kurulan } } };
//           orijinal/kurulan sha256, orijinal oyunda olmayan dosyada orijinal null)
//   kaynak  { <oyuna göre göreli yol>: <kurulacak dosyanın yolu> }
//   yeni    orijinal oyunda olmayan göreli yollar (Set ya da dizi); kur ve durum ister, kaldir istemez
//   yaz     ilerleme satırı yazan işlev (varsayılan console.log; sessiz için () => {})
//   kopyala (yalnız kur) kopya işlevi (varsayılan fs.copyFileSync); karşı test yarıda kesilen kopyayı buradan sınar
// Kurallar: bir dosya ne orijinal ne bizim kurduğumuz ise (oyun güncellenmiş, Steam onarmış) hiçbir şeye dokunmadan
//   Durdu atılır · yeni dosya kurulumdan önce varsa Durdu · yeni olmayan bir dosya oyunda yoksa Durdu. Durdu:
//   oyun klasörüne hiçbir şey yazılmadı. Başka hata (Error): yazarken sorun, durum ile bakılır.
// Yarıda kesilince oyun ya orijinalde ya yedek.json'daki hâlde kalır: kayıt kopyadan önce yazılır.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Kurulumu denetim aşamasında durduran hata: oyun klasörüne yazılmadan atılır.
export class Durdu extends Error {}

const kisa = (h) => (h ? h.slice(0, 12) : 'yok');

function yeniKume(yeni) {
  if (yeni instanceof Set) return yeni;
  if (Array.isArray(yeni)) return new Set(yeni);
  throw new TypeError('yeni: orijinal oyunda olmayan dosyaların kümesi (Set ya da dizi) verilmedi');
}

export const ozet = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);

export function kayitOku(yedek) {
  const f = path.join(yedek, 'yedek.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

export function durum({ oyun, yedek, kaynak, yeni, yaz = console.log }) {
  const YENI = yeniKume(yeni);
  const kayit = kayitOku(yedek);
  const etiketler = Object.entries(kaynak).map(([rel, src]) => {
    const simdi = ozet(path.join(oyun, rel)), k = kayit?.dosyalar[rel];
    let e;
    if (k) e = simdi === k.kurulan ? 'yamalı' : simdi === k.orijinal ? 'orijinal' : 'BİLİNMEYEN';
    else if (simdi && simdi === ozet(src)) e = 'yamalı (yedek kaydı YOK)';
    else e = simdi ? 'orijinal' : 'yok';
    yaz(`  ${e.padEnd(10)} ${rel}  [${kisa(simdi)}]`);
    return e === 'yok' && YENI.has(rel) ? 'orijinal' : e.split(' ')[0];
  });
  const h = etiketler.every((e) => e === 'yamalı') ? 'YAMALI' : etiketler.every((e) => e === 'orijinal') ? 'ORİJİNAL' : 'KARIŞIK';
  yaz(`  yedek: ${kayit ? `${yedek} (${kayit.tarih})` : 'yok'}`);
  yaz(`HÜKÜM: ${h}`);
  return h;
}

// oyunDosyasi: bu klasörün oyun klasörü olduğunu gösteren dosya (yoksa Durdu).
export function kur({ oyun, yedek, kaynak, yeni, yaz = console.log, kopyala = fs.copyFileSync, oyunDosyasi = 'Timespinner.exe' }) {
  const YENI = yeniKume(yeni);
  // 1. Denetim: buradan sonrasına kadar hiçbir yere yazılmaz.
  if (!fs.existsSync(path.join(oyun, oyunDosyasi))) throw new Durdu(`oyun bulunamadı: ${oyun}`);
  for (const src of Object.values(kaynak)) if (!fs.existsSync(src)) throw new Durdu(`kaynak yok: ${src}`);
  // 0. Başka bir sürümümüz kuruluysa önce o geri alınır. Kayıt kopyadan önce yazılıyor: eski kurulanın üstüne
  //    yazarken yarıda kalan kopya, kaydın tanımadığı bir dosya bırakır ve kaldır durur. Kaldır + kur'da oyun her
  //    an ya orijinal ya da kayıttaki hâldedir. kaldir() da önce denetler: durursa hiçbir şey yazılmamıştır.
  const eski = kayitOku(yedek);
  if (eski && Object.entries(kaynak).some(([rel, src]) => eski.dosyalar[rel] && eski.dosyalar[rel].kurulan !== ozet(src))) {
    yaz('  başka bir sürüm kurulu: önce geri alınıyor');
    kaldir({ oyun, yedek, yaz });
  }
  const kayit = kayitOku(yedek) || { oyun, tarih: null, dosyalar: {} };
  const plan = Object.entries(kaynak).map(([rel, src]) => {
    const hedef = path.join(oyun, rel), simdi = ozet(hedef), k = kayit.dosyalar[rel];
    if (k && simdi !== k.orijinal && simdi !== k.kurulan)
      throw new Durdu(`${rel} ne orijinal ne yamalı [${kisa(simdi)}]: oyun güncellenmiş olabilir, yedek eskidi`);
    if (!k && YENI.has(rel) && simdi) throw new Durdu(`${rel} kurulumdan önce de var: kimin olduğu bilinmiyor`);
    if (!k && !YENI.has(rel) && !simdi) throw new Durdu(`${rel} oyunda yok: oyun eksik ya da güncellenmiş`);
    if (k && k.orijinal && ozet(path.join(yedek, rel)) !== k.orijinal) throw new Durdu(`${rel} yedeği bozuk ya da yok`);
    return { rel, src, hedef, simdi, yeni: ozet(src), orijinal: k ? k.orijinal : simdi, yedekVar: !!k };
  });
  // 2. Yedek: kaydı olmayan dosyanın şimdiki hâli orijinaldir. Kayıt, oyuna dokunmadan önce yazılır.
  for (const p of plan) {
    if (p.yedekVar || !p.orijinal) continue;
    const y = path.join(yedek, p.rel);
    fs.mkdirSync(path.dirname(y), { recursive: true });
    fs.copyFileSync(p.hedef, y);
    if (ozet(y) !== p.orijinal) throw new Error(`${p.rel} yedeği doğrulanamadı`);
  }
  for (const p of plan) kayit.dosyalar[p.rel] = { orijinal: p.orijinal, kurulan: p.yeni };
  kayit.tarih = new Date().toISOString();
  fs.mkdirSync(yedek, { recursive: true });
  fs.writeFileSync(path.join(yedek, 'yedek.json'), JSON.stringify(kayit, null, 2) + '\n');
  // 3. Kopya ve doğrulama.
  for (const p of plan) {
    if (p.simdi === p.yeni) { yaz(`  zaten kurulu  ${p.rel}`); continue; }
    fs.mkdirSync(path.dirname(p.hedef), { recursive: true });
    kopyala(p.src, p.hedef); // karşı test yarıda kesilen kopyayı buradan sınar
    if (ozet(p.hedef) !== p.yeni) throw new Error(`${p.rel} kopyası doğrulanamadı`);
    yaz(`  kuruldu       ${p.rel}  [${kisa(p.orijinal)} → ${kisa(p.yeni)}]`);
  }
}

export function kaldir({ oyun, yedek, yaz = console.log }) {
  const kayit = kayitOku(yedek);
  if (!kayit) throw new Durdu(`yedek kaydı yok (${yedek}): oyun bu araçla yamalanmamış`);
  const plan = Object.entries(kayit.dosyalar).map(([rel, k]) => {
    const hedef = path.join(oyun, rel), simdi = ozet(hedef);
    if (simdi !== k.orijinal && simdi !== k.kurulan)
      throw new Durdu(`${rel} ne orijinal ne yamalı [${kisa(simdi)}]: oyun güncellenmiş olabilir, eski yedek geri konmaz`);
    if (k.orijinal && simdi !== k.orijinal && ozet(path.join(yedek, rel)) !== k.orijinal) throw new Durdu(`${rel} yedeği bozuk ya da yok`);
    return { rel, hedef, simdi, ...k };
  });
  for (const p of plan) {
    if (p.simdi === p.orijinal) { yaz(`  zaten orijinal  ${p.rel}`); continue; }
    if (p.orijinal) fs.copyFileSync(path.join(yedek, p.rel), p.hedef);
    else fs.rmSync(p.hedef);
    if (ozet(p.hedef) !== p.orijinal) throw new Error(`${p.rel} geri konamadı`);
    yaz(`  geri kondu      ${p.rel}  [${kisa(p.orijinal)}]`);
  }
  fs.rmSync(yedek, { recursive: true, force: true });
  yaz('  yedek silindi (oyun orijinal hâlinde, özetler tuttu)');
}
