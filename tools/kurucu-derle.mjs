// Kurulum programını (tools/kurucu.mjs) oyuncunun indireceği TEK exe'ye çevirir, sonra exe'yi sahte oyun klasöründe sınar.
//   node tools/kurucu-derle.mjs   ->   ham/derleme/TimespinnerTR-Kurulum.exe (ham/ git dışı)
//   node tools/kurucu-derle.mjs --zincirsiz   yayından indirilmiş depoda: sınamanın senaryo 0'ı atlanır (ham/cikti geliştirme zinciri
//     yok); exe aynı çıkar, yalnız o bir sınama koşmaz. bilgi.json'a `zincirsiz: true` yazılır: yayin-hazirla.mjs böyle derlemeyi reddeder.
// Yol: varlık klasörü (kurucu-varlik.mjs: çeviri, yamacı, Cecil, manifest) → esbuild CJS paketi → SEA blob → derlemeyi koşturan
// node.exe'nin kopyası (imzası kaldırılmış) → resedit (Türk bayraklı simge, Türkçe dosya bilgisi) → postject (blob gömülür) →
// taramalar (makine yolu, CLI sızıntısı) → `kurucu-sina.mjs --exe` (sahte oyun klasöründe 20 senaryodan 17'si).
// Oyunun hiçbir dosyası gömülmez; yamalı dosyalar kurulumda oyuncunun kendi oyunundan üretilir (kurucu-uret.mjs).
// Node'un tek dosya özelliği (SEA) .mjs'i ve birden çok dosyayı koşturmaz: modüller esbuild ile tek dosyaya birleşir.
// Paketleme tuzakları ve ayarların gerekçesi: docs/kurucu-plani.md "Adım 4". Kısaca: üst düzey await yok · import.meta.url
// sahte sabit URL'ye çevrilir (hiçbir modül "ana modül" sayılmaz) · esbuild depo kökünden, göreli girişle koşar (yol sızmasın).
// node.exe imzası gömmeden önce kaldırılır: postject imzayı bozuyor, bozuk imza imzasızdan kötü görünür.
// Exe Node.js ve Mono.Cecil içerir: ikisinin MIT lisansı exe'nin yanına indirilir ve sürümle birlikte dağıtılır.
// Araçlar (esbuild, postject, resedit-cli) sabit sürümle ham/araclar/derleme-araclari'na iner (ilk koşuda ağ ister).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { varlikUret, SURUM } from './kurucu-varlik.mjs';
import { VARLIK_AD } from './baslik-ciz.mjs';
import { VARLIK_AD as SEVIYE_VARLIK_AD } from './seviye.mjs';
import { simgeIco } from './simge.mjs';

const ARACLAR = [['esbuild', '0.28.2'], ['postject', '1.0.0-alpha.6'], ['resedit-cli', '3.1.1']];
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const SAHTE_URL = 'file:///C:/kurucu-gomulu/modul.mjs';
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DERLEME = path.join(KOK, 'ham', 'derleme'), d = (a) => path.join(DERLEME, a);
const ARAC_KLASORU = path.join(KOK, 'ham', 'araclar', 'derleme-araclari');
const rel = (a) => `ham/derleme/${a}`; // araçlara depo kökünden göreli yol verilir (cwd = KOK)
const EXE_ADI = 'TimespinnerTR-Kurulum.exe', EXE = d(EXE_ADI);
const ZINCIRSIZ = process.argv.includes('--zincirsiz');
// exe'nin özelliklerinde görünen bilgi; Türkçe (1055). Verilmeyen alanlar (şirket, telif) Node'unkiyle birlikte silinir.
const DOSYA_BILGISI = { fileDescription: 'Timespinner Türkçe yama kurucusu', productName: 'Timespinner Türkçe Yama', fileVersion: `${SURUM}.0`, productVersion: `${SURUM}.0`, internalName: 'TimespinnerTR-Kurulum' };

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let sorun = 0;
// başarısız denetimde ilgili çıktı bir kez basılır
const denetle = (kosul, ne, ek) => {
  console.log(`  ${kosul ? 'tamam' : 'BAŞARISIZ'}: ${ne}`);
  if (!kosul) { sorun++; if (ek) console.log(String(ek).replace(/^/gm, '    ')); }
  return kosul;
};
const dur = (ne) => { throw new Error(ne); };

// ---------------------------------------------------------------- araçlar
function aracKur() {
  fs.mkdirSync(ARAC_KLASORU, { recursive: true });
  const pj = path.join(ARAC_KLASORU, 'package.json');
  if (!fs.existsSync(pj)) fs.writeFileSync(pj, '{ "name": "derleme-araclari", "private": true }\n');
  const surum = (ad) => { try { return JSON.parse(fs.readFileSync(path.join(ARAC_KLASORU, 'node_modules', ad, 'package.json'), 'utf8')).version; } catch { return null; } };
  const eksik = ARACLAR.filter(([ad, s]) => surum(ad) !== s);
  if (eksik.length) {
    console.log(`  indiriliyor: ${eksik.map(([a, s]) => `${a}@${s}`).join(' ')}`);
    // npm Windows'ta .cmd: kabuk gerekir; argümanlarda özel karakter yok
    const r = spawnSync(`npm install --no-audit --no-fund --save-exact ${eksik.map(([a, s]) => `${a}@${s}`).join(' ')}`, { shell: true, cwd: ARAC_KLASORU, encoding: 'utf8' });
    if (r.status !== 0) dur(`npm install çıkış ${r.status}\n${r.stdout}${r.stderr}`);
  }
  for (const [ad, s] of ARACLAR) if (surum(ad) !== s) dur(`${ad}@${s} kurulamadı (kurulu: ${surum(ad)})`);
}
// paketin package.json'undaki bin girdisinin tam yolu (npx/.cmd kabuğuna gerek kalmasın: node ile koşulur)
function binYol(ad) {
  const p = JSON.parse(fs.readFileSync(path.join(ARAC_KLASORU, 'node_modules', ad, 'package.json'), 'utf8'));
  const b = typeof p.bin === 'string' ? p.bin : Object.values(p.bin)[0];
  return path.join(ARAC_KLASORU, 'node_modules', ad, b);
}
function aracKos(ad, argumanlar) {
  const r = spawnSync(process.execPath, [binYol(ad), ...argumanlar], { cwd: KOK, encoding: 'utf8' });
  const cikti = ((r.stdout ?? '') + (r.stderr ?? '')).trim();
  if (cikti) console.log(cikti.replace(/^/gm, '    '));
  if (r.status !== 0) dur(`${ad} çıkış ${r.status}`);
  return cikti;
}

// ---------------------------------------------------------------- PE (node.exe)
// PE32+: sertifika tablosu veri dizininin 5. girdisi; sağlama toplamı isteğe bağlı başlığın 64. baytında
function peBaslik(b) {
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0' || b.readUInt16LE(pe + 24) !== 0x20b) dur('node.exe 64 bit PE değil');
  return { guvenlik: pe + 24 + 112 + 4 * 8, saglamaAlani: pe + 24 + 64 };
}
// Windows'un PE sağlama toplamı (alanın kendisi hariç 16 bitlik toplam + dosya boyu)
function peSaglama(b, alan) {
  let t = 0;
  for (let i = 0; i < b.length; i += 2) {
    if (i === alan || i === alan + 2) continue;
    t += i + 1 < b.length ? b.readUInt16LE(i) : b[i];
    t = (t & 0xffff) + (t >>> 16);
  }
  return ((t & 0xffff) + (t >>> 16) + b.length) >>> 0;
}

const say = (tampon, aranan) => { // tamponda `aranan` (Buffer) kaç kez geçiyor
  let n = 0, i = -1;
  while ((i = tampon.indexOf(aranan, i + 1)) >= 0) n++;
  return n;
};
const utf16 = (s) => Buffer.from(s, 'utf16le');
const dosyalar = (klasor) => fs.readdirSync(klasor, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
  .map((e) => path.join(e.parentPath ?? e.path, e.name)).sort();

async function lisansIndir(adres, baslangic, hedef) {
  const metin = await fetch(adres).then((y) => (y.ok ? y.text() : null), () => null);
  fs.rmSync(d(hedef), { force: true });
  if (metin?.startsWith(baslangic)) fs.writeFileSync(d(hedef), metin);
  denetle(fs.existsSync(d(hedef)), `${adres} indirildi → ${hedef}`);
}

// ---------------------------------------------------------------- derleme
async function ana() {
  if (process.platform !== 'win32') dur('Derleme yalnız Windows\'ta koşar (csc.exe, kayıt defteri, Windows exe)');
  fs.rmSync(DERLEME, { recursive: true, force: true });
  fs.mkdirSync(DERLEME, { recursive: true });

  console.log('1. Varlık klasörü (çeviri, yamacı, Cecil, manifest)');
  const VARLIK = d('varlik');
  const manifest = varlikUret(VARLIK);
  const varlikDosyalari = dosyalar(VARLIK);
  console.log(`  ${varlikDosyalari.length} dosya · sürüm ${manifest.surum} · Steam yapı ${manifest.steamBuildId ?? 'okunamadı'}`);

  console.log(`2. Derleme araçları (${ARACLAR.map(([a, s]) => `${a}@${s}`).join(' ')})`);
  aracKur();

  console.log('3. Modüller tek CJS dosyaya (esbuild)');
  const esbuild = createRequire(path.join(ARAC_KLASORU, 'x.cjs'))('esbuild');
  // absWorkingDir = depo kökü ve göreli giriş: yoksa paket başlık yorumlarına mutlak yol gömer (kurucu-plani.md Adım 4, madde 4)
  const paket = esbuild.buildSync({
    absWorkingDir: KOK, entryPoints: ['tools/kurucu.mjs'], bundle: true, platform: 'node', format: 'cjs', target: `node${process.versions.node.split('.')[0]}`,
    outfile: rel('kurucu.cjs'), metafile: true, legalComments: 'none', logLevel: 'silent',
    define: { 'import.meta.url': '__metaUrl' }, banner: { js: `const __metaUrl = "${SAHTE_URL}";` },
  });
  denetle(paket.errors.length === 0 && paket.warnings.length === 0, `esbuild: 0 hata, 0 uyarı (${paket.errors.length} hata, ${paket.warnings.length} uyarı)`,
    [...paket.errors, ...paket.warnings].map((m) => `${m.location?.file ?? ''}:${m.location?.line ?? ''} ${m.text}`).join('\n'));
  const girdiler = Object.keys(paket.metafile.inputs).sort();
  denetle(girdiler.every((g) => g.startsWith('tools/') && !g.includes('node_modules')), `paketlenen ${girdiler.length} modülün hepsi tools/ altında, dış paket yok`, girdiler.join('\n'));
  const kurucuCjs = fs.readFileSync(d('kurucu.cjs'));
  console.log(`  ${(kurucuCjs.length / 1024).toFixed(0)} KB: ${girdiler.map((g) => g.replace(/^tools\//, '')).join(' ')}`);

  console.log('4. SEA blob (paket + varlıklar)');
  // Anahtar = programın okuduğu ad: varlık klasöründeki göreli yol; tools/varlik dosyaları VARLIK_AD adıyla (baslik-ciz.mjs varlikOku)
  const assets = {};
  for (const f of varlikDosyalari) assets[path.relative(VARLIK, f).replace(/\\/g, '/')] = path.relative(KOK, f).replace(/\\/g, '/');
  // Yalnız kurulum yolunun okuduğu varlıklar: bölge başlıkları (bizimAtlasOku: PNG + kare tablosu) ve "Seviye Yükseldi"
  // (seviye.mjs levelUpYamala: PNG); adlar.tsv yalnız geliştirmede (ciz, sina) okunur
  for (const ad of [VARLIK_AD.bizimPng, VARLIK_AD.kareJson, SEVIYE_VARLIK_AD.bizimPng]) assets[ad] = `tools/varlik/${ad}`;
  for (const [ad, yol] of Object.entries(assets)) if (!fs.existsSync(path.join(KOK, yol))) dur(`gömülecek varlık yok: ${ad} (${yol})`);
  // main göreli: Node onu yazıldığı gibi blob'a koyuyor; tam yol olsa exe derlendiği klasöre göre değişir ve yolu taşır
  fs.writeFileSync(d('sea-config.json'), JSON.stringify({ main: rel('kurucu.cjs'), output: rel('kurucu.blob'), disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }, null, 2));
  const sea = spawnSync(process.execPath, ['--experimental-sea-config', rel('sea-config.json')], { cwd: KOK, encoding: 'utf8' });
  if (sea.status !== 0) dur(`SEA blob üretilemedi (çıkış ${sea.status})\n${sea.stdout}${sea.stderr}`);
  console.log(`  ${Object.keys(assets).length} varlık · blob ${(fs.statSync(d('kurucu.blob')).size / 1e6).toFixed(1)} MB`);

  console.log(`5. node.exe ${process.version} kopyası, imzası kaldırılmış`);
  const node = fs.readFileSync(process.execPath), { guvenlik, saglamaAlani } = peBaslik(node);
  const sertifika = node.readUInt32LE(guvenlik), sertifikaBoy = node.readUInt32LE(guvenlik + 4);
  if (node.indexOf(`${FUSE}:0`) < 0) dur('node.exe\'de SEA işareti yok (bu Node sürümü SEA desteklemiyor ya da işaretin adı değişti)');
  let kopya = node;
  if (sertifikaBoy) {
    if (sertifika + sertifikaBoy !== node.length) dur('sertifika tablosu dosyanın sonunda değil');
    kopya = Buffer.from(node.subarray(0, sertifika));
    kopya.writeUInt32LE(0, guvenlik);
    kopya.writeUInt32LE(0, guvenlik + 4);
  }
  fs.writeFileSync(EXE, kopya);
  console.log(`  ${sertifikaBoy ? `imza ${sertifikaBoy} bayt kaldırıldı` : 'node.exe zaten imzasız'}`);

  console.log('6. Simge ve dosya bilgisi (resedit)');
  const ico = simgeIco();
  fs.writeFileSync(d('simge.ico'), ico);
  // Türkçe metin kabuktan geçmesin diye tanım dosyasıyla; önce Node'un bütün simgeleri silinir, sonra bizimki yazılır.
  // --allow-shrink: kaynak bölümü dosyada da küçülür; yoksa bölüm bellekte küçülüp dosyada eski boyda kalır ve postject "Relocation corrupted" der.
  fs.writeFileSync(d('kaynak.json'), JSON.stringify({ lang: 1055, icons: [{ id: 1, sourceFile: rel('simge.ico') }], version: { ...DOSYA_BILGISI, originalFileName: EXE_ADI } }, null, 2));
  aracKos('resedit-cli', ['--in', rel(EXE_ADI), '--out', rel('kaynakli.exe'), '--definition', rel('kaynak.json'), '--delete-allicon', '--allow-shrink']);
  fs.renameSync(d('kaynakli.exe'), EXE);

  console.log('7. Blob exe\'ye gömülüyor (postject)');
  const pj = aracKos('postject', [rel(EXE_ADI), 'NODE_SEA_BLOB', rel('kurucu.blob'), '--sentinel-fuse', FUSE]);
  if (/signature/i.test(pj)) dur('postject imza uyarısı verdi');
  if (/error/i.test(pj)) dur('postject hata bildirdi (exe çalışsa bile dosya düzeni bozuk olabilir)');
  const exe = fs.readFileSync(EXE);
  if (exe.indexOf(`${FUSE}:1`) < 0) dur('exe\'de SEA işareti açılmamış');
  exe.writeUInt32LE(peSaglama(exe, saglamaAlani), saglamaAlani); // postject sağlama toplamını güncellemiyor olabilir
  fs.writeFileSync(EXE, exe);

  console.log('8. Taramalar');
  const pngler = []; // .ico'daki PNG'ler (girdilerdeki boy ve konumdan); postject kaynakları yeniden yazdığı için son exe'de aranır
  for (let i = 0; i < ico.readUInt16LE(4); i++) pngler.push(ico.subarray(ico.readUInt32LE(6 + 16 * i + 12), ico.readUInt32LE(6 + 16 * i + 12) + ico.readUInt32LE(6 + 16 * i + 8)));
  denetle(pngler.every((p) => exe.indexOf(p) >= 0), `simgenin ${pngler.length} boyu exe'de`);
  denetle(exe.indexOf(utf16(DOSYA_BILGISI.fileDescription)) >= 0, 'dosya açıklaması exe\'de');
  denetle(exe.indexOf(utf16('Node.js JavaScript Runtime')) < 0, 'Node\'un dosya açıklaması exe\'de kalmamış');
  // Makine yolu: önce kendi içeriğimizde (paket + varlıklar) HİÇ olmamalı; sonra bütün exe'de node.exe'ye göre ARTMAMALI
  // (node.exe'nin kendi derleme yolları olabilir: onları sayarak değil, farkı ölçerek ayırıyoruz)
  const kullanici = os.userInfo().username;
  const yollar = [KOK, KOK.replace(/\\/g, '/'), os.homedir(), os.homedir().replace(/\\/g, '/'), `Users\\${kullanici}`, `Users/${kullanici}`];
  const bizimki = Buffer.concat([kurucuCjs, ...varlikDosyalari.filter((f) => !/\.dll$/i.test(f)).map((f) => fs.readFileSync(f))]);
  for (const y of yollar) {
    const bizde = say(bizimki, Buffer.from(y)), exeDe = say(exe, Buffer.from(y)) + say(exe, utf16(y)), nodeDa = say(node, Buffer.from(y)) + say(node, utf16(y));
    denetle(bizde === 0 && exeDe <= nodeDa, `makine yolu yok: "${y.replace(kullanici, '<kullanıcı>')}" (paket+varlık ${bizde} · exe ${exeDe} · node.exe ${nodeDa})`);
  }
  const suruculer = [...new Set(kurucuCjs.toString('utf8').match(/\b[A-Za-z]:[\\/][^\s"'`)]*/g) ?? [])];
  console.log(`  bilgi: pakette ${suruculer.length} sürücü yolu metni (beklenen: Steam ve Windows varsayılanları): ${suruculer.join(' | ')}`);

  console.log('9. Lisanslar');
  await lisansIndir(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, 'Node.js is licensed for use as follows:', 'Node.js-LICENSE.txt');
  await lisansIndir('https://raw.githubusercontent.com/jbevain/cecil/0.11.6/LICENSE.txt', 'Copyright (c) 2008 - 2015 Jb Evain', 'Mono.Cecil-LICENSE.txt');

  console.log('10. Exe sahte oyun klasöründe sınanıyor (tools/kurucu-sina.mjs --exe)');
  // CLI sızıntısı: yanlış klasör + boş cevapla koşunca modüllerin komut satırı çıktısı ("kullanım:" gibi) olmamalı
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'kurucu-derle-'));
  try {
    const r = spawnSync(EXE, ['--oyun', path.join(gecici, 'yok'), '--veri', path.join(gecici, 'veri')], { input: '\n', encoding: 'utf8', timeout: 60000, windowsHide: true });
    const cikti = (r.stdout ?? '') + (r.stderr ?? '');
    denetle(r.status === 0 && !/kullanım:|usage:|yazıldı:|DURDU:/i.test(cikti), `exe başlıyor, çıkış ${r.status}, hiçbir modülün komut satırı çıktısı yok`, cikti);
  } finally { fs.rmSync(gecici, { recursive: true, force: true }); }
  const sina = spawnSync(process.execPath, [path.join(KOK, 'tools', 'kurucu-sina.mjs'), '--exe', EXE, '--varlik', VARLIK, ...(ZINCIRSIZ ? ['--zincirsiz'] : [])], { cwd: KOK, encoding: 'utf8', timeout: 900000 });
  const sinaCikti = (sina.stdout ?? '') + (sina.stderr ?? '');
  console.log(sinaCikti.replace(/^/gm, '    ').trimEnd()); // kırpılmaz: hüküm satırı bunun içinde
  denetle(sina.status === 0 && /HÜKÜM: GEÇTİ/.test(sinaCikti), `kurucu-sina.mjs --exe: çıkış ${sina.status}, son hüküm GEÇTİ`);

  const son = fs.readFileSync(EXE);
  console.log(`\n${EXE}\n  ${(son.length / 1e6).toFixed(1)} MB · sha256 ${sha(son)} · içinde Node ${process.version}`);
  for (const l of ['Node.js-LICENSE.txt', 'Mono.Cecil-LICENSE.txt']) if (fs.existsSync(d(l))) console.log(`${d(l)} (exe ile birlikte dağıtılır)`);
  // yayin-hazirla.mjs README'ye ve sürüm denetimine buradan yazar; yalnızca bütün denetimler geçince
  const kaynaklar = Object.fromEntries(girdiler.map((g) => [g, sha(fs.readFileSync(path.join(KOK, g)))]));
  if (!sorun) fs.writeFileSync(d('bilgi.json'), JSON.stringify({ surum: SURUM, steamBuildId: manifest.steamBuildId, node: process.version, exe: EXE_ADI, sha256: sha(son), boy: son.length, varlik: path.relative(KOK, VARLIK).replace(/\\/g, '/'), paketlenen: girdiler, kaynaklar, ...(ZINCIRSIZ ? { zincirsiz: true } : {}) }, null, 2) + '\n');
  console.log(sorun ? `BAŞARISIZ: ${sorun} denetim` : 'Derleme ve sınama tamam.');
  process.exitCode = sorun ? 1 : 0;
}

ana().catch((e) => { console.error(`DURDU: ${e.message}`); process.exitCode = 1; });
