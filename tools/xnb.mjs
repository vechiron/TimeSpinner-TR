// XNB (XNA 4 / FNA içerik dosyası) okuyucu ve yazıcı: LZX açıcı (libmspack / MonoGame LzxDecoder'ın
// Node aktarımı), SpriteFont · Texture2D ayrıştırma, sıkıştırmasız XNB geri yazma (FNA bayrak 0'ı da okur).
// Oyun klasörüne hiçbir şey yazmaz; döküm yalnız verilen çıktı klasörüne (ham/, git dışı) gider.
//   node tools/xnb.mjs <dosya.xnb> [çıktı-klasörü]   → özet basar; klasör verilirse PNG döker
// Dışa açılanlar: xnbAc · xnbYaz · lzxAc · icerikOku · icerikYaz · fontTablosu · dokuRgba · metinCiz · buyut · pngKodla.
// Her koşumda açılmış içerik yeniden yazılıp bayt bayt karşılaştırılır; bir denetim tutmazsa çıkış kodu 1.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- LZX açıcı
const EKBIT = new Uint8Array(52), KONUM = new Uint32Array(51);
for (let i = 0, j = 0; i <= 50; i += 2) { EKBIT[i] = EKBIT[i + 1] = j; if (i !== 0 && j < 17) j++; }
for (let i = 0, j = 0; i <= 50; i++) { KONUM[i] = j; j += 1 << EKBIT[i]; }

class Bitler { // 16 bitlik küçük-endian sözcüklerle okunan bit akışı (C#'taki BitBuffer)
  constructor(b, p) { this.b = b; this.p = p; this.buf = 0; this.kalan = 0; }
  sifirla() { this.buf = 0; this.kalan = 0; }
  bayt() { const v = this.p < this.b.length ? this.b[this.p] : 0xff; this.p++; return v; }
  doldur(n) {
    while (this.kalan < n) {
      const lo = this.bayt(), hi = this.bayt();
      this.buf = (this.buf | (((hi << 8) | lo) << (16 - this.kalan))) >>> 0;
      this.kalan += 16;
    }
  }
  bak(n) { return this.buf >>> (32 - n); }
  at(n) { this.buf = (this.buf << n) >>> 0; this.kalan -= n; }
  oku(n) { if (!n) return 0; this.doldur(n); const v = this.bak(n); this.at(n); return v; }
}

function tabloKur(nsym, nbit, uz, tab) { // libmspack make_decode_table
  let poz = 0, maske = 1 << nbit, bitMaske = maske >>> 1, sonraki = bitMaske, bitNo = 1;
  for (; bitNo <= nbit; bitNo++, bitMaske >>>= 1)
    for (let s = 0; s < nsym; s++) if (uz[s] === bitNo) {
      let yaprak = poz;
      if ((poz += bitMaske) > maske) throw new Error('LZX: huffman tablosu taştı');
      for (let f = bitMaske; f-- > 0;) tab[yaprak++] = s;
    }
  if (poz !== maske) {
    for (let s = poz; s < maske; s++) tab[s] = 0;
    poz *= 65536; maske *= 65536; bitMaske = 1 << 15;
    for (; bitNo <= 16; bitNo++, bitMaske >>>= 1)
      for (let s = 0; s < nsym; s++) if (uz[s] === bitNo) {
        let yaprak = Math.floor(poz / 65536);
        for (let f = 0; f < bitNo - nbit; f++) {
          if (tab[yaprak] === 0) { tab[sonraki << 1] = 0; tab[(sonraki << 1) + 1] = 0; tab[yaprak] = sonraki++; }
          yaprak = tab[yaprak] << 1;
          if (Math.floor(poz / 2 ** (15 - f)) & 1) yaprak++;
        }
        tab[yaprak] = s;
        if ((poz += bitMaske) > maske) throw new Error('LZX: huffman tablosu taştı');
      }
  }
  if (poz === maske) return;
  for (let s = 0; s < nsym; s++) if (uz[s]) throw new Error('LZX: hatalı huffman tablosu');
}

class LzxCozucu {
  constructor(pencereBit = 16) {
    this.pBoy = 1 << pencereBit;
    this.pencere = new Uint8Array(this.pBoy).fill(0xdc);
    const slot = pencereBit === 21 ? 50 : pencereBit === 20 ? 42 : pencereBit << 1;
    this.anaEleman = 256 + (slot << 3);
    this.R0 = this.R1 = this.R2 = 1;
    this.pPoz = 0; this.baslikOkundu = false; this.intelBoy = 0;
    this.blokKalan = 0; this.blokUzunluk = 0; this.blokTur = 0;
    this.sayac = { 1: 0, 2: 0, 3: 0 }; // blok türü sayımı (kanıt için)
    this.preUz = new Uint8Array(20 + 64); this.preTab = new Uint16Array(64 + 40);
    this.anaUz = new Uint8Array(656 + 64); this.anaTab = new Uint16Array(4096 + 1312);
    this.uzUz = new Uint8Array(250 + 64); this.uzTab = new Uint16Array(4096 + 500);
    this.hizUz = new Uint8Array(8 + 64); this.hizTab = new Uint16Array(128 + 16);
  }
  huff(tab, uz, nsym, nbit) {
    const b = this.bit; b.doldur(16);
    let i = tab[b.bak(nbit)];
    if (i >= nsym) {
      let j = 2 ** (32 - nbit);
      do {
        j = Math.floor(j / 2); i <<= 1; i |= (b.buf & j) ? 1 : 0;
        if (j === 0) throw new Error('LZX: bozuk huffman kodu');
      } while ((i = tab[i]) >= nsym);
    }
    b.at(uz[i]);
    return i;
  }
  uzunlukOku(uz, ilk, son) {
    const b = this.bit;
    for (let x = 0; x < 20; x++) this.preUz[x] = b.oku(4);
    tabloKur(20, 6, this.preUz, this.preTab);
    for (let x = ilk; x < son;) {
      let z = this.huff(this.preTab, this.preUz, 20, 6), y;
      if (z === 17) { y = b.oku(4) + 4; while (y--) uz[x++] = 0; }
      else if (z === 18) { y = b.oku(5) + 20; while (y--) uz[x++] = 0; }
      else if (z === 19) {
        y = b.oku(1) + 4; z = this.huff(this.preTab, this.preUz, 20, 6);
        z = uz[x] - z; if (z < 0) z += 17;
        while (y--) uz[x++] = z;
      } else { z = uz[x] - z; if (z < 0) z += 17; uz[x++] = z; }
    }
  }
  // Bir XNA çerçevesini açar: girdi[p .. p+girdiBoy) → cikti[cp .. cp+ciktiBoy)
  coz(girdi, p, girdiBoy, cikti, cp, ciktiBoy) {
    const b = this.bit = new Bitler(girdi, p), son = p + girdiBoy;
    const w = this.pencere, wBoy = this.pBoy;
    let wp = this.pPoz, R0 = this.R0, R1 = this.R1, R2 = this.R2, togo = ciktiBoy;
    if (!this.baslikOkundu) {
      if (b.oku(1)) { const i = b.oku(16), j = b.oku(16); this.intelBoy = (i << 16) | j; }
      this.baslikOkundu = true;
    }
    while (togo > 0) {
      if (this.blokKalan === 0) {
        if (this.blokTur === 3) { if (this.blokUzunluk & 1) b.p++; b.sifirla(); }
        this.blokTur = b.oku(3);
        const i = b.oku(16), j = b.oku(8);
        this.blokKalan = this.blokUzunluk = (i << 8) | j;
        this.sayac[this.blokTur] = (this.sayac[this.blokTur] || 0) + 1;
        if (this.blokTur === 2) {
          for (let k = 0; k < 8; k++) this.hizUz[k] = b.oku(3);
          tabloKur(8, 7, this.hizUz, this.hizTab);
        }
        if (this.blokTur === 1 || this.blokTur === 2) {
          this.uzunlukOku(this.anaUz, 0, 256);
          this.uzunlukOku(this.anaUz, 256, this.anaEleman);
          tabloKur(656, 12, this.anaUz, this.anaTab);
          this.uzunlukOku(this.uzUz, 0, 249);
          tabloKur(250, 12, this.uzUz, this.uzTab);
        } else if (this.blokTur === 3) {
          b.doldur(16); if (b.kalan > 16) b.p -= 2;
          R0 = girdi.readUInt32LE(b.p); R1 = girdi.readUInt32LE(b.p + 4); R2 = girdi.readUInt32LE(b.p + 8);
          b.p += 12;
        } else throw new Error(`LZX: geçersiz blok türü ${this.blokTur}`);
      }
      if (b.p > son && (b.p > son + 2 || b.kalan < 16)) throw new Error('LZX: girdi bitti');
      let run;
      while ((run = this.blokKalan) > 0 && togo > 0) {
        if (run > togo) run = togo;
        togo -= run; this.blokKalan -= run;
        wp &= wBoy - 1;
        if (wp + run > wBoy) throw new Error('LZX: pencere sınırı aşıldı');
        if (this.blokTur === 3) {
          if (b.p + run > son) throw new Error('LZX: sıkıştırmasız blok girdiyi aşıyor');
          w.set(girdi.subarray(b.p, b.p + run), wp); b.p += run; wp += run;
          continue;
        }
        const hizali = this.blokTur === 2;
        while (run > 0) {
          let ana = this.huff(this.anaTab, this.anaUz, 656, 12);
          if (ana < 256) { w[wp++] = ana; run--; continue; }
          ana -= 256;
          let uz = ana & 7;
          if (uz === 7) uz += this.huff(this.uzTab, this.uzUz, 250, 12);
          uz += 2;
          let ofs = ana >> 3;
          if (ofs > 2) {
            if (!hizali) ofs = ofs !== 3 ? KONUM[ofs] - 2 + b.oku(EKBIT[ofs]) : 1;
            else {
              const ek = EKBIT[ofs]; ofs = KONUM[ofs] - 2;
              if (ek > 3) { ofs += b.oku(ek - 3) << 3; ofs += this.huff(this.hizTab, this.hizUz, 8, 7); }
              else if (ek === 3) ofs += this.huff(this.hizTab, this.hizUz, 8, 7);
              else if (ek > 0) ofs += b.oku(ek);
              else ofs = 1;
            }
            R2 = R1; R1 = R0; R0 = ofs;
          } else if (ofs === 0) ofs = R0;
          else if (ofs === 1) { ofs = R1; R1 = R0; R0 = ofs; }
          else { ofs = R2; R2 = R0; R0 = ofs; }
          let hedef = wp, kaynak;
          run -= uz;
          if (wp >= ofs) kaynak = hedef - ofs;
          else {
            kaynak = hedef + (wBoy - ofs);
            let kopya = ofs - wp;
            if (kopya < uz) { uz -= kopya; wp += kopya; while (kopya-- > 0) w[hedef++] = w[kaynak++]; kaynak = 0; }
          }
          wp += uz;
          while (uz-- > 0) w[hedef++] = w[kaynak++];
        }
        if (run < 0) throw new Error('LZX: eşleşme çerçeve sınırını aştı');
      }
    }
    if (togo !== 0) throw new Error('LZX: çerçeve eksik açıldı');
    const bas = (wp === 0 ? wBoy : wp) - ciktiBoy;
    cikti.set(w.subarray(bas, bas + ciktiBoy), cp);
    this.pPoz = wp; this.R0 = R0; this.R1 = R1; this.R2 = R2;
    if (this.intelBoy) throw new Error('LZX: Intel E8 dönüşümü açık; desteklenmiyor');
  }
}

// XNA çerçevelemesi: [FF çerçeve(2,BE)] blok(2,BE) + LZX verisi; çerçeve yoksa 0x8000.
export function lzxAc(girdi, acikBoyut, pencereBit = 16) {
  const d = new LzxCozucu(pencereBit), cikti = Buffer.alloc(acikBoyut);
  let p = 0, cp = 0, blokSayisi = 0;
  while (p < girdi.length) {
    const hi = girdi[p], lo = girdi[p + 1];
    let blok = (hi << 8) | lo, cerceve = 0x8000;
    if (hi === 0xff) { cerceve = (lo << 8) | girdi[p + 2]; blok = (girdi[p + 3] << 8) | girdi[p + 4]; p += 5; } else p += 2;
    if (blok === 0 || cerceve === 0) break;
    if (cp + cerceve > acikBoyut) throw new Error(`LZX: açılan veri başlıktaki boyutu (${acikBoyut}) aşıyor`);
    d.coz(girdi, p, blok, cikti, cp, cerceve);
    cp += cerceve; p += blok; blokSayisi++;
  }
  return { veri: cikti, acilan: cp, tuketilen: p, blokSayisi, lzxBlok: d.sayac };
}

// ---------------------------------------------------------------- XNB kabuğu
export function xnbAc(buf) {
  if (buf.toString('ascii', 0, 3) !== 'XNB') throw new Error('XNB imzası yok');
  const platform = String.fromCharCode(buf[3]), surum = buf[4], bayrak = buf[5], dosyaBoy = buf.readUInt32LE(6);
  if (dosyaBoy !== buf.length) throw new Error(`başlıktaki boyut ${dosyaBoy} ≠ dosya ${buf.length}`);
  const kabuk = { platform, surum, bayrak, dosyaBoy, sikistirilmis: !!(bayrak & 0x80) };
  if (!kabuk.sikistirilmis) return { ...kabuk, ham: buf.subarray(10) };
  const acikBoy = buf.readUInt32LE(10);
  const lzx = lzxAc(buf.subarray(14), acikBoy);
  return { ...kabuk, acikBoy, lzx, ham: lzx.veri };
}

// Sıkıştırmasız XNB: bayrak 0x00 (HiDef bitini korumak için `bayrak` verilebilir, 0x80 düşürülür).
export function xnbYaz(ham, { platform = 'w', surum = 5, bayrak = 0 } = {}) {
  const bas = Buffer.alloc(10);
  bas.write('XNB', 0, 'ascii'); bas[3] = platform.charCodeAt(0); bas[4] = surum; bas[5] = bayrak & 0x7f;
  bas.writeUInt32LE(10 + ham.length, 6);
  return Buffer.concat([bas, ham]);
}

// ---------------------------------------------------------------- ikili okuma / yazma
class Okur {
  constructor(b) { this.b = b; this.p = 0; }
  u8() { return this.b[this.p++]; }
  i32() { const v = this.b.readInt32LE(this.p); this.p += 4; return v; }
  u32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  yedi() { let v = 0, k = 0, x; do { x = this.u8(); v |= (x & 0x7f) << k; k += 7; } while (x & 0x80); return v >>> 0; }
  dizge() { const n = this.yedi(), s = this.b.toString('utf8', this.p, this.p + n); this.p += n; return s; }
  karakter() { // BinaryReader.ReadChar (UTF-8, BMP)
    const a = this.u8();
    if (a < 0x80) return String.fromCharCode(a);
    const n = a >= 0xe0 ? 3 : 2, s = this.b.toString('utf8', this.p - 1, this.p - 1 + n);
    this.p += n - 1; return s;
  }
  baytlar(n) { const s = this.b.subarray(this.p, this.p + n); this.p += n; return Buffer.from(s); }
}
class Yazar {
  constructor() { this.parca = []; }
  ek(b) { this.parca.push(b); }
  u8(v) { this.ek(Buffer.from([v])); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); this.ek(b); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.ek(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.ek(b); }
  yedi(v) { do { let x = v & 0x7f; v >>>= 7; if (v) x |= 0x80; this.u8(x); } while (v); }
  dizge(s) { const b = Buffer.from(s, 'utf8'); this.yedi(b.length); this.ek(b); }
  karakter(c) { this.ek(Buffer.from(c, 'utf8')); }
  bitir() { return Buffer.concat(this.parca); }
}

// ---------------------------------------------------------------- içerik (okuyucu listesi + nesne)
const turu = (ad) =>
  /Texture2DReader/.test(ad) ? 'Texture2D' : /SpriteFontReader/.test(ad) ? 'SpriteFont'
  : /ListReader`1\[\[Microsoft\.Xna\.Framework\.Rectangle/.test(ad) ? 'List<Rectangle>'
  : /ListReader`1\[\[System\.Char/.test(ad) ? 'List<Char>'
  : /ListReader`1\[\[Microsoft\.Xna\.Framework\.Vector3/.test(ad) ? 'List<Vector3>' : null;

function nesneOku(o, ok) {
  const idx = o.yedi();
  if (idx === 0) return null;
  const tur = turu(ok[idx - 1].ad);
  if (tur === 'Texture2D') {
    const bicim = o.i32(), w = o.u32(), h = o.u32(), n = o.u32(), mipler = [];
    for (let i = 0; i < n; i++) mipler.push(o.baytlar(o.u32()));
    return { tur, okuyucu: idx, bicim, w, h, mipler };
  }
  if (tur === 'SpriteFont') {
    const f = { tur, okuyucu: idx };
    f.doku = nesneOku(o, ok); f.glifler = nesneOku(o, ok); f.kirpma = nesneOku(o, ok);
    f.karakterler = nesneOku(o, ok); f.satirAraligi = o.i32(); f.aralik = o.f32(); f.kerning = nesneOku(o, ok);
    f.varsayilan = o.u8() ? o.karakter() : null;
    return f;
  }
  if (tur && tur.startsWith('List')) {
    const n = o.i32(), ogeler = [];
    for (let i = 0; i < n; i++) ogeler.push(
      tur === 'List<Char>' ? o.karakter() : tur === 'List<Vector3>' ? [o.f32(), o.f32(), o.f32()] : [o.i32(), o.i32(), o.i32(), o.i32()]);
    return { tur, okuyucu: idx, ogeler };
  }
  throw new Error(`desteklenmeyen okuyucu: ${ok[idx - 1].ad}`);
}

function nesneYaz(y, n) {
  if (!n) { y.yedi(0); return; }
  y.yedi(n.okuyucu);
  if (n.tur === 'Texture2D') {
    y.i32(n.bicim); y.u32(n.w); y.u32(n.h); y.u32(n.mipler.length);
    for (const m of n.mipler) { y.u32(m.length); y.ek(m); }
  } else if (n.tur === 'SpriteFont') {
    nesneYaz(y, n.doku); nesneYaz(y, n.glifler); nesneYaz(y, n.kirpma); nesneYaz(y, n.karakterler);
    y.i32(n.satirAraligi); y.f32(n.aralik); nesneYaz(y, n.kerning);
    y.u8(n.varsayilan === null ? 0 : 1); if (n.varsayilan !== null) y.karakter(n.varsayilan);
  } else {
    y.i32(n.ogeler.length);
    for (const e of n.ogeler) {
      if (n.tur === 'List<Char>') y.karakter(e);
      else if (n.tur === 'List<Vector3>') e.forEach((v) => y.f32(v));
      else e.forEach((v) => y.i32(v));
    }
  }
}

// Açılmış içerik → { okuyucular, paylasilan, nesne, artik }. artik: okunmadan kalan bayt (0 olmalı).
export function icerikOku(ham) {
  const o = new Okur(ham), okuyucular = [];
  for (let i = 0, n = o.yedi(); i < n; i++) okuyucular.push({ ad: o.dizge(), surum: o.i32() });
  const paylasilan = o.yedi();
  if (paylasilan) throw new Error('paylaşılan kaynak var; desteklenmiyor');
  const nesne = nesneOku(o, okuyucular);
  return { okuyucular, paylasilan, nesne, artik: ham.length - o.p };
}

export function icerikYaz({ okuyucular, paylasilan = 0, nesne }) {
  const y = new Yazar();
  y.yedi(okuyucular.length);
  for (const r of okuyucular) { y.dizge(r.ad); y.i32(r.surum); }
  y.yedi(paylasilan);
  nesneYaz(y, nesne);
  return y.bitir();
}

// SpriteFont'un paralel listelerini karakter başına satıra çevirir.
export const fontTablosu = (f) => f.karakterler.ogeler.map((c, i) => ({
  c, kod: c.codePointAt(0), glif: f.glifler.ogeler[i], kirpma: f.kirpma.ogeler[i], kerning: f.kerning.ogeler[i] }));

// ---------------------------------------------------------------- doku → RGBA
export const BICIM = ['Color', 'Bgr565', 'Bgra5551', 'Bgra4444', 'Dxt1', 'Dxt3', 'Dxt5', 'NormalizedByte2',
  'NormalizedByte4', 'Rgba1010102', 'Rg32', 'Rgba64', 'Alpha8', 'Single'];
// DXT1/3/5 (4x4 blok) → RGBA. DXT3: 8 bayt açık 4 bit alfa + renk bloğu (her zaman 4 renk kipi).
function dxtCoz(m, w, h, bicim) {
  const px = Buffer.alloc(w * h * 4), blokBoy = bicim === 4 ? 8 : 16;
  const r565 = (c) => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
  let p = 0;
  for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4, p += blokBoy) {
    const alfa = new Array(16).fill(255);
    if (bicim === 5) for (let i = 0; i < 16; i++) alfa[i] = ((m[p + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
    if (bicim === 6) {
      const a0 = m[p], a1 = m[p + 1], tab = [a0, a1];
      for (let i = 1; i < 7; i++) tab.push(a0 > a1 ? ((7 - i) * a0 + i * a1) / 7 | 0 : i < 5 ? ((5 - i) * a0 + i * a1) / 5 | 0 : i === 5 ? 0 : 255);
      let bitler = 0n; for (let i = 0; i < 6; i++) bitler |= BigInt(m[p + 2 + i]) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) alfa[i] = tab[Number((bitler >> BigInt(3 * i)) & 7n)];
    }
    const c = p + blokBoy - 8, c0 = m.readUInt16LE(c), c1 = m.readUInt16LE(c + 2), k0 = r565(c0), k1 = r565(c1);
    const renk = [k0, k1];
    if (bicim !== 4 || c0 > c1) renk.push(k0.map((v, i) => (2 * v + k1[i]) / 3 | 0), k0.map((v, i) => (v + 2 * k1[i]) / 3 | 0));
    else renk.push(k0.map((v, i) => (v + k1[i]) >> 1), [0, 0, 0]);
    const idx = m.readUInt32LE(c + 4);
    for (let i = 0; i < 16; i++) {
      const x = bx + (i & 3), y = by + (i >> 2); if (x >= w || y >= h) continue;
      const s = (idx >>> (2 * i)) & 3, d = (y * w + x) * 4;
      px[d] = renk[s][0]; px[d + 1] = renk[s][1]; px[d + 2] = renk[s][2];
      px[d + 3] = bicim === 4 && c0 <= c1 && s === 3 ? 0 : alfa[i];
    }
  }
  return { w, h, px };
}
export function dokuRgba(t) {
  const { w, h } = t, m = t.mipler[0];
  if (t.bicim === 0) return { w, h, px: Buffer.from(m) };
  if (t.bicim === 12) { const px = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { px.fill(255, i * 4, i * 4 + 3); px[i * 4 + 3] = m[i]; } return { w, h, px }; }
  if (t.bicim >= 4 && t.bicim <= 6) return dxtCoz(m, w, h, t.bicim);
  throw new Error(`doku biçimi ${BICIM[t.bicim] || t.bicim} için PNG dönüştürücü yok`);
}

// Metni SpriteFont'un çizim kuralıyla (XNA SpriteFont.InternalDraw) RGBA'ya çizer: önizleme ve sınama için.
export function metinCiz(f, metin, img = dokuRgba(f.doku)) {
  const t = new Map(fontTablosu(f).map((r) => [r.c, r])), satirlar = metin.split('\n'), cizim = [];
  let gen = 1;
  satirlar.forEach((s, sy) => {
    let x = 0, ilk = true;
    for (const c of s) {
      const r = t.get(c) || (f.varsayilan && t.get(f.varsayilan));
      if (!r) throw new Error(`yazı tipinde yok: ${c}`);
      const [A, B, C] = r.kerning;
      if (ilk) { x = Math.max(A, 0); ilk = false; } else x += f.aralik + A;
      cizim.push([r, x + r.kirpma[0], sy * f.satirAraligi + r.kirpma[1]]);
      x += B + C; gen = Math.max(gen, Math.ceil(x));
    }
  });
  const o = { w: gen + 2, h: satirlar.length * f.satirAraligi + 2, px: null };
  o.px = Buffer.alloc(o.w * o.h * 4);
  for (const [r, dx, dy] of cizim) {
    const [gx, gy, gw, gh] = r.glif;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const s = ((gy + y) * img.w + gx + x) * 4, X = Math.round(dx) + x + 1, Y = dy + y + 1;
      if (X < 0 || Y < 0 || X >= o.w || Y >= o.h || !img.px[s + 3]) continue;
      img.px.copy(o.px, (Y * o.w + X) * 4, s, s + 4);
    }
  }
  return o;
}

// ---------------------------------------------------------------- PNG yazıcı (Papers Please Türkçe yamasının png.mjs dosyasından uyarlandı)
const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const parca = (tip, veri) => { const l = Buffer.alloc(4); l.writeUInt32BE(veri.length); const t = Buffer.from(tip, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, veri]))); return Buffer.concat([l, t, veri, c]); };
export function pngKodla({ w, h, px }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const ham = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(ham, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), parca('IHDR', ihdr), parca('IDAT', zlib.deflateSync(ham, { level: 9 })), parca('IEND', Buffer.alloc(0))]);
}
// PNG okuyucu: 8 bit RGBA / RGB / gri / paletli, interlace'siz. Girdi dosya yolu ya da Buffer; çıktı {w,h,px} (RGBA).
// (ham/onizleme/yazitipi/png-oku.mjs'ten taşındı.)
export function pngOku(girdi) {
  const b = Buffer.isBuffer(girdi) ? girdi : fs.readFileSync(girdi);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG değil');
  let o = 8, w, h, bd, ct, il, plte = null, trns = null;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), tip = b.toString('ascii', o + 4, o + 8), v = b.subarray(o + 8, o + 8 + len);
    if (tip === 'IHDR') { w = v.readUInt32BE(0); h = v.readUInt32BE(4); bd = v[8]; ct = v[9]; il = v[12]; }
    else if (tip === 'IDAT') idat.push(v);
    else if (tip === 'PLTE') plte = v;
    else if (tip === 'tRNS') trns = v;
    o += 12 + len;
  }
  if (bd !== 8 || il !== 0) throw new Error(`desteklenmeyen PNG: bd=${bd} il=${il}`);
  const kanal = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!kanal) throw new Error(`desteklenmeyen PNG renk türü: ${ct}`);
  const ham = zlib.inflateSync(Buffer.concat(idat)), sat = w * kanal, cik = Buffer.alloc(h * sat);
  for (let y = 0; y < h; y++) {
    const f = ham[y * (sat + 1)], s = ham.subarray(y * (sat + 1) + 1, (y + 1) * (sat + 1));
    for (let x = 0; x < sat; x++) {
      const a = x >= kanal ? cik[y * sat + x - kanal] : 0, u = y > 0 ? cik[(y - 1) * sat + x] : 0,
        c = x >= kanal && y > 0 ? cik[(y - 1) * sat + x - kanal] : 0;
      let p;
      if (f === 0) p = 0; else if (f === 1) p = a; else if (f === 2) p = u; else if (f === 3) p = (a + u) >> 1;
      else { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      cik[y * sat + x] = (s[x] + p) & 255;
    }
  }
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ct === 6) cik.copy(px, i * 4, i * 4, i * 4 + 4);
    else if (ct === 2) { px[i * 4] = cik[i * 3]; px[i * 4 + 1] = cik[i * 3 + 1]; px[i * 4 + 2] = cik[i * 3 + 2]; px[i * 4 + 3] = 255; }
    else if (ct === 0) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = cik[i]; px[i * 4 + 3] = 255; }
    else if (ct === 4) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = cik[i * 2]; px[i * 4 + 3] = cik[i * 2 + 1]; }
    else { const k = cik[i]; px[i * 4] = plte[k * 3]; px[i * 4 + 1] = plte[k * 3 + 1]; px[i * 4 + 2] = plte[k * 3 + 2]; px[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { w, h, px };
}
// Gözle bakmak için: koyu zemin üstüne k kat büyütülmüş kopya.
export function buyut({ w, h, px }, k, zemin = [40, 40, 48]) {
  const W = w * k, H = h * k, o = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((y / k | 0) * w + (x / k | 0)) * 4, d = (y * W + x) * 4, a = px[s + 3] / 255;
    for (let c = 0; c < 3; c++) o[d + c] = Math.round(px[s + c] * a + zemin[c] * (1 - a));
    o[d + 3] = 255;
  }
  return { w: W, h: H, px: o };
}

// ---------------------------------------------------------------- komut satırı
const TR = 'çÇğĞıİöÖşŞüÜ';
function ozet(dosya, cikis) {
  const buf = fs.readFileSync(dosya), ad = path.basename(dosya, '.xnb'), x = xnbAc(buf);
  console.log(`== ${dosya}`);
  console.log(`  XNB platform=${x.platform} sürüm=${x.surum} bayrak=0x${x.bayrak.toString(16)} dosya=${x.dosyaBoy} bayt` +
    (x.sikistirilmis ? ' (LZX)' : ' (sıkıştırmasız)'));
  if (x.sikistirilmis) {
    const l = x.lzx;
    console.log(`  LZX: başlıktaki açık boyut=${x.acikBoy} · açılan=${l.acilan} ${l.acilan === x.acikBoy ? 'EŞİT' : 'FARKLI!'}` +
      ` · tüketilen=${l.tuketilen}/${x.dosyaBoy - 14} sıkışık bayt (geri kalan ${buf.subarray(14 + l.tuketilen).every((v) => v === 0) ? 'hepsi sıfır' : 'SIFIR DEĞİL!'}) · XNA blok=${l.blokSayisi}` +
      ` · LZX blok (verbatim/aligned/sıkıştırmasız)=${l.lzxBlok[1]}/${l.lzxBlok[2]}/${l.lzxBlok[3]}`);
  }
  const ic = icerikOku(x.ham);
  console.log(`  okuyucular (${ic.okuyucular.length}):`);
  ic.okuyucular.forEach((r, i) => console.log(`    ${i + 1}. ${r.ad.split(',')[0]}${r.ad.includes('[[') ? ' [' + r.ad.match(/\[\[([^,]+)/)[1] + ']' : ''} (sürüm ${r.surum})`));
  console.log(`  paylaşılan kaynak=${ic.paylasilan} · artık bayt=${ic.artik} ${ic.artik === 0 ? '(veri tam tükendi)' : 'HATA'}`);
  const geri = icerikYaz(ic);
  console.log(`  geri yazma sınaması: ${geri.equals(x.ham) ? 'AYNI (' + geri.length + ' bayt)' : 'FARKLI!'}`);
  // Denetimlerden biri tutmazsa çıkış kodu 1 (kural kapıda: çıktıyı okumadan da görülür).
  if ((x.sikistirilmis && (x.lzx.acilan !== x.acikBoy || !buf.subarray(14 + x.lzx.tuketilen).every((v) => v === 0)))
    || ic.artik !== 0 || !geri.equals(x.ham)) process.exitCode = 1;
  const n = ic.nesne;
  const dokuOzet = (t) => `${t.w}x${t.h} ${BICIM[t.bicim] || t.bicim} mip=${t.mipler.length} veri=${t.mipler[0].length} bayt`;
  const dokular = [];
  if (n.tur === 'Texture2D') { console.log(`  Texture2D ${dokuOzet(n)}`); dokular.push([ad, n]); }
  if (n.tur === 'SpriteFont') {
    const t = fontTablosu(n), f = n;
    console.log(`  SpriteFont doku ${dokuOzet(f.doku)}`);
    console.log(`  karakter=${f.karakterler.ogeler.length} glif=${f.glifler.ogeler.length} kırpma=${f.kirpma.ogeler.length} kerning=${f.kerning.ogeler.length}`);
    console.log(`  LineSpacing=${f.satirAraligi} Spacing=${f.aralik} DefaultCharacter=${f.varsayilan === null ? 'yok' : JSON.stringify(f.varsayilan) + ' U+' + f.varsayilan.codePointAt(0).toString(16).toUpperCase()}`);
    // karakter aralıkları
    const kodlar = t.map((r) => r.kod), aralik = [];
    for (const k of kodlar) { const s = aralik[aralik.length - 1]; if (s && s[1] === k - 1) s[1] = k; else aralik.push([k, k]); }
    const hex = (k) => 'U+' + k.toString(16).toUpperCase().padStart(4, '0');
    console.log(`  aralıklar: ${aralik.map(([a, b]) => a === b ? hex(a) : hex(a) + '-' + hex(b)).join(' ')}`);
    console.log(`  sıralı mı: ${kodlar.every((k, i) => !i || k > kodlar[i - 1]) ? 'evet' : 'HAYIR'}`);
    console.log(`  karakterler: ${t.map((r) => r.c).join('')}`);
    console.log(`  Türkçe var: ${[...TR].filter((c) => kodlar.includes(c.codePointAt(0))).join(' ') || '-'} · yok: ${[...TR].filter((c) => !kodlar.includes(c.codePointAt(0))).join(' ') || '-'}`);
    console.log(`  Kiril (U+0400-04FF): ${kodlar.filter((k) => k >= 0x400 && k <= 0x4ff).length} · Latin-1 (U+00A0-00FF): ${kodlar.filter((k) => k >= 0xa0 && k <= 0xff).length} · Latin Extended-A (U+0100-017F): ${kodlar.filter((k) => k >= 0x100 && k <= 0x17f).length}`);
    const gw = t.map((r) => r.glif[2]), gh = t.map((r) => r.glif[3]), kh = t.map((r) => r.kirpma[3]);
    const say = (a) => [...a.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())].sort((p, q) => q[1] - p[1]).map(([v, c]) => `${v}×${c}`).join(' ');
    console.log(`  glif genişliği: ${say(gw)}`);
    console.log(`  glif yüksekliği: ${say(gh)} · kırpma yüksekliği: ${say(kh)}`);
    console.log(`  kırpma y: ${say(t.map((r) => r.kirpma[1]))}`);
    console.log(`  kerning değerleri: ${say(t.map((r) => r.kerning.join('/')))}`);
    const altSinir = Math.max(...t.map((r) => r.glif[1] + r.glif[3])), sagSinir = Math.max(...t.map((r) => r.glif[0] + r.glif[2]));
    console.log(`  glif kutularının kapladığı alan: x<${sagSinir} y<${altSinir} (doku ${f.doku.w}x${f.doku.h})`);
    const satirlar = [...new Set(t.map((r) => r.glif[1]))].sort((p, q) => p - q);
    console.log(`  glif satırlarının y'leri: ${satirlar.join(' ')}`);
    for (const y of satirlar) {
      const s = t.filter((r) => r.glif[1] === y), son = s.reduce((m, r) => Math.max(m, r.glif[0] + r.glif[2]), 0);
      console.log(`    y=${y}: ${s.length} glif, son x=${son}, satırda boş genişlik=${f.doku.w - son}`);
    }
    const img = dokuRgba(f.doku), renkler = new Map();
    for (let i = 0; i < img.px.length; i += 4) { const k = img.px.readUInt32BE(i).toString(16).padStart(8, '0'); renkler.set(k, (renkler.get(k) || 0) + 1); }
    console.log(`  dokudaki RGBA değerleri: ${[...renkler].sort((p, q) => q[1] - p[1]).map(([k, c]) => `${k}×${c}`).join(' ')}`);
    dokular.push([ad, f.doku]);
    if (cikis) {
      const ornek = 'çÇğĞıİöÖşŞüÜ\nTürkçe Dil Seçimi: Işık, Göğüs, Şüphe\nAÖ aö Cç Gğ Ii Ss Uü';
      if (ornek.split('').every((c) => c === '\n' || t.some((r) => r.c === c)))
        fs.writeFileSync(path.join(cikis, `${ad}-tr-ornek-x6.png`), pngKodla(buyut(metinCiz(f, ornek), 6)));
    }
    if (cikis) fs.writeFileSync(path.join(cikis, `${ad}-glifler.tsv`),
      'karakter\tkod\tglif x,y,w,h\tkırpma x,y,w,h\tkerning A,B,C\n' + t.map((r) => `${r.c}\t${hex(r.kod)}\t${r.glif}\t${r.kirpma}\t${r.kerning}`).join('\n') + '\n');
  }
  if (cikis) for (const [a, d] of dokular) {
    const img = dokuRgba(d);
    fs.writeFileSync(path.join(cikis, `${a}.png`), pngKodla(img));
    fs.writeFileSync(path.join(cikis, `${a}-x4.png`), pngKodla(buyut(img, 4)));
    console.log(`  döküldü: ${path.join(cikis, a)}.png · ${a}-x4.png`);
  }
  return { x, ic };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const [dosya, cikis] = process.argv.slice(2);
  if (!dosya) { console.error('kullanım: node tools/xnb.mjs <dosya.xnb> [çıktı-klasörü]'); process.exit(2); }
  if (cikis) {
    if (path.resolve(cikis).toLowerCase().includes('steamapps')) { console.error('DURDU: oyun klasörüne yazılmaz'); process.exit(2); }
    fs.mkdirSync(cikis, { recursive: true });
  }
  ozet(dosya, cikis);
}
