// Kurulum programının varlık klasörünü ve manifest.json'ını üretir. Geliştirme aracı: exe'ye paketlenmez.
//
//   node tools/kurucu-varlik.mjs uret <klasör>      varlıkları <klasör>e koyar ve manifest.json'ı yazar (klasör yok ya da boş olmalı)
//   node tools/kurucu-varlik.mjs dogrula <klasör>   manifest'teki beklenen çıktı özetlerini, geliştirme zincirinin ürettiği
//                                                   dosyalarla (ham/yamali · ham/icerik · ham/cikti) karşılaştırır; son satır HÜKÜM
// Klasör düzeni (kurucu.mjs `--varlik` ya da SEA'da getAsset anahtarları AYNI adlar):
//   manifest.json · tr-yamaci.cs · Mono.Cecil.dll · Mono.Cecil.Rocks.dll · ceviri/<parti>.txt
//   (tools/varlik/ dosyaları buraya girmez: baslik-ciz.mjs varlikOku kendi mekanizmasıyla okur)
// manifest.json: { surum, steamBuildId, ceviri: [<dosya adları>], girdi: { <rel>: sha256 }, cikti: { <rel>: sha256 } }
//   girdi = oyunun orijinal dosyaları (kurulumda bunlar tutmazsa "tanınmadı, dokunulmadı"),
//   cikti = üretilmesi beklenen yamalı dosyalar (tutmazsa HİÇBİR ŞEY yazılmaz). Tarih yazılmaz: aynı girdi, aynı manifest.
// Orijinaller oyun-yolu.mjs orijinal()'den: oyun yamalıyken yedekten okunur.
// Dışa açılanlar: SURUM · varlikUret · dogrula
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OYUN, orijinal } from './oyun-yolu.mjs';
import { uret, sha256, GIRDI_DOSYALARI, CIKTI_DOSYALARI, VARLIK, ceviriVarligi } from './kurucu-uret.mjs';

const BU = fileURLToPath(import.meta.url);
const KOK = path.resolve(path.dirname(BU), '..');
const CECIL = path.join(KOK, 'ham', 'araclar', 'mono.cecil-0.11.6'); // il-dok.mjs indirir ve SHA512 ile doğrular
const CEVIRI = path.join(KOK, 'ceviri');

// Yamanın sürümü için tek kaynak: manifest.json'a yazılır; kurucu başlıkta, derleme exe'nin dosya bilgisinde bundan okur.
export const SURUM = '1.0.0';

const dur = (m) => { throw new Error(m); };

function steamYapi() {
  try {
    const f = path.join(path.dirname(path.dirname(OYUN)), 'appmanifest_368620.acf'); // …/steamapps/common/Timespinner → …/steamapps/
    return /"buildid"\s+"(\d+)"/.exec(fs.readFileSync(f, 'utf8'))?.[1] ?? null;
  } catch { return null; }
}

export function varlikUret(klasor, { gunluk = () => {} } = {}) {
  if (fs.existsSync(klasor) && fs.readdirSync(klasor).length) dur(`${klasor} boş değil: varlık klasörü sıfırdan yazılır (eski dosya kalmasın), önce sil`);
  if (!fs.existsSync(path.join(CECIL, '.dogrulandi'))) dur('Mono.Cecil indirilmemiş ya da doğrulanmamış: önce `node tools/il-dok.mjs yama-dene` koş');
  const yaz = (ad, veri) => {
    const f = path.join(klasor, ...ad.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, veri);
  };
  // 1. Varlıklar
  yaz(VARLIK.yamaci, fs.readFileSync(path.join(KOK, 'tools', 'tr-yamaci.cs')));
  for (const ad of [VARLIK.cecil, VARLIK.cecilRocks]) yaz(ad, fs.readFileSync(path.join(CECIL, 'lib', 'net40', ad)));
  const ceviri = fs.readdirSync(CEVIRI).filter((f) => f.toLowerCase().endsWith('.txt')).sort();
  if (!ceviri.length) dur('ceviri/ altında .txt yok');
  for (const ad of ceviri) yaz(ceviriVarligi(ad), fs.readFileSync(path.join(CEVIRI, ad)));
  // 2. Manifest: girdi özetleri oyunun orijinalinden; çıktı özetleri kurucunun kullanacağı AYNI üretim işlevinden,
  //    az önce yazılan varlıklarla (kurucu bunları okuyacak)
  const girdi = Object.fromEntries(GIRDI_DOSYALARI.map((rel) => [rel, sha256(fs.readFileSync(orijinal(rel)))]));
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'kurucu-varlik-'));
  let cikti;
  try {
    const uretilen = uret({
      girdiYolu: (rel) => orijinal(rel),
      varlik: (ad) => fs.readFileSync(path.join(klasor, ...ad.split('/'))),
      ceviriAdlari: ceviri, gecici, gunluk,
    });
    cikti = Object.fromEntries(CIKTI_DOSYALARI.map((rel) => [rel, sha256(uretilen[rel])]));
  } finally { fs.rmSync(gecici, { recursive: true, force: true }); }
  const manifest = { surum: SURUM, steamBuildId: steamYapi(), ceviri, girdi, cikti };
  yaz(VARLIK.manifest, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// Geliştirme zincirinin (il-dok yama-dene · icerik.mjs · ceviri.mjs birlestir) ürettiği dosyalar: bağımsız ikinci yol
const ZINCIR = (rel) => path.join(KOK, 'ham', rel === 'Timespinner.exe' ? 'yamali/Timespinner.exe' : rel.endsWith('TR.txt') ? 'cikti/' + rel : 'icerik/' + rel);

export function dogrula(klasor) {
  const m = JSON.parse(fs.readFileSync(path.join(klasor, VARLIK.manifest), 'utf8'));
  const satirlar = [];
  let fark = 0;
  for (const rel of CIKTI_DOSYALARI) {
    const f = ZINCIR(rel), var_ = fs.existsSync(f), s = var_ ? sha256(fs.readFileSync(f)) : null;
    const ayni = s === m.cikti[rel];
    if (!ayni) fark++;
    satirlar.push(`  ${ayni ? 'eşit ' : 'FARKLI'}  ${rel}  manifest ${m.cikti[rel].slice(0, 12)} · zincir ${s ? s.slice(0, 12) : 'dosya yok'}`);
  }
  return { satirlar, fark };
}

// ---------------------------------------------------------------- komut satırı (yalnız doğrudan koşulunca)
if (process.argv[1] && path.resolve(process.argv[1]) === BU) {
  const [komut, klasor] = process.argv.slice(2);
  try {
    if (!['uret', 'dogrula'].includes(komut) || !klasor) dur('kullanım: node tools/kurucu-varlik.mjs uret|dogrula <klasör>');
    const k = path.resolve(klasor);
    if (komut === 'uret') {
      const m = varlikUret(k);
      console.log(`yazıldı: ${k}  (sürüm ${m.surum} · Steam yapı ${m.steamBuildId ?? 'okunamadı'} · ${m.ceviri.length} çeviri dosyası)`);
      for (const rel of CIKTI_DOSYALARI) console.log(`  ${m.cikti[rel].slice(0, 12)}  ${rel}`);
    } else {
      const { satirlar, fark } = dogrula(k);
      console.log(satirlar.join('\n'));
      console.log(`HÜKÜM: ${fark ? 'KALDI' : 'GEÇTİ'} (${fark} dosya farklı)`);
      process.exitCode = fark ? 1 : 0;
    }
  } catch (e) { console.error(`DURDU: ${e.message}`); process.exitCode = 1; }
}
