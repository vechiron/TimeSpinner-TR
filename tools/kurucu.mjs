// Oyuncunun programı: Timespinner'a Türkçeyi YENİ BİR DİL olarak kurar ya da kaldırır (dil menüsünde Türk bayrağı).
// Oyunun hiçbir dosyası programda yok: yamalı dosyalar oyuncunun kendi oyun klasöründen üretilir (kurucu-uret.mjs;
// geliştiricinin manifest.json'ı üreten kodu AYNI işlev). Exe'ye kurucu-derle.mjs çevirir; çeviri, yamacı ve Cecil gömülü.
// Sıra: oyunu bul → dosyaları manifest'le karşılaştır (tanınmayan sürüme dokunma) → oyun açıksa bekle → yamalı dosyaları
// geçici klasörde üret → üretilen her dosyanın özeti manifest'tekiyle aynı mı (değilse HİÇBİR ŞEY yazma) → kur-cekirdek.kur
// (yedek, kopya, geri okuma) → sonuç yamalı mı diye yeniden ölç. Yedek oyun klasörünün dışında: <veri>\yedek.
//
// Sınama için (proje kökünden; exe aynı parametreleri alır, --varlik hariç):
//   node tools/kurucu.mjs --varlik <klasör> [--oyun <oyun klasörü>] [--veri <yedek ve günlük klasörü>]
//   --varlik  yalnız doğrudan çalıştırmada: node tools/kurucu-varlik.mjs uret <klasör> ile hazırlanır (exe'de gömülü)
//   --oyun    yoksa oyun Steam'in kayıtlarından bulunur · --veri yoksa %LOCALAPPDATA%\TimespinnerTR
//   --sahte-oyun-acik <dosya>   SINAMA KANCASI: dosya varken oyun açık sayılır (gerçek süreç denetimi yerine)
// Cevaplar stdin'den satır satır okunur (boruyla da verilebilir). Çıkış: 0 tamam ya da vazgeçildi · 1 sorun.
// Dosya düzeyinde await yok (exe'ye çevrilen biçim CJS: kurucu-plani.md "Adım 4").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Durdu, ozet, kayitOku, kur as cekirdekKur, kaldir as cekirdekKaldir } from './kur-cekirdek.mjs';
import { uret, sha256, UretimSorunu, EXE_REL, GIRDI_DOSYALARI, CIKTI_DOSYALARI, YENI, VARLIK } from './kurucu-uret.mjs';

const STEAM_DOGRULA = 'Oyunun özgün dosyalarını geri getirmek için: Steam\'de oyuna sağ tıklayın > Özellikler > Yüklü Dosyalar >\n"Oyun dosyalarının bütünlüğünü doğrula".';

class Sorun extends Error {} // oyuncuya olduğu gibi gösterilen
class Vazgec extends Error {}

const arg = process.argv.slice(2), secenek = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null; };
const VERI = path.resolve(secenek('--veri') ?? path.join(process.env.LOCALAPPDATA || os.homedir(), 'TimespinnerTR'));
const yaz = (s = '') => process.stdout.write(s + '\n');
const gunlukSatirlari = [`--- ${new Date().toISOString()} kurucu ---`];
const gunluk = (s) => gunlukSatirlari.push(s);

// stdin satırları kuyrukta: boruyla gelen satırlar soru sorulmadan önce gelse de kaybolmaz
const satirlar = [], bekleyenler = [];
let girdiBitti = false;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (s) => (bekleyenler.length ? bekleyenler.shift()(s) : satirlar.push(s)));
rl.on('close', () => { girdiBitti = true; while (bekleyenler.length) bekleyenler.shift()(null); });
// cevap (çevresindeki boşluk ve tırnaklar atılmış; "Yol olarak kopyala" tırnaklı verir) ya da girdi bittiyse null
async function sor(soru) {
  process.stdout.write(soru);
  const s = satirlar.length ? satirlar.shift() : girdiBitti ? null : await new Promise((ok) => bekleyenler.push(ok));
  if (!process.stdin.isTTY) yaz(s ?? '');
  return s === null ? null : s.trim().replace(/^"(.*)"$/, '$1').trim();
}

// ---------------------------------------------------------------- gömülü veri
// Exe'de varlıklar node:sea ile gömülü; doğrudan çalıştırmada --varlik klasöründen. İki yol AYNI adları okur.
const sea = (() => { try { const s = process.getBuiltinModule?.('node:sea'); return s?.isSea?.() ? s : null; } catch { return null; } })();

function varlikOkuyucu() {
  if (sea) return (ad) => { try { return Buffer.from(sea.getAsset(ad)); } catch { throw new Sorun(`Program dosyası bozuk: "${ad}" gömülü değil.`); } };
  const klasor = secenek('--varlik');
  if (!klasor) throw new Sorun('Doğrudan çalıştırmada --varlik <klasör> gerekir (node tools/kurucu-varlik.mjs uret <klasör>).');
  const kok = path.resolve(klasor);
  return (ad) => fs.readFileSync(path.join(kok, ...ad.split('/')));
}

function manifestOku(varlik) {
  let m;
  try { m = JSON.parse(varlik(VARLIK.manifest).toString('utf8')); } catch { throw new Sorun('Programın manifest dosyası okunamadı (program bozuk).'); }
  const tam = (n, liste) => !!n && typeof n === 'object' && liste.every((r) => /^[0-9a-f]{64}$/.test(n[r]));
  if (typeof m?.surum !== 'string' || !Array.isArray(m.ceviri) || !m.ceviri.length || !m.ceviri.every((a) => /^[\w.-]+\.txt$/.test(a))
    || !tam(m.girdi, GIRDI_DOSYALARI) || !tam(m.cikti, CIKTI_DOSYALARI)) throw new Sorun('Programın manifest dosyası eksik ya da bozuk.');
  return m;
}

// ---------------------------------------------------------------- oyunu bulma
const oyunKlasoru = (k) => fs.existsSync(path.join(k, EXE_REL)) && fs.existsSync(path.join(k, 'Content', 'Localization', 'TimespinnerStrings.txt'));

// Steam: kurulum yeri kayıt defterinde, kütüphaneler libraryfolders.vdf'te; oyun, kurulum kaydı (appmanifest_368620.acf)
// olan kütüphanede. Kütüphane listesinin "apps" bölümüne güvenilmez (başka oyunda orada olmayan kurulu oyun görüldü).
function oyunuBul() {
  const steamlar = [];
  for (const [anahtar, deger] of [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'], ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']]) {
    try {
      // reg'in çıktısı konsolun kod sayfasında: Türkçe harfli yol bozuk gelir, ASCII olmayan yol atlanır
      const c = execFileSync('reg', ['query', anahtar, '/v', deger], { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      const m = new RegExp(`${deger}\\s+REG_SZ\\s+([\\x20-\\x7e]+?)\\s*$`, 'm').exec(c);
      if (m) steamlar.push(path.resolve(m[1]));
    } catch { /* anahtar yok ya da Windows değil */ }
  }
  steamlar.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  const adaylar = [path.dirname(process.execPath)]; // exe oyun klasörüne konduysa
  for (const steam of steamlar) {
    let vdf;
    try { vdf = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8'); } catch { continue; }
    for (const kutuphane of [steam, ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'))]) {
      try {
        const dizin = /"installdir"\s+"([^"]+)"/.exec(fs.readFileSync(path.join(kutuphane, 'steamapps', 'appmanifest_368620.acf'), 'utf8'))?.[1];
        if (dizin) adaylar.push(path.join(kutuphane, 'steamapps', 'common', dizin));
      } catch { /* bu kütüphanede değil */ }
    }
  }
  return adaylar.find(oyunKlasoru) ?? null;
}

// ---------------------------------------------------------------- oyun açık mı
function oyunAcik() {
  const sahte = secenek('--sahte-oyun-acik');
  if (sahte) return fs.existsSync(sahte); // sınama kancası
  try {
    const c = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Timespinner.exe', '/NH', '/FO', 'CSV'], { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return /"Timespinner\.exe"/i.test(c);
  } catch { return false; } // tasklist yok (Windows değil): oyun dosyayı tutuyorsa kopya zaten hata verir
}
async function oyunKapanana() {
  while (oyunAcik()) {
    const c = await sor('Oyun açık. Oyunu kapatın, sonra Enter\'a basın (vazgeçmek için 0): ');
    if (c === null || c === '0') throw new Vazgec();
  }
}

// ---------------------------------------------------------------- durum
// Oyunun dosyalarını manifest'le karşılaştırır. hukum: ORİJİNAL (hepsi özgün) · YAMALI (hepsi bizim) · KARIŞIK (bazısı özgün,
// bazısı bizim: Steam'in dosya doğrulaması ya da güncelleme yamayı yarıda bırakmış; yalnız doğru bir yedek kaydı varsa) ·
// TANINMADI (bilmediğimiz bir dosya var: oyun güncellenmiş ya da başka bir program değiştirmiş; dokunulmaz).
function durumOlc(oyun, m, yedek) {
  const s = (rel) => ozet(path.join(oyun, rel));
  const bilinmeyen = [];
  // Yamanın değiştirmediği girdiler (oyunun sürümünü tanımak için): her durumda özgün olmalı
  for (const rel of GIRDI_DOSYALARI) if (!CIKTI_DOSYALARI.includes(rel) && s(rel) !== m.girdi[rel]) bilinmeyen.push(rel);
  const etiket = Object.fromEntries(CIKTI_DOSYALARI.map((rel) => {
    const simdi = s(rel);
    const ozgun = Object.hasOwn(m.girdi, rel) ? simdi === m.girdi[rel] : simdi === null; // yeni dosyanın özgün hâli: yok
    const e = simdi === m.cikti[rel] ? 'yamalı' : ozgun ? 'özgün' : 'bilinmeyen';
    if (e === 'bilinmeyen') bilinmeyen.push(rel);
    return [rel, e];
  }));
  const hepsi = (e) => CIKTI_DOSYALARI.every((rel) => etiket[rel] === e);
  if (bilinmeyen.length) return { hukum: 'TANINMADI', etiket, bilinmeyen };
  if (hepsi('özgün')) return { hukum: 'ORİJİNAL', etiket, bilinmeyen };
  if (hepsi('yamalı')) return { hukum: 'YAMALI', etiket, bilinmeyen };
  let kayit = null;
  try { kayit = kayitOku(yedek); } catch { /* bozuk kayıt: yok sayılır */ }
  const kayitDogru = !!kayit && CIKTI_DOSYALARI.every((rel) => {
    const k = kayit.dosyalar?.[rel];
    return k && k.kurulan === m.cikti[rel] && k.orijinal === (m.girdi[rel] ?? null);
  });
  return kayitDogru ? { hukum: 'KARIŞIK', etiket, bilinmeyen } : { hukum: 'TANINMADI', etiket, bilinmeyen: ['yedek kaydı yok ya da bu yamaya ait değil'] };
}

// ---------------------------------------------------------------- kur / kaldır
let yazmayaBasladi = false; // çekirdeğe geçildi: bundan sonraki bir hata "dosyalar değişmedi" demez

async function kur(oyun, yedek, m, varlik) {
  yaz('Yama hazırlanıyor (birkaç saniye sürer)...');
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'timespinner-tr-'));
  try {
    // Üretimin okuyacağı her girdi, manifest'teki özgün özetle birebir aynı olmalı: oyundaki dosya özgünse o, yamalıysa yedeği
    const girdiYolu = (rel) => {
      for (const f of [path.join(oyun, rel), path.join(yedek, rel)]) if (ozet(f) === m.girdi[rel]) return f;
      throw new Sorun(`${rel} için özgün dosya bulunamadı (oyun ya da yedek); oyunun dosyaları değişmedi.`);
    };
    const uretilen = uret({ girdiYolu, varlik, ceviriAdlari: m.ceviri, gecici: path.join(gecici, 'is'), gunluk });
    const kaynak = {};
    for (const rel of CIKTI_DOSYALARI) {
      const s = sha256(uretilen[rel]);
      gunluk(`üretilen ${rel} ${s}`);
      if (s !== m.cikti[rel]) throw new Sorun('Yama bu bilgisayarda beklenen sonucu vermedi; oyunun dosyaları değişmedi.');
      const f = path.join(gecici, 'uretilen', rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, uretilen[rel]);
      kaynak[rel] = f;
    }
    yazmayaBasladi = true;
    cekirdekKur({ oyun, yedek, kaynak, yeni: YENI, yaz: (s) => { yaz(s); gunluk(s); } });
  } finally { fs.rmSync(gecici, { recursive: true, force: true }); }
  if (durumOlc(oyun, m, yedek).hukum !== 'YAMALI') throw new Error('kurulumdan sonra dosyalar beklenen hâlde değil');
  gunluk('kuruldu: yamalı');
}

function kaldir(oyun, yedek, m) {
  yazmayaBasladi = true;
  cekirdekKaldir({ oyun, yedek, yaz: (s) => { yaz(s); gunluk(s); } });
  if (durumOlc(oyun, m, yedek).hukum !== 'ORİJİNAL') throw new Error('kaldırmadan sonra dosyalar özgün hâlde değil');
  gunluk('kaldırıldı: özgün');
}

// ---------------------------------------------------------------- akış
async function ana() {
  process.title = 'Timespinner - Türkçe yama';
  const varlik = varlikOkuyucu(), m = manifestOku(varlik);
  yaz(`Timespinner — Türkçe yama ${m.surum}`);
  yaz('Türkçeyi oyuna YENİ BİR DİL olarak ekler: dil menüsünde Türk bayrağı, tam Türkçe metin ve Türkçe harfler.');
  yaz('Var olan hiçbir dilin yerine geçmez. Oyunun kendi dosyalarını değiştirir, kaldırınca geri koyar.');
  yaz();
  let oyun = secenek('--oyun') ? path.resolve(secenek('--oyun')) : oyunuBul();
  while (!oyun || !oyunKlasoru(oyun)) {
    yaz(oyun ? `Bu klasörde Timespinner yok: ${oyun}` : 'Oyun bulunamadı.');
    yaz('Oyunun klasörünü yazın ya da yapıştırın. Steam\'de oyuna sağ tıklayıp "Yönet" > "Yerel dosyalara göz at" ile açılan');
    yaz('pencerenin adres çubuğundaki yol.');
    const c = await sor('Klasör (çıkmak için boş bırakıp Enter): ');
    if (!c) return 0;
    oyun = path.resolve(c);
  }
  const yedek = path.join(VERI, 'yedek');
  yaz(`Oyun: ${oyun}`);
  const d = durumOlc(oyun, m, yedek);
  gunluk(`oyun: ${oyun}; durum: ${d.hukum}${d.bilinmeyen.length ? ` (${d.bilinmeyen.join(', ')})` : ''}; veri: ${VERI}; steam yapı (yama): ${m.steamBuildId ?? '?'}`);
  if (d.hukum === 'TANINMADI') {
    yaz('Oyunun dosyaları tanınmadı: ne özgün hâli ne de bu yamanın kurduğu hâli.');
    yaz(`  tanınmayan: ${d.bilinmeyen.join(', ')}`);
    yaz('Oyun güncellenmiş ya da dosyalar başka bir programla değiştirilmiş olabilir.');
    if (m.steamBuildId) yaz(`Bu yama oyunun Steam yapı numarası ${m.steamBuildId} olan sürümü içindir. Hiçbir dosyaya dokunulmadı.`);
    else yaz('Hiçbir dosyaya dokunulmadı.');
    yaz(STEAM_DOGRULA);
    yaz('Sonra bu programı yeniden çalıştırın.');
    return 1;
  }
  const kurulacak = d.hukum !== 'YAMALI';
  yaz(d.hukum === 'ORİJİNAL' ? 'Oyun özgün hâlinde: Türkçe yama kurulu değil.'
    : d.hukum === 'YAMALI' ? 'Türkçe yama kurulu.'
      : 'Türkçe yama yarım kalmış (Steam\'in dosya doğrulaması ya da bir güncelleme bazı dosyaları geri koymuş olabilir).');
  yaz();
  yaz(d.hukum === 'KARIŞIK' ? '  1  Yamayı yeniden kur (eksik kalanlar tamamlanır)'
    : kurulacak ? '  1  Yamayı kur' : '  1  Yamayı kaldır (oyun özgün hâline döner)');
  yaz('  0  Çık');
  for (;;) {
    const c = await sor('Seçiminiz (1 ya da 0): ');
    if (c === null || c === '0') return 0;
    if (c === '1') break;
  }
  await oyunKapanana();
  fs.mkdirSync(VERI, { recursive: true });
  if (kurulacak) {
    await kur(oyun, yedek, m, varlik);
    yaz();
    yaz('Yama kuruldu. Oyunu açın; ana menüde dil seçeneğinden Türk bayrağını seçin (Steam\'in dili Türkçeyse oyun kendiliğinden Türkçe açılabilir).');
    yaz('Oyunun bir güncellemesi ya da Steam\'in dosya doğrulaması yamayı kaldırabilir: o zaman bu programı yeniden çalıştırın.');
  } else {
    try { kaldir(oyun, yedek, m); } catch (e) { if (e instanceof Durdu) yaz(STEAM_DOGRULA); throw e; }
    yaz();
    yaz('Yama kaldırıldı: oyun özgün hâline döndü.');
  }
  return 0;
}

// exe'ye çevrilen biçimde (CJS) dosya düzeyinde await yok
(async () => {
  let kod;
  try {
    kod = await ana();
  } catch (e) {
    kod = 1;
    if (e instanceof Vazgec) { yaz('Vazgeçildi; oyunun dosyaları değişmedi.'); kod = 0; } else {
      const yazilamadi = ['EPERM', 'EACCES'].includes(e.code), mesgul = e.code === 'EBUSY';
      const bilinen = (e instanceof Sorun || e instanceof UretimSorunu || e instanceof Durdu) ? e.message
        : yazilamadi ? 'Oyunun klasörüne yazma izni yok. Programa sağ tıklayıp "Yönetici olarak çalıştır" ile yeniden deneyin.'
          : mesgul ? 'Dosya kullanımda (oyun ya da başka bir program açık olabilir). Kapatıp yeniden deneyin.' : null;
      yaz();
      yaz(`Sorun: ${bilinen ?? `beklenmeyen bir hata (${e.message}).`}`);
      // Durdu: çekirdek oyun klasörüne yazmadan durdu. Yazmaya başlanmışsa ve başka bir hata geldiyse dosyalar yarım olabilir.
      if (!yazmayaBasladi || e instanceof Durdu) yaz('Oyunun dosyaları değişmedi.');
      else yaz(`Yama yazılırken sorun çıktı; oyunun dosyaları yarım kalmış olabilir.\n${STEAM_DOGRULA}`);
      gunluk(`HATA: ${e.stack}`);
    }
  }
  try {
    fs.mkdirSync(VERI, { recursive: true });
    fs.appendFileSync(path.join(VERI, 'kurulum.log'), gunlukSatirlari.join('\n') + '\n');
    if (kod) yaz(`Ayrıntılar: ${path.join(VERI, 'kurulum.log')}`);
  } catch { /* günlük yazılamadı: işin sonucu değişmez */ }
  if (process.stdin.isTTY) await sor('\nKapatmak için Enter\'a basın.');
  rl.close();
  process.exit(kod);
})();
