// Bölge başlıklarını bir yazı tipiyle "kapsama haritası" olarak çizer (WPF metin motoru: harf çifti aralığı
// uygulanır). Yalnız geliştirmede koşar (tools/baslik-ciz.mjs ciz/sina derler); kurulumda gerekmez.
// Yazı tipi dosyası yalnız okunur. Ton, kontur ve atlas işi Node tarafında.
// (ham/onizleme/yazitipi/cizici.cs'nin "ciz" kısmı; çizim mantığı değişmedi, onaylı önizleme bununla üretildi.)
//
// Kullanım: baslik-ciz.exe <ttf> <xYuksekligiPx> <metinler.txt> <cikis.bin>
//   metinler.txt: her satır "yatayÇarpan<TAB>metin" (UTF-8)
//   cikis.bin: [int32 adet] sonra her başlık için [int32 W][int32 H][float64 solKenar][float64 xYuk][W*H bayt kapsama 0..255]
// Kapsama, karenin üstünde ve altında PAY px taşma payı olan H = KARE + 2*PAY yükseklikte bir tuvalde ölçülür.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

static class BaslikCiz {
  const int SS = 16;          // süper örnekleme: her hedef piksel 16x16 örnekten
  const int PAY = 10;         // taşmayı (kesilmeyi) ölçmek için karenin üstünde/altında pay
  const int KARE = 30;        // atlas karesinin yüksekliği
  const double TABAN = 21;    // kare içinde taban çizgisi: orijinalde dolgunun son satırı 20
  const double SOL = 3;       // mürekkebin (dolgunun) sol kenarı; orijinalde dolgu 3-5. sütunda başlıyor

  static GlyphTypeface gt;
  static Typeface tf;
  static readonly CultureInfo TR = CultureInfo.GetCultureInfo("tr-TR");

  static void Yukle(string ttf) {
    string tam = Path.GetFullPath(ttf);
    gt = new GlyphTypeface(new Uri(tam));
    string aile = null;
    foreach (var kv in gt.FamilyNames) { if (aile == null || kv.Key.Name.StartsWith("en")) aile = kv.Value; }
    var klasor = new Uri(Path.GetDirectoryName(tam) + Path.DirectorySeparatorChar);
    var ff = new FontFamily(klasor, "./" + Path.GetFileName(tam) + "#" + aile);
    tf = new Typeface(ff, gt.Style, gt.Weight, gt.Stretch);
    GlyphTypeface g2;
    if (!tf.TryGetGlyphTypeface(out g2)) throw new Exception("Typeface glif yüzüne çözülemedi: " + aile);
    // WPF aile adıyla sistemdeki başka bir dosyayı seçerse çizim sessizce değişir: dosya yolu tutmalı
    if (!string.Equals(Uri.UnescapeDataString(g2.FontUri.AbsolutePath), Uri.UnescapeDataString(gt.FontUri.AbsolutePath), StringComparison.OrdinalIgnoreCase))
      throw new Exception("WPF başka bir dosyayı seçti: " + g2.FontUri + " (beklenen " + gt.FontUri + ")");
  }

  static FormattedText Metin(string s, double em) {
#pragma warning disable 618
    return new FormattedText(s, TR, FlowDirection.LeftToRight, tf, em, Brushes.White);
#pragma warning restore 618
  }

  static void EksikDenetle(string s) {
    var eksik = new StringBuilder();
    foreach (char c in s) if (c != ' ' && !gt.CharacterToGlyphMap.ContainsKey(c)) eksik.Append(c);
    if (eksik.Length > 0) throw new Exception("yazı tipinde olmayan harf: [" + eksik + "] metin: " + s);
  }

  static void Ciz(double xYuk, string metinDosyasi, string cikis) {
    var ftx = Metin("x", 1000);
    double xEm = ftx.BuildGeometry(new Point(0, -ftx.Baseline)).Bounds.Height / 1000;
    double em = xYuk / xEm;
    var satirlar = new List<string>();
    foreach (var l in File.ReadAllLines(metinDosyasi, Encoding.UTF8)) if (l.Length > 0) satirlar.Add(l);
    using (var w = new BinaryWriter(File.Create(cikis))) {
      w.Write(satirlar.Count);
      foreach (var satir in satirlar) {
        int sekme = satir.IndexOf('\t');
        if (sekme <= 0) throw new Exception("satır \"çarpan<TAB>metin\" değil: " + satir);
        double sxs = double.Parse(satir.Substring(0, sekme), CultureInfo.InvariantCulture);
        string s = satir.Substring(sekme + 1);
        EksikDenetle(s);
        var ft = Metin(s, em);
        var geo = ft.BuildGeometry(new Point(0, 0));
        Rect b = geo.Bounds;
        double ox = SOL - b.Left * sxs, oy = PAY + TABAN - ft.Baseline;
        int W = (int)Math.Ceiling(SOL + b.Width * sxs) + 3; if (W % 2 == 1) W++;
        int H = KARE + 2 * PAY;
        var dv = new DrawingVisual();
        RenderOptions.SetEdgeMode(dv, EdgeMode.Aliased);
        using (var dc = dv.RenderOpen()) {
          dc.PushTransform(new ScaleTransform(SS, SS));
          dc.PushTransform(new TranslateTransform(ox, oy));
          dc.PushTransform(new ScaleTransform(sxs, 1));
          dc.DrawGeometry(Brushes.White, null, geo);
          dc.Pop(); dc.Pop(); dc.Pop();
        }
        var rtb = new RenderTargetBitmap(W * SS, H * SS, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(dv);
        int stride = W * SS * 4;
        var p = new byte[stride * H * SS];
        rtb.CopyPixels(p, stride, 0);
        var kap = new byte[W * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
          int n = 0;
          for (int yy = 0; yy < SS; yy++) { int o = (y * SS + yy) * stride + x * SS * 4 + 3; for (int xx = 0; xx < SS; xx++) if (p[o + xx * 4] >= 128) n++; }
          kap[y * W + x] = (byte)Math.Round(n * 255.0 / (SS * SS));
        }
        w.Write(W); w.Write(H); w.Write(SOL); w.Write(xYuk);
        w.Write(kap);
      }
    }
  }

  [STAThread]
  static int Main(string[] a) {
    Console.OutputEncoding = new UTF8Encoding(false);
    try {
      if (a.Length != 4) throw new Exception("kullanım: baslik-ciz.exe <ttf> <xYuksekligiPx> <metinler.txt> <cikis.bin>");
      Yukle(a[0]);
      Ciz(double.Parse(a[1], CultureInfo.InvariantCulture), a[2], a[3]);
      return 0;
    } catch (Exception e) { Console.Error.WriteLine("HATA: " + e.Message); return 2; }
  }
}
