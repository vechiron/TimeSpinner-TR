// Kurulum programının karşı testi: oyuncunun programı (tools/kurucu.mjs ya da derlenmiş exe) SAHTE oyun klasöründe kurar,
// kaldırır, tanınmayan sürüme dokunmaz, bozuk üretimde hiçbir şey yazmaz. Program çocuk süreç olarak koşar, cevaplar
// stdin'den verilir; her senaryo taze bir sahte klasörde başlar. Telifli dosyalar yalnız geçici klasörde durur (depoya girmez).
//
//   node tools/kurucu-sina.mjs                       geliştirme: node tools/kurucu.mjs'i sınar, varlık klasörünü kendi üretir
//   node tools/kurucu-sina.mjs --exe <kurucu.exe>    derlenmiş programı sınar (adım 6; varlık gömülü: 8-10 atlanır)
//   --varlik <klasör>   hazır varlık klasörü (kurucu-varlik.mjs uret); yoksa geçici klasöre üretilir. exe için derlemede
//                       gömülen klasörle AYNI olmalı (manifest buradan okunur)
//   --senaryo 1,5,12    yalnız bunlar · --tut  geçici klasörleri silme (arıza arama)
//   --zincirsiz         senaryo 0'ı ATLAR (ham/cikti geliştirme zinciri yok: yayından klasöre indirilmiş depo). Atlama çıktıda yazar;
//                       manifest'in zincirle eşitliği o koşuda ÖLÇÜLMEZ.
// Son satır HÜKÜM: GEÇTİ ya da KALDI (n); çıkış 0/1.
//
// Senaryolar (kurucu-plani.md "Adım 5 ilerleme"): 0 manifest zincirle aynı · 1 kur · 2 yamalıyken menü · 3 kaldır · 4 kur-kaldır-kur ·
//   KARŞI (çıkış 1, oyun klasörünün BÜTÜN dosya özetleri aynı, yedek yok): 5 exe bozuk · 6 ES.txt bozuk · 7 yamalıyken exe değişti ·
//   8 çeviri satırı silik · 9 manifest'te TR.txt özeti yanlış · 10 yamacı derlenmez · 11 oyun açık + vazgeç · 12 oyun açık, kapanınca
//   devam · 13 yamalı + oyun açık + vazgeç · 14 KARIŞIK yeniden kurulur · 15 KARIŞIK ama yedek yok/yanlış · 16 yamalı ama yedek yok ·
//   17 yanlış klasör + boş cevap · 18 yanlış klasör + tırnaklı doğru yol · 19 geçersiz cevaplar, cevap yok.
// Göremez: gerçek SEA exe'de varlığın gömülü okunmasını (--exe ile exe'ye bakılır ama varlık yine ondan ayrı üretilir) · oyunun
//   açılıp dili gösterdiğini · gerçek tasklist denetimini (sahte-oyun-acik kancası kullanılır) · yönetici izni gerektiren klasörü ·
//   başka makinede aynı üretimi · sahte klasörde oyunun .dll dosyalarının olmadığını (yalnız 8 girdi + 2 yabancı dosya konur).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OYUN, orijinal } from './oyun-yolu.mjs';
import { sha256, cscBul, GIRDI_DOSYALARI, CIKTI_DOSYALARI, EXE_REL, TR_REL, VARLIK, ceviriVarligi } from './kurucu-uret.mjs';
import { varlikUret, dogrula } from './kurucu-varlik.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.slice(2);
const secenek = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null; };
const EXE = secenek('--exe') ? path.resolve(secenek('--exe')) : null;
const SECILEN = secenek('--senaryo') ? new Set(secenek('--senaryo').split(',').map(Number)) : null;
const TUT = arg.includes('--tut');
const ZINCIRSIZ = arg.includes('--zincirsiz');
const ZAMAN_ASIMI = 300000;

const ozetOku = (f) => (fs.existsSync(f) ? sha256(fs.readFileSync(f)) : null);

// Bir klasörün bütün dosyalarının özet resmi (göreli yol → sha256): "hiçbir şeye dokunulmadı" bununla ölçülür
function resim(kok) {
  const r = new Map();
  const gez = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) gez(f); else r.set(path.relative(kok, f).replace(/\\/g, '/'), sha256(fs.readFileSync(f)));
    }
  };
  if (fs.existsSync(kok)) gez(kok);
  return r;
}
function resimFarki(a, b) {
  const f = [];
  for (const [k, v] of a) { if (!b.has(k)) f.push(`- ${k}`); else if (b.get(k) !== v) f.push(`~ ${k}`); }
  for (const k of b.keys()) if (!a.has(k)) f.push(`+ ${k}`);
  return f;
}
const boz = (f) => { const b = fs.readFileSync(f); b[b.length >> 1] ^= 0xff; fs.writeFileSync(f, b); }; // tek bayt

// ---------------------------------------------------------------- programı koşturma
// adimlar: cevap satırları. Dizge hemen yazılır (program satırları kuyruğa alır); {bekle, once, gonder}: çıktıda `bekle`
// görülünce önce `once()` koşar, sonra `gonder` yazılır (oyun kapanana dek bekleme senaryosu).
function kosPrograma(oyun, veri, adimlar, { ek = [], varlik = null } = {}) {
  return new Promise((coz) => {
    const [komut, ...bas] = EXE ? [EXE] : [process.execPath, path.join(KOK, 'tools', 'kurucu.mjs'), '--varlik', varlik];
    const t0 = Date.now();
    const ca = spawn(komut, [...bas, '--oyun', oyun, '--veri', veri, ...ek], { cwd: KOK, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let cikti = '', sira = 0, okunan = 0, zamanAsimi = false;
    const zaman = setTimeout(() => { zamanAsimi = true; ca.kill(); }, ZAMAN_ASIMI);
    ca.stdin.on('error', () => { /* program kapandı: yazılamayan cevap önemsiz */ });
    const ilerle = () => {
      while (sira < adimlar.length) {
        const a = typeof adimlar[sira] === 'string' ? { gonder: adimlar[sira] } : adimlar[sira];
        if (a.bekle) {
          const i = cikti.indexOf(a.bekle, okunan);
          if (i < 0) return;
          okunan = i + a.bekle.length;
          a.once?.();
        }
        ca.stdin.write(a.gonder + '\n');
        sira++;
      }
      ca.stdin.end(); // cevaplar bitti: program başka satır beklerse "cevap yok" alır
    };
    ca.stdout.setEncoding('utf8'); ca.stderr.setEncoding('utf8');
    const al = (d) => { cikti += d; ilerle(); };
    ca.stdout.on('data', al); ca.stderr.on('data', al);
    ca.on('error', (e) => { clearTimeout(zaman); coz({ kod: null, cikti: cikti + `\n[başlatılamadı: ${e.message}]`, sure: 0 }); });
    ca.on('close', (kod) => {
      clearTimeout(zaman);
      coz({ kod: zamanAsimi ? null : kod, cikti: cikti + (zamanAsimi ? '\n[ZAMAN AŞIMI]' : ''), sure: (Date.now() - t0) / 1000 });
    });
    ilerle();
  });
}

// ---------------------------------------------------------------- kurulum
async function ana() {
  if (process.platform !== 'win32') { console.log('Bu sınama yalnız Windows\'ta koşar (csc.exe, kayıt defteri).'); console.log('HÜKÜM: KALDI (Windows değil)'); process.exitCode = 1; return; }
  if (EXE && !fs.existsSync(EXE)) { console.log(`HÜKÜM: KALDI (exe yok: ${EXE})`); process.exitCode = 1; return; }
  if (!cscBul()) { console.log('HÜKÜM: KALDI (csc.exe yok)'); process.exitCode = 1; return; }
  const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kurucu-sina-'));
  const gercekCikti = () => Object.fromEntries(CIKTI_DOSYALARI.map((rel) => [rel, ozetOku(path.join(OYUN, rel))]));
  const gercekOnce = gercekCikti();
  try {
    // Varlık klasörü ve manifest
    const VK = secenek('--varlik') ? path.resolve(secenek('--varlik')) : path.join(GECICI, 'varlik');
    if (!secenek('--varlik')) varlikUret(VK);
    const M = JSON.parse(fs.readFileSync(path.join(VK, VARLIK.manifest), 'utf8'));

    // Sahte oyun klasörü şablonu: oyunun ORİJİNAL 8 girdisi (gerçek oyun yamalıysa yedekten) + 2 yabancı dosya (dokunulmamalı)
    const TEMEL = path.join(GECICI, 'temel');
    for (const rel of GIRDI_DOSYALARI) {
      const f = path.join(TEMEL, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.copyFileSync(orijinal(rel), f);
      if (ozetOku(f) !== M.girdi[rel]) throw new Error(`şablon geçersiz: ${rel} özeti manifest'in girdisiyle aynı değil (manifest bu oyun için üretilmemiş)`);
    }
    fs.writeFileSync(path.join(TEMEL, 'FNA.dll'), 'yabancı dosya 1 (dokunulmamalı)');
    fs.writeFileSync(path.join(TEMEL, 'Content', 'ornek.txt'), 'yabancı dosya 2 (dokunulmamalı)');
    const TEMEL_RESIM = resim(TEMEL);

    const yol = (ad) => { const kok = path.join(GECICI, ad); return { kok, oyun: path.join(kok, 'oyun'), veri: path.join(kok, 'veri'), yedek: path.join(kok, 'veri', 'yedek'), bayrak: path.join(kok, 'oyun-acik.bayrak') }; };
    const temizOrtam = (ad) => { const o = yol(ad); fs.cpSync(TEMEL, o.oyun, { recursive: true }); return o; };
    const yamaliFarklar = (oyun) => CIKTI_DOSYALARI.filter((rel) => ozetOku(path.join(oyun, rel)) !== M.cikti[rel]);
    const ONBELLEK = path.join(GECICI, 'kurulu-onbellek');

    // Senaryo bağlamı: kontrol toplar, programın son çıktısını arıza dökümü için tutar
    const baglam = () => {
      const s = { hatalar: [], sonCikti: '' };
      s.kontrol = (kosul, mesaj) => { if (!kosul) s.hatalar.push(mesaj); };
      s.kos = async (o, adimlar, secenekler = {}) => {
        const r = await kosPrograma(o.oyun, o.veri, adimlar, { varlik: VK, ...secenekler });
        s.sonCikti = r.cikti;
        return r;
      };
      s.cikis = (r, beklenen) => s.kontrol(r.kod === beklenen, `çıkış ${beklenen} olmalıydı, ${r.kod}`);
      s.var = (r, metin) => s.kontrol(r.cikti.includes(metin), `çıktıda "${metin}" olmalıydı`);
      s.yok = (r, metin) => s.kontrol(!r.cikti.includes(metin), `çıktıda "${metin}" OLMAMALIYDI`);
      s.ayni = (o, once, ne = 'oyun klasörü') => { const f = resimFarki(once, resim(o.oyun)); s.kontrol(!f.length, `${ne} değişmemeliydi: ${f.join(' · ')}`); };
      s.yedekYok = (o) => s.kontrol(!fs.existsSync(o.yedek), 'yedek klasörü oluşmamalıydı');
      s.yamali = (o) => { const f = yamaliFarklar(o.oyun); s.kontrol(!f.length, `manifest'ten farklı ya da eksik çıktı: ${f.join(', ')}`); };
      s.ozgun = (o) => { const f = resimFarki(TEMEL_RESIM, resim(o.oyun)); s.kontrol(!f.length, `oyun özgün hâle dönmeliydi: ${f.join(' · ')}`); };
      // Yamalı hâle getirilmiş taze kopya: ilk kez gerçek "kur" ile üretilir (önbellek), sonra kopyalanır
      s.kurulu = async (ad) => {
        if (!fs.existsSync(ONBELLEK)) {
          const t = temizOrtam('onbellek-uretim');
          const r = await s.kos(t, ['1']);
          if (r.kod !== 0 || yamaliFarklar(t.oyun).length) throw new Error('önkoşul: yamalı durum üretilemedi (senaryo 1 ile aynı sorun)');
          fs.cpSync(t.kok, ONBELLEK, { recursive: true });
        }
        const o = yol(ad);
        fs.cpSync(ONBELLEK, o.kok, { recursive: true });
        return o;
      };
      // Çıktı dosyalarından bazılarını özgün hâle geri koyar (Steam'in dosya doğrulaması gibi)
      s.geriKoy = (o, rels) => { for (const rel of rels) fs.copyFileSync(path.join(TEMEL, rel), path.join(o.oyun, rel)); };
      s.varlikKopya = (ad) => { const k = path.join(GECICI, ad); fs.cpSync(VK, k, { recursive: true }); return k; };
      s.onbellekAyarla = (o) => { if (!fs.existsSync(ONBELLEK)) fs.cpSync(o.kok, ONBELLEK, { recursive: true }); };
      return s;
    };

    // yamanın değiştirdiği, orijinali olan altı dosya (AreaTitles_TR ve TR.txt yeni: orijinali yok)
    const ALTI = [EXE_REL, 'Content/Overlays/Menu/LocFlags.xnb', 'Content/Overlays/PlayerHUD/LocToastLatin.xnb', 'Content/Overlays/PlayerHUD/LevelUp.xnb', 'Content/Overlays/Menu/PauseMenu.xnb', 'Content/TextureDatabase.dat'];

    // ------------------------------------------------------------ senaryolar
    const SENARYOLAR = [];
    const sen = (no, ad, f, { varlik = false } = {}) => SENARYOLAR.push({ no, ad, f, varlik });

    sen(0, 'manifest, geliştirme zincirinin (ham/) ürettiği çıktı dosyalarıyla aynı', async (s) => {
      const { satirlar, fark } = dogrula(VK);
      s.kontrol(!fark, `${fark} dosya farklı:\n${satirlar.join('\n')}`);
    });

    sen(1, 'kur: çıktı dosyaları manifest\'le aynı, yedek ve günlük var, başka dosyaya dokunulmadı', async (s) => {
      const o = temizOrtam('s1'), once = resim(o.oyun);
      const r = await s.kos(o, ['1']);
      s.cikis(r, 0); s.var(r, 'Yama kuruldu'); s.yok(r, 'Sorun:');
      s.yamali(o);
      const degisen = resimFarki(once, resim(o.oyun)).map((x) => x.slice(2)).sort();
      s.kontrol(JSON.stringify(degisen) === JSON.stringify([...CIKTI_DOSYALARI].sort()), `değişen dosyalar tam olarak çıktı dosyaları (${CIKTI_DOSYALARI.length}) olmalıydı: ${degisen.join(', ')}`);
      const kayit = fs.existsSync(path.join(o.yedek, 'yedek.json')) ? JSON.parse(fs.readFileSync(path.join(o.yedek, 'yedek.json'), 'utf8')) : null;
      s.kontrol(!!kayit, 'yedek.json yazılmalıydı');
      for (const rel of CIKTI_DOSYALARI) {
        if (Object.hasOwn(M.girdi, rel)) s.kontrol(ozetOku(path.join(o.yedek, rel)) === M.girdi[rel], `yedek ${rel} özgün dosyayla aynı olmalıydı`);
        else s.kontrol(!fs.existsSync(path.join(o.yedek, rel)), `yeni dosya ${rel} yedeklenmemeliydi`);
        s.kontrol(kayit?.dosyalar?.[rel]?.kurulan === M.cikti[rel], `yedek kaydı ${rel} kurulan özeti manifest'le aynı olmalıydı`);
      }
      const gunluk = fs.existsSync(path.join(o.veri, 'kurulum.log')) ? fs.readFileSync(path.join(o.veri, 'kurulum.log'), 'utf8') : '';
      s.kontrol(gunluk.includes('durum: ORİJİNAL') && gunluk.includes('kuruldu: yamalı'), 'kurulum.log durumu ve sonucu yazmalıydı');
      if (!s.hatalar.length) s.onbellekAyarla(o);
    });

    sen(2, 'yamalıyken menü "kaldır" der; cevap 0 hiçbir şeyi değiştirmez', async (s) => {
      const o = await s.kurulu('s2'), once = resim(o.oyun);
      const r = await s.kos(o, ['0']);
      s.cikis(r, 0); s.var(r, 'Türkçe yama kurulu'); s.var(r, 'Yamayı kaldır');
      s.ayni(o, once);
    });

    sen(3, 'kaldır: oyunun bütün dosyaları özgün hâle döner, yedek silinir', async (s) => {
      const o = await s.kurulu('s3');
      const r = await s.kos(o, ['1']);
      s.cikis(r, 0); s.var(r, 'Yama kaldırıldı');
      s.ozgun(o); s.yedekYok(o);
    });

    sen(4, 'kur → kaldır → kur: ikinci kurulum birincisiyle bayt bayt aynı', async (s) => {
      const o = temizOrtam('s4');
      let r = await s.kos(o, ['1']); s.cikis(r, 0); s.yamali(o);
      const birinci = resim(o.oyun);
      r = await s.kos(o, ['1']); s.cikis(r, 0); s.ozgun(o);
      r = await s.kos(o, ['1']); s.cikis(r, 0); s.yamali(o);
      s.ayni(o, birinci, 'ikinci kurulum birinciyle aynı olmalıydı');
    });

    // KARŞI senaryolar: oyun klasörü bozuk ya da üretim bozuk; program HİÇBİR ŞEY yazmamalı
    sen(5, 'oyunun exe\'si 1 bayt bozuk: "tanınmadı", hiçbir şeye dokunulmaz', async (s) => {
      const o = temizOrtam('s5'); boz(path.join(o.oyun, EXE_REL));
      const once = resim(o.oyun), r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'tanınmadı'); s.var(r, EXE_REL); s.var(r, 'dokunulmadı'); s.var(r, 'Ayrıntılar:');
      s.ayni(o, once); s.yedekYok(o);
    });

    sen(6, 'ES.txt (yamanın değiştirmediği girdi) 1 bayt bozuk: "tanınmadı"', async (s) => {
      const o = temizOrtam('s6'); boz(path.join(o.oyun, 'Content/Localization/ES.txt'));
      const once = resim(o.oyun), r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'tanınmadı'); s.var(r, 'ES.txt');
      s.ayni(o, once); s.yedekYok(o);
    });

    sen(7, 'yamalıyken exe başka bir şeye dönüşmüş: "tanınmadı", dokunulmaz', async (s) => {
      const o = await s.kurulu('s7'); boz(path.join(o.oyun, EXE_REL));
      const once = resim(o.oyun), r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'tanınmadı'); s.var(r, 'dokunulmadı');
      s.ayni(o, once);
    });

    sen(8, 'varlıkta bir çeviri satırı silik (manifest aynı): "beklenen sonucu vermedi", hiçbir şey yazılmaz', async (s) => {
      const vk = s.varlikKopya('varlik-s8'), f = path.join(vk, ...ceviriVarligi('01-arayuz.txt').split('/'));
      const satirlar = fs.readFileSync(f, 'utf8').split('\n');
      const i = satirlar.findIndex((x) => /^NewGame = /.test(x));
      s.kontrol(i >= 0, 'sınama hazırlığı: 01-arayuz.txt\'de "NewGame = " satırı bulunamadı');
      satirlar.splice(i, 1); fs.writeFileSync(f, satirlar.join('\n'));
      const o = temizOrtam('s8'), once = resim(o.oyun), r = await s.kos(o, ['1'], { varlik: vk });
      s.cikis(r, 1); s.var(r, 'beklenen sonucu vermedi'); s.var(r, 'Oyunun dosyaları değişmedi');
      s.ayni(o, once); s.yedekYok(o);
    }, { varlik: true });

    sen(9, 'manifest\'te TR.txt özeti yanlış: "beklenen sonucu vermedi", hiçbir şey yazılmaz', async (s) => {
      const vk = s.varlikKopya('varlik-s9'), f = path.join(vk, VARLIK.manifest), m = JSON.parse(fs.readFileSync(f, 'utf8'));
      m.cikti[TR_REL] = (m.cikti[TR_REL][0] === '0' ? '1' : '0') + m.cikti[TR_REL].slice(1);
      fs.writeFileSync(f, JSON.stringify(m, null, 2));
      const o = temizOrtam('s9'), once = resim(o.oyun), r = await s.kos(o, ['1'], { varlik: vk });
      s.cikis(r, 1); s.var(r, 'beklenen sonucu vermedi');
      s.ayni(o, once); s.yedekYok(o);
    }, { varlik: true });

    sen(10, 'yamacının kaynağı derlenmez (csc hatası): hiçbir şey yazılmaz, günlükte csc çıktısı var', async (s) => {
      const vk = s.varlikKopya('varlik-s10'), f = path.join(vk, VARLIK.yamaci);
      fs.appendFileSync(f, '\nbu C# degil;\n');
      const o = temizOrtam('s10'), once = resim(o.oyun), r = await s.kos(o, ['1'], { varlik: vk });
      s.cikis(r, 1); s.var(r, 'Yama derleyicisi çalışmadı'); s.var(r, 'Oyunun dosyaları değişmedi');
      const gunluk = fs.existsSync(path.join(o.veri, 'kurulum.log')) ? fs.readFileSync(path.join(o.veri, 'kurulum.log'), 'utf8') : '';
      s.kontrol(gunluk.includes('csc hatası'), 'kurulum.log\'da "csc hatası" olmalıydı');
      s.ayni(o, once); s.yedekYok(o);
    }, { varlik: true });

    sen(11, 'oyun açık, cevap 0: vazgeçilir, oyun klasörü değişmez', async (s) => {
      const o = temizOrtam('s11'); fs.writeFileSync(o.bayrak, '');
      const once = resim(o.oyun), r = await s.kos(o, ['1', '0'], { ek: ['--sahte-oyun-acik', o.bayrak] });
      s.cikis(r, 0); s.var(r, 'Oyun açık'); s.var(r, 'Vazgeçildi');
      s.ayni(o, once); s.yedekYok(o);
    });

    sen(12, 'oyun açık, kapanınca Enter\'la devam eder ve kurar', async (s) => {
      const o = temizOrtam('s12'); fs.writeFileSync(o.bayrak, '');
      const r = await s.kos(o, ['1', { bekle: 'Oyun açık', once: () => fs.rmSync(o.bayrak), gonder: '' }], { ek: ['--sahte-oyun-acik', o.bayrak] });
      s.cikis(r, 0); s.var(r, 'Oyun açık'); s.var(r, 'Yama kuruldu');
      s.yamali(o);
    });

    sen(13, 'yamalı + oyun açık + vazgeç: kaldırılmaz, yamalı kalır', async (s) => {
      const o = await s.kurulu('s13'); fs.writeFileSync(o.bayrak, '');
      const once = resim(o.oyun), r = await s.kos(o, ['1', '0'], { ek: ['--sahte-oyun-acik', o.bayrak] });
      s.cikis(r, 0); s.var(r, 'Yamayı kaldır'); s.var(r, 'Vazgeçildi');
      s.ayni(o, once); s.yamali(o);
    });

    sen(14, 'KARIŞIK (Steam doğrulaması bazı dosyaları geri koymuş): "yeniden kur" tamamlar', async (s) => {
      // a) altı dosyanın altısı da özgün; b) yalnız exe ve TextureDatabase.dat özgün (LocFlags/LocToast/LevelUp/PauseMenu yamalı kalır: girdi yedekten okunur)
      for (const [ad, geri] of [['a', ALTI], ['b', [EXE_REL, 'Content/TextureDatabase.dat']]]) {
        const o = await s.kurulu(`s14${ad}`); s.geriKoy(o, geri);
        const r = await s.kos(o, ['1']);
        s.cikis(r, 0); s.var(r, 'yarım kalmış'); s.var(r, 'Yamayı yeniden kur'); s.var(r, 'Yama kuruldu');
        s.yamali(o);
        s.kontrol(fs.existsSync(path.join(o.yedek, 'yedek.json')), `14${ad}: yedek.json durmalıydı`);
      }
    });

    sen(15, 'KARIŞIK ama yedek yok ya da başka yamaya ait: "tanınmadı", dokunulmaz', async (s) => {
      let o = await s.kurulu('s15a'); s.geriKoy(o, ALTI); fs.rmSync(o.yedek, { recursive: true, force: true });
      let once = resim(o.oyun), r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'tanınmadı'); s.var(r, 'yedek kaydı yok'); s.ayni(o, once);
      o = await s.kurulu('s15b'); s.geriKoy(o, ALTI);
      const kf = path.join(o.yedek, 'yedek.json'), k = JSON.parse(fs.readFileSync(kf, 'utf8'));
      k.dosyalar[EXE_REL].kurulan = '0'.repeat(64); fs.writeFileSync(kf, JSON.stringify(k));
      once = resim(o.oyun); r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'tanınmadı'); s.ayni(o, once);
    });

    sen(16, 'yamalı ama yedek yok: kaldır durur, Steam doğrulamasını önerir, dokunmaz', async (s) => {
      const o = await s.kurulu('s16'); fs.rmSync(o.yedek, { recursive: true, force: true });
      const once = resim(o.oyun), r = await s.kos(o, ['1']);
      s.cikis(r, 1); s.var(r, 'yedek kaydı yok'); s.var(r, 'bütünlüğünü doğrula'); s.var(r, 'Oyunun dosyaları değişmedi');
      s.ayni(o, once);
    });

    sen(17, 'yanlış klasör + boş cevap: çıkış 0, hiçbir şey yazılmaz', async (s) => {
      const bos = path.join(GECICI, 'bos-klasor'); fs.mkdirSync(bos, { recursive: true });
      const o = { oyun: bos, veri: path.join(GECICI, 'veri-s17') };
      const r = await s.kos(o, ['']);
      s.cikis(r, 0); s.var(r, 'Bu klasörde Timespinner yok');
      s.kontrol(fs.readdirSync(bos).length === 0, 'yanlış klasöre bir şey yazılmamalıydı');
    });

    sen(18, 'yanlış klasör + tırnaklı doğru yol ("Yol olarak kopyala"): oyunu bulur, menüyü gösterir', async (s) => {
      const o = temizOrtam('s18'), bos = path.join(GECICI, 'bos-klasor18'); fs.mkdirSync(bos, { recursive: true });
      const once = resim(o.oyun), r = await s.kos({ oyun: bos, veri: o.veri }, [`"${o.oyun}"`, '0']);
      s.cikis(r, 0); s.var(r, 'Bu klasörde Timespinner yok'); s.var(r, `Oyun: ${o.oyun}`); s.var(r, 'Yamayı kur');
      s.ayni(o, once);
    });

    sen(19, 'geçersiz cevaplar menüyü tekrarlar; cevap hiç gelmezse (girdi kapanır) çıkış 0', async (s) => {
      const o = temizOrtam('s19'), once = resim(o.oyun);
      let r = await s.kos(o, ['x', '2', '0']);
      s.cikis(r, 0); s.kontrol(r.cikti.split('Seçiminiz').length - 1 >= 3, 'geçersiz cevaplarda menü yeniden sorulmalıydı');
      r = await s.kos(o, []);
      s.cikis(r, 0);
      s.ayni(o, once); s.yedekYok(o);
    });

    // ------------------------------------------------------------ koşum
    let gecen = 0, kalan = 0, atlanan = 0;
    const kalanlar = [];
    for (const sn of SENARYOLAR) {
      if (SECILEN && !SECILEN.has(sn.no)) continue;
      if (ZINCIRSIZ && sn.no === 0) { atlanan++; console.log(`ATLANDI [ 0] ${sn.ad}  (--zincirsiz: ham/cikti geliştirme zinciri bu klasörde yok; manifest'in zincirle eşitliği ÖLÇÜLMEDİ)`); continue; }
      const etiket = `[${String(sn.no).padStart(2)}] ${sn.ad}`;
      if (EXE && sn.varlik) { atlanan++; console.log(`ATLANDI ${etiket}  (exe'de varlık gömülü, değiştirilemez)`); continue; }
      const s = baglam(), t0 = Date.now();
      try { await sn.f(s); } catch (e) { s.hatalar.push(`senaryo çöktü: ${e.stack || e.message}`); }
      const sure = ((Date.now() - t0) / 1000).toFixed(1);
      if (s.hatalar.length) {
        kalan++; kalanlar.push(sn.no);
        console.log(`KALDI   ${etiket}  (${sure} sn)`);
        for (const h of s.hatalar) console.log(`    ✗ ${h}`);
        const son = s.sonCikti.trimEnd().split('\n').slice(-25);
        if (s.sonCikti) console.log(`    programın son çıktısı (son ${son.length} satır):\n${son.map((x) => '      | ' + x).join('\n')}`);
      } else { gecen++; console.log(`GEÇTİ   ${etiket}  (${sure} sn)`); }
    }
    // Gerçek oyun klasörüne dokunulmadı mı (sınama yalnız sahte klasörlere yazar)
    const gercekSonra = gercekCikti();
    const gercekFark = CIKTI_DOSYALARI.filter((rel) => gercekOnce[rel] !== gercekSonra[rel]);
    if (gercekFark.length) { kalan++; console.log(`KALDI   gerçek oyun klasörü sınamada DEĞİŞTİ: ${gercekFark.join(', ')}`); }
    else console.log('GEÇTİ   gerçek oyun klasörünün çıktı dosyaları sınamadan önce ve sonra aynı');
    console.log(`\n${gecen} senaryo geçti · ${kalan} kaldı${kalanlar.length ? ` (senaryo ${kalanlar.join(', ')})` : ''} · ${atlanan} atlandı · ${EXE ? `exe: ${EXE}` : 'tools/kurucu.mjs'}`);
    console.log(`HÜKÜM: ${kalan ? `KALDI (${kalan})` : 'GEÇTİ'}`);
    process.exitCode = kalan ? 1 : 0;
  } finally {
    if (TUT) console.log(`geçici klasör duruyor: ${GECICI}`);
    else fs.rmSync(GECICI, { recursive: true, force: true });
  }
}

ana().catch((e) => { console.log(`DURDU: ${e.stack || e.message}`); console.log('HÜKÜM: KALDI (sınama kurulamadı)'); process.exitCode = 1; });
