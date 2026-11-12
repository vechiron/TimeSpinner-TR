// Kurulum programı exe'sinin simgesi: Türk bayrağı. Çizim dil menüsündeki bayrakla AYNI işlevden
// (bayrak.mjs turkBayragi) gelir: oyundan alınmış piksel ve ayrı bir bayrak çizimi yok, tek kaynak.
// Boylar 16, 32, 48, 256; bayrak kare tuvalin ortasında, 3:2 oranında, çevresi saydam.
//   node tools/simge.mjs <önizleme.png>   simgenin bütün boyları yan yana, açık ve koyu zemin üstünde
// kurucu-derle.mjs simgeIco() ile .ico'yu üretip exe'ye yazar (derleme tarafı, kurucunun içine girmez).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turkBayragi } from './bayrak.mjs';
import { pngKodla } from './xnb.mjs';

export const BOYLAR = [16, 32, 48, 256];

// Kare tuval boy x boy; bayrak tam genişlik, yükseklik 2/3 (en az 1 piksellik kenar payı için boy ≥ 16 varsayılır).
export function ciz(boy) {
  const h = Math.round((boy * 2) / 3), ust = Math.floor((boy - h) / 2);
  const bayrak = turkBayragi(boy, h, boy >= 128 ? 4 : 16); // büyük boyda alt örnekleme düşük: 256x171 piksel, süre ölçüsü
  const px = Buffer.alloc(boy * boy * 4);                  // saydam
  bayrak.px.copy(px, ust * boy * 4);
  return { w: boy, h: boy, px };
}

// .ico: 6 baytlık başlık, her boy için 16 baytlık girdi, sonra PNG'ler (Windows Vista'dan beri her boyda PNG okunur)
export function simgeIco() {
  const pngler = BOYLAR.map((b) => pngKodla(ciz(b)));
  const baslik = Buffer.alloc(6 + 16 * pngler.length);
  baslik.writeUInt16LE(1, 2);
  baslik.writeUInt16LE(pngler.length, 4);
  let ofs = baslik.length;
  pngler.forEach((p, i) => {
    const g = 6 + 16 * i, b = BOYLAR[i] % 256; // 256 -> 0
    baslik[g] = b; baslik[g + 1] = b;
    baslik.writeUInt16LE(1, g + 4);
    baslik.writeUInt16LE(32, g + 6);
    baslik.writeUInt32LE(p.length, g + 8);
    baslik.writeUInt32LE(ofs, g + 12);
    ofs += p.length;
  });
  return Buffer.concat([baslik, ...pngler]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('kullanım: node tools/simge.mjs <önizleme.png>'); process.exit(1); }
  const ara = 8, gen = BOYLAR.reduce((t, b) => t + b + ara, ara), yuk = 2 * (256 + 2 * ara);
  const img = { w: gen, h: yuk, px: Buffer.alloc(gen * yuk * 4) };
  for (let y = 0; y < yuk; y++) for (let x = 0; x < gen; x++) img.px.set(y < yuk / 2 ? [0xf3, 0xf3, 0xf3, 255] : [0x20, 0x20, 0x20, 255], (y * gen + x) * 4);
  for (const zemin of [0, yuk / 2]) {
    let x0 = ara;
    for (const b of BOYLAR) {
      const s = ciz(b), y0 = zemin + ara;
      for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
        const i = (y * b + x) * 4;
        if (s.px[i + 3]) s.px.copy(img.px, ((y0 + y) * gen + x0 + x) * 4, i, i + 4);
      }
      x0 += b + ara;
    }
  }
  fs.writeFileSync(process.argv[2], pngKodla(img));
  console.log(`${process.argv[2]} (${BOYLAR.join(', ')} piksel; üstte açık, altta koyu zemin)`);
}
