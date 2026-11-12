// Oyunun ORİJİNAL dosyası nerede? Yama gerçek oyuna kuruluyken (tools/oyuna-kur.mjs) oyun klasöründeki exe,
// LocFlags.xnb ve TextureDatabase.dat yamalıdır, TR.txt de bizimdir. Orijinali okuması gereken araç (yamacı,
// bayrak, oyun dışı sınama, ölçüm) yolu buradan alır: dosya bizim kurduğumuzsa yedeği, değilse oyun klasörünü.
// Dosya ne orijinal ne bizim kurduğumuzsa (oyun güncellenmiş, yedek eskimiş) hata verir: eski orijinali
// sessizce kullanmak yanlış yamaya götürür.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ozet, kayitOku as kayitOkuCekirdek } from './kur-cekirdek.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OYUN = process.env.TIMESPINNER_OYUN || 'C:/Program Files (x86)/Steam/steamapps/common/Timespinner';
export const YEDEK = path.join(KOK, 'ham', 'oyun-yedek');

// ozet ve yedek kaydını okuma kur-cekirdek.mjs'te (yol sabiti olmayan saf çekirdek); burada yalnız eski adlarla
// dışa açılır. kayitOku'nun varsayılan yedek klasörü bu projeye özgü olduğu için çekirdekte değil burada.
export { ozet };
export const kayitOku = (yedek = YEDEK) => kayitOkuCekirdek(yedek);
const ayniYer = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// rel: oyun klasörüne göre yol ('Content/TextureDatabase.dat'). Dönüş: okunacak dosyanın yolu; orijinal oyunda
// o dosya yoksa (TR.txt) null.
export function orijinal(rel, oyun = OYUN, yedek = YEDEK) {
  const hedef = path.join(oyun, rel);
  const kayit = kayitOku(yedek), k = kayit && ayniYer(kayit.oyun, oyun) ? kayit.dosyalar[rel.replace(/\\/g, '/')] : null;
  if (!k) return hedef;
  const simdi = ozet(hedef);
  if (simdi === k.orijinal) return hedef;
  if (simdi === k.kurulan) return k.orijinal ? path.join(yedek, rel) : null;
  throw new Error(`${rel} ne orijinal ne bizim kurduğumuz: oyun güncellenmiş olabilir (node tools/oyuna-kur.mjs durum)`);
}
