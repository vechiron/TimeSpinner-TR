// Kurulum programının üretim hattı: oyunun ORİJİNAL dosyalarından yamalı çıktı dosyalarını üretir.
// Saf modül: içe aktarılınca hiçbir şey yapmaz (komut satırı yok) ve oyun klasörüne hiçbir şey yazmaz; yalnız verilen
// geçici klasöre yazar. Hem oyuncunun programı (kurucu.mjs, exe'ye paketlenir) hem derleme aracı (kurucu-varlik.mjs,
// manifest.json'daki beklenen özetleri üretir) bu AYNI işlevi çağırır: iki yerde ayrı üretim kodu tutulmaz.
//
// Girdi (oyunun orijinali):  GIRDI_DOSYALARI
// Çıktı (yamalı):            CIKTI_DOSYALARI  (exe · LocFlags · LocToastLatin · LevelUp · AreaTitles_TR · TextureDatabase.dat · TR.txt)
// (dosya sayısı yazılmaz: listeler koddadır, sayı eskir)
// Yamalı exe: gömülü tr-yamaci.cs, Windows'ta her zaman bulunan csc.exe ile geçici klasörde derlenir (Mono.Cecil gömülü),
// orijinal exe'nin KOPYASI yamalanır; oyunun exe'sine dokunulmaz. Üretim deterministik: aynı girdi, aynı bayt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { icerikUret, ICERIK_DOSYALARI, YENI_DOSYALAR, GIRDI } from './icerik.mjs';
import { trKurulum } from './ceviri.mjs';

export const EXE_REL = 'Timespinner.exe';
export const TR_REL = 'Content/Localization/TR.txt';
const EN_REL = 'Content/Localization/TimespinnerStrings.txt';
const ES_REL = 'Content/Localization/ES.txt';

export const GIRDI_DOSYALARI = [EXE_REL, ...Object.values(GIRDI), EN_REL, ES_REL];
export const CIKTI_DOSYALARI = [EXE_REL, ...ICERIK_DOSYALARI, TR_REL];
export const YENI = [TR_REL, ...YENI_DOSYALAR]; // orijinal oyunda olmayan dosyalar: yedeklenmez, kaldırınca silinir

// Gömülü varlık adları (SEA'da getAsset anahtarı, doğrudan çalıştırmada varlık klasöründeki yol)
export const VARLIK = { manifest: 'manifest.json', yamaci: 'tr-yamaci.cs', cecil: 'Mono.Cecil.dll', cecilRocks: 'Mono.Cecil.Rocks.dll' };
export const ceviriVarligi = (ad) => `ceviri/${ad}`;

// Oyuncuya olduğu gibi gösterilebilen üretim sorunu (kullanıcı dilinde, "oyunun dosyası değişmedi" ile birlikte)
export class UretimSorunu extends Error {}

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function cscBul() {
  const sistem = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  for (const k of ['Framework64', 'Framework']) {
    const f = path.join(sistem, 'Microsoft.NET', k, 'v4.0.30319', 'csc.exe');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// girdiYolu(rel): oyunun ORİJİNAL dosyasının yolu (kurulumda oyun klasörü; derlemede oyun-yolu.mjs orijinal())
// varlik(ad): gömülü varlığın baytları (Buffer) · ceviriAdlari: manifest.ceviri · gecici: yazılabilir, boş klasör
// gunluk(satir): isteğe bağlı günlük · Dönüş: { [göreli yol]: Buffer } (CIKTI_DOSYALARI)
export function uret({ girdiYolu, varlik, ceviriAdlari, gecici, gunluk = () => {} }) {
  const oku = (rel) => fs.readFileSync(girdiYolu(rel));

  // 1. Yamalı exe: yamacıyı derle, orijinal exe'nin kopyasını yamala
  const csc = cscBul();
  if (!csc) throw new UretimSorunu('Windows\'un .NET Framework 4 derleyicisi (csc.exe) bulunamadı; yama bu bilgisayarda hazırlanamıyor.');
  const yamaciKlasoru = path.join(gecici, 'yamaci');
  fs.mkdirSync(yamaciKlasoru, { recursive: true });
  const cs = path.join(yamaciKlasoru, 'tr-yamaci.cs'), yamaci = path.join(yamaciKlasoru, 'TrYamaci.exe');
  fs.writeFileSync(cs, varlik(VARLIK.yamaci));
  fs.writeFileSync(path.join(yamaciKlasoru, 'Mono.Cecil.dll'), varlik(VARLIK.cecil));
  fs.writeFileSync(path.join(yamaciKlasoru, 'Mono.Cecil.Rocks.dll'), varlik(VARLIK.cecilRocks));
  try {
    // /codepage:65001: kaynak BOM'suz UTF-8; csc aksi hâlde sistemin kod sayfasıyla okur ve Türkçe dizgeler bozulur
    execFileSync(csc, ['/nologo', '/codepage:65001', '/target:exe', `/out:${yamaci}`, '/r:Mono.Cecil.dll', '/r:Mono.Cecil.Rocks.dll', cs],
      { cwd: yamaciKlasoru, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    gunluk(`csc hatası: ${e.stdout?.toString('latin1') ?? ''}${e.stderr?.toString('latin1') ?? ''}`);
    throw new UretimSorunu('Yama derleyicisi çalışmadı (csc.exe hata verdi); ayrıntılar kurulum.log dosyasında.');
  }
  const cikisExe = path.join(gecici, 'yamali', EXE_REL);
  fs.mkdirSync(path.dirname(cikisExe), { recursive: true });
  try {
    const cikti = execFileSync(yamaci, [girdiYolu(EXE_REL), cikisExe], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    gunluk(`yamacı: ${cikti.toString('latin1').trim().replace(/\r?\n/g, ' | ')}`);
  } catch (e) {
    gunluk(`yamacı hatası (çıkış ${e.status}): ${e.stdout?.toString('latin1') ?? ''}${e.stderr?.toString('latin1') ?? ''}`);
    throw new UretimSorunu('Oyunun programı yamalanamadı (oyunun sürümü bu yamanınkinden farklı olabilir); ayrıntılar kurulum.log dosyasında.');
  }
  const exe = fs.readFileSync(cikisExe);

  // 2. Resimli yazılar: bayrak, bildirim kareleri, bölge başlıkları, TextureDatabase.dat
  const icerik = icerikUret(Object.fromEntries(Object.entries(GIRDI).map(([ad, rel]) => [ad, oku(rel)])));

  // 3. Türkçe metin: TR.txt
  const tr = trKurulum({
    enBuf: oku(EN_REL),
    esBuf: oku(ES_REL),
    dosyalar: ceviriAdlari.map((ad) => ({ ad, icerik: varlik(ceviriVarligi(ad)).toString('utf8') })),
  });

  return { [EXE_REL]: exe, ...icerik, [TR_REL]: tr };
}
