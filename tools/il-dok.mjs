// Timespinner.exe'nin kodunu okur (ilspycmd, .NET 8 çalışma ortamıyla; SDK gerekmez).
// Oyunun kodu telifli: bütün dökümler ham/ altına (git dışı). Oyun klasörüne hiçbir şey yazmaz.
//   node tools/il-dok.mjs [ozet] [exe]   dil sisteminin özeti: enum, menü listesi, dosya adı, bayrak kareleri
//   node tools/il-dok.mjs kod [exe]      bütün kodu C# projesi olarak ham/kod[-<ad>]/ altına
//   node tools/il-dok.mjs il [exe]       bütün IL'i ham/il/<ad>.il dosyasına
//   node tools/il-dok.mjs yama-dene      tools/tr-yamaci.cs'yi derler, exe'nin KOPYASINI ham/yamali/ altında
//                                        yamalar ve yamalı kopyanın özetini basar (karşı test: TR görünmeli)
// Paketler nuget.org'dan sabit sürümle iner, katalogdaki SHA512 ile doğrulanır: ham/araclar/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OYUN, orijinal } from './oyun-yolu.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAM = path.join(KOK, 'ham');
const ARAC = path.join(HAM, 'araclar');
const DOTNET = 'C:/Program Files/dotnet/dotnet.exe';
const CSC = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
const TAR = 'C:/Windows/System32/tar.exe'; // Windows'un bsdtar'ı zip açar; Git Bash'inki açmaz
// SHA512: api.nuget.org katalog kaydındaki packageHash (11.11.2026'da okundu)
const PAKET = {
  ilspycmd: { ver: '9.1.0.7988', sha: 'Uq8QWnPLyhif4Qr3TzbUpwl2GHmwKpbJoIS6Q71wtF8cTyLZ6zJ4ZDlQQrlHzOzBvJ8MRQQbzvJzK+ePtBzkgQ==' },
  'mono.cecil': { ver: '0.11.6', sha: 'HFkyJGsjyfMXaQolzj4UFtFo2IWHEGPS9gTPmX7Z6Z1BvM3Q4i1L5uSl6nKdBr2SzFQ2htu9dasBmdtg4JEvtA==' },
};

const dur = (m) => { console.error('DURDU: ' + m); process.exit(1); };

async function paket(id) {
  const { ver, sha } = PAKET[id];
  const klasor = path.join(ARAC, `${id}-${ver}`);
  if (fs.existsSync(path.join(klasor, '.dogrulandi'))) return klasor;
  fs.mkdirSync(ARAC, { recursive: true });
  const url = `https://api.nuget.org/v3-flatcontainer/${id}/${ver}/${id}.${ver}.nupkg`;
  const yanit = await fetch(url);
  if (!yanit.ok) dur(`${url} → ${yanit.status}`);
  const b = Buffer.from(await yanit.arrayBuffer());
  const ozet = crypto.createHash('sha512').update(b).digest('base64');
  if (ozet !== sha) dur(`${id} ${ver} özeti tutmuyor: ${ozet}`);
  const nupkg = path.join(ARAC, `${id}.${ver}.nupkg`);
  fs.writeFileSync(nupkg, b);
  fs.rmSync(klasor, { recursive: true, force: true });
  fs.mkdirSync(klasor);
  execFileSync(TAR, ['-xf', nupkg, '-C', klasor]);
  fs.writeFileSync(path.join(klasor, '.dogrulandi'), ozet + '\n');
  console.log(`(indirildi ve doğrulandı: ${id} ${ver})`);
  return klasor;
}

async function ilspy(args) {
  const dll = path.join(await paket('ilspycmd'), 'tools/net8.0/any/ilspycmd.dll');
  return execFileSync(DOTNET, [dll, '--disable-updatecheck', ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
}

// Dil sisteminin canlı özeti: sayılar belgeye değil buraya.
async function ozet(exe) {
  if (!fs.existsSync(exe)) dur(`${exe} yok`);
  const tur = (t) => ilspy(['-t', t, exe]);
  const satirlar = (s, re) => s.split(/\r?\n/).filter((x) => re.test(x)).map((x) => x.trim());
  console.log(`== Dil sistemi: ${exe}`);

  const en = await tur('Timespinner.Core.Localization.ELanguageLocale');
  console.log('ELanguageLocale  ' + satirlar(en, /^\s*\w+ = -?\d+/).map((x) => x.replace(/,$/, '')).join('  '));

  const lib = await tur('Timespinner.Core.Localization.StringLibrary');
  console.log('dosya adı        ' + satirlar(lib, /TimespinnerStrings" :/).join(' | '));

  const ls = await tur('Timespinner.GameStateManagement.Screens.MainMenu.LocSelectionScreen');
  const liste = [...ls.matchAll(/_availableLocales\.Add\(ELanguageLocale\.(\w+)\)/g)].map((m) => m[1]);
  console.log('menü listesi     ' + liste.join(' → ') + `   (${liste.length} dil, döngü sınırı _availableLocales.Count)`);
  console.log('bayrak karesi    ' + (satirlar(ls, /_flagFrameSource = /).join(' | ') || 'BULUNAMADI'));
  console.log('kayıt            ' + satirlar(ls, /_configSave\.LocaleType = /).join(' | '));

  const toast = await tur('Timespinner.GameStateManagement.Screens.InGame.Toasts.StatMaxUpToast');
  console.log('toast resmi      ' + satirlar(toast, /bool num = currentLocale/).join(' | ') + '   (değilse LocToastLatin, dile göre kare)');

  const gcm = await tur('Timespinner.GameAbstractions.GCM');
  const llc = gcm.slice(gcm.indexOf('void LoadLocalizedContent'), gcm.indexOf('public void LoadEditorContent'));
  console.log('bölge adı resmi  ' + [...llc.matchAll(/"Overlays\/PlayerHUD\/(AreaTitles\w*)"/g)].map((m) => m[1]).join(' '));
  console.log('yazı tipi dalı   ' + [...llc.matchAll(/case ELanguageLocale\.(\w+):\s*ActiveFont = localizedContent\.Load<SpriteFont>\("([^"]+)"/g)].map((m) => `${m[1]}=${m[2]}`).join(' ') + '  diğerleri=_latinFont');

  const ph = await tur('Timespinner.PlatformHelper');
  const gb = ph.indexOf('switch', ph.indexOf('ELanguageLocale GuessLocale')), gl = ph.slice(gb, ph.indexOf('return result;', gb));
  const steam = [...gl.matchAll(/case "(\w+)":|result = ELanguageLocale\.(\w+);/g)].map((m) => m[1] || '→' + m[2] + ' ').join(' ');
  // yamanın switch'ten önceki sınaması: if (dil == "turkish") return ELanguageLocale.TR;
  const gm = ph.slice(ph.indexOf('ELanguageLocale GuessLocale'), gb);
  const once = [...gm.matchAll(/== "(\w+)"\)\s*\{?\s*return ELanguageLocale\.(\w+);/g)].map((m) => `${m[1]} →${m[2]} (switch'ten önce) `).join(' ');
  console.log('Steam dili       ' + once + (steam || 'BULUNAMADI') + ' diğerleri→EN (yalnız HasPickedLocale=false iken)');

  // Bayrak kareleri: Content/TextureDatabase.dat (zlib + XML), LocFlags atlası
  const xml = zlib.inflateSync(fs.readFileSync(orijinal('Content/TextureDatabase.dat'))).toString('utf8');
  const i = xml.indexOf('ContentPath="Overlays/Menu/LocFlags"');
  const atlas = xml.slice(xml.lastIndexOf('<Atlas', i), xml.indexOf('</Atlas>', i));
  console.log('LocFlags atlası  ' + atlas.match(/<Atlas[^>]*>/)[0]);
  let n = 0;
  for (const m of atlas.matchAll(/Count="(\d+)" RowWidth="(\d+)"[^>]*FrameSize="\{X:(\d+) Y:(\d+)\}" StartCoordinates="\{X:(\d+) Y:(\d+)\}"/g)) {
    const c = +m[1];
    console.log(`  kare ${n}${c > 1 ? '-' + (n + c - 1) : ''}`.padEnd(14) + `${m[3]}x${m[4]} başlangıç (${m[5]},${m[6]})${c > 1 ? ` satırda ${m[2]}` : ''}`);
    n += c;
  }
  console.log(`  toplam ${n} kare; GetFrameSource(dizin >= ${n}) boş dikdörtgen döner (çökmez)`);
}

async function main() {
  const [komut = 'ozet', exeArg] = process.argv.slice(2);
  const exe = path.resolve(exeArg || orijinal('Timespinner.exe')); // oyun yamalıysa yedekteki orijinal
  const ad = !exeArg || path.basename(path.dirname(exe)) === 'Timespinner' ? '' : '-' + path.basename(path.dirname(exe));
  if (komut === 'ozet') return ozet(exe);
  if (komut === 'kod') {
    const out = path.join(HAM, 'kod' + ad);
    fs.mkdirSync(out, { recursive: true });
    await ilspy(['-p', '-o', out, exe]);
    return console.log(`yazıldı: ${out}`);
  }
  if (komut === 'il') {
    fs.mkdirSync(path.join(HAM, 'il'), { recursive: true });
    const out = path.join(HAM, 'il', `Timespinner${ad}.il`);
    fs.writeFileSync(out, await ilspy(['-il', exe])); // -il ile -t birlikte çalışmıyor: hep bütün derleme
    return console.log(`yazıldı: ${out}`);
  }
  if (komut === 'yama-dene') {
    const cecil = path.join(await paket('mono.cecil'), 'lib/net40');
    const bin = path.join(HAM, 'yamaci');
    fs.mkdirSync(bin, { recursive: true });
    for (const f of ['Mono.Cecil.dll', 'Mono.Cecil.Rocks.dll']) fs.copyFileSync(path.join(cecil, f), path.join(bin, f));
    const yamaci = path.join(bin, 'TrYamaci.exe');
    // /codepage:65001: kaynak BOM'suz UTF-8; csc aksi hâlde ANSI okur ve Türkçe dizgeler bozulur
    execFileSync(CSC, ['/nologo', '/codepage:65001', '/target:exe', `/out:${yamaci}`, `/r:${path.join(bin, 'Mono.Cecil.dll')}`,
      `/r:${path.join(bin, 'Mono.Cecil.Rocks.dll')}`, path.join(KOK, 'tools/tr-yamaci.cs')], { stdio: 'inherit' });
    const hedef = path.join(HAM, 'yamali', 'Timespinner.exe');
    fs.mkdirSync(path.dirname(hedef), { recursive: true });
    fs.rmSync(hedef, { force: true });
    try {
      process.stdout.write(execFileSync(yamaci, [orijinal('Timespinner.exe'), hedef], { encoding: 'utf8' }));
    } catch (e) { process.stdout.write(e.stdout || ''); process.stderr.write(e.stderr || ''); dur(`yamacı çıkış ${e.status}`); }
    return ozet(hedef);
  }
  dur(`bilinmeyen komut: ${komut}`);
}
await main();
