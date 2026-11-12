// DENEME yamacı: Timespinner.exe'ye Türkçe'yi YENİ bir dil olarak ekler (Mono.Cecil 0.11.6, net40).
// Karar değil, ölçüm aracı: "yeni dil eklemek kaç talimat, Cecil ile çalışıyor mu?" sorusunu cevaplar.
// Derleme ve koşum: node tools/il-dok.mjs yama-dene   (C# 5, .NET Framework 4 csc.exe ile derlenir)
//   TrYamaci.exe <girdi Timespinner.exe> <çıktı exe>
// Oyun klasörüne yazmaz: çıktı girdiyle aynı klasördeyse durur. Beklenen IL deseni yoksa
// (oyun güncellenmiş) hiçbir şey yazmadan çıkış 3 verir.
using System;
using System.IO;
using System.Linq;
using Mono.Cecil;
using Mono.Cecil.Cil;
using Mono.Cecil.Rocks;

static class TrYamaci
{
    // Enum değeri = LocFlags atlasındaki bayrak karesi ((int)locale ile çizilir).
    // 0-7 bayraklar, 8-9 çerçeve, 10 ok: ilk boş kare 11.
    const int TR = 11;
    // LocToastLatin'de TR'nin ilk karesi (dil sırası 5 × 3); kare 15-17 tools/bildirim.mjs'in eklediği.
    const int TR_TOAST_TABAN = 15;
    // Seviye atlama yazısı (LevelUp atlası): kare 3-6 İngilizce "LEVEL UP" (84 geniş); Türkçesi 128 geniş,
    // tools/icerik.mjs atlasa kare 34-37 olarak ekler. Çizim noktası genişliğin yarısı (oyunda 42,10).
    const int SEVIYE_BUYUK_ILK = 3, SEVIYE_TR_ILK = 34;
    const float SEVIYE_CIZIM_X = 64f, SEVIYE_CIZIM_Y = 10f;
    // Duraklatma menüsü (PauseMenu atlası): karakterin yanındaki seviye etiketi kare 118 "LV.";
    // Türkçesi "SV." kare 157 (tools/sv.mjs çizer, tools/icerik.mjs atlasa ekler: 256x256 → 256x512, 157 → 158 kare).
    const int PAUSE_LV_KARE = 118, PAUSE_SV_KARE = 157;
    const string BASLIK = "Overlays/PlayerHUD/AreaTitles";
    const string Loc = "Timespinner.Core.Localization.";

    static int Main(string[] a)
    {
        // Çıktı UTF-8: Node borudan okuyor, konsol kod sayfası Türkçe harfleri bozar.
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false)) { AutoFlush = true });
        Console.SetError(new StreamWriter(Console.OpenStandardError(), new System.Text.UTF8Encoding(false)) { AutoFlush = true });
        if (a.Length != 2) { Console.Error.WriteLine("kullanım: TrYamaci.exe <girdi exe> <çıktı exe>"); return 1; }
        string girdi = Path.GetFullPath(a[0]), cikti = Path.GetFullPath(a[1]);
        if (string.Equals(Path.GetDirectoryName(girdi), Path.GetDirectoryName(cikti), StringComparison.OrdinalIgnoreCase))
        { Console.Error.WriteLine("DURDU: çıktı girdiyle aynı klasörde olamaz (oyun klasörüne yazılmaz)"); return 1; }

        var cozucu = new DefaultAssemblyResolver();
        cozucu.AddSearchDirectory(Path.GetDirectoryName(girdi));
        var asm = AssemblyDefinition.ReadAssembly(girdi, new ReaderParameters { AssemblyResolver = cozucu, InMemory = true });
        var mod = asm.MainModule;
        Console.WriteLine("derleme: " + asm.Name.FullName + "  güçlü ad: " + (asm.Name.HasPublicKey ? "VAR" : "yok") + "  mimari: " + mod.Architecture + "  öznitelik: " + mod.Attributes);

        try
        {
            // 1. Enum'a TR alanı: ToString() "TR" döner, dosya adı Content/Localization/TR.txt olur.
            var en = mod.GetType(Loc + "ELanguageLocale");
            if (en.Fields.Any(f => f.Name == "TR")) throw new Hata("zaten yamalı (ELanguageLocale.TR var)");
            var alan = new FieldDefinition("TR", FieldAttributes.Public | FieldAttributes.Static | FieldAttributes.Literal | FieldAttributes.HasDefault, en);
            alan.Constant = TR;
            en.Fields.Add(alan);
            Console.WriteLine("1 ELanguageLocale.TR = " + TR + " eklendi");

            // 2. StringLibrary.LoadTables: "(uint)(dil-1) > 6 && dil != PD ? TimespinnerStrings : dil.ToString()"
            //    PD karşılaştırmasının önüne "dil == TR ise kendi dosyası" eklenir.
            Duzenle(mod, Loc + "StringLibrary", "LoadTables", (ins, il) =>
            {
                int i = Bul(ins, k => Sabit(k) == 16 && k.Next.OpCode == OpCodes.Bne_Un, "LoadTables: 'dil != PD' karşılaştırması");
                var yukle = ins[i - 1];                                   // ldloc dil
                var kendiDosyasi = (Instruction)ins[i - 2].Operand;       // ble.un -> ToString() dalı
                if (yukle.OpCode != OpCodes.Ldloc || ins[i - 2].OpCode != OpCodes.Ble_Un || Sabit(ins[i - 3]) != 6)
                    throw new Hata("LoadTables: beklenen 'ldc 6; ble.un' deseni yok");
                il.InsertBefore(yukle, il.Create(OpCodes.Ldloc, (VariableDefinition)yukle.Operand));
                il.InsertBefore(yukle, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(yukle, il.Create(OpCodes.Beq, kendiDosyasi));
                return "dil == TR ise kendi dosyası (3 talimat)";
            });

            // 3. LocSelectionScreen..ctor: RU eklemesinden sonra _availableLocales.Add(TR).
            Duzenle(mod, "Timespinner.GameStateManagement.Screens.MainMenu.LocSelectionScreen", ".ctor", (ins, il) =>
            {
                var addler = ins.Where(k => k.OpCode == OpCodes.Callvirt && ((MethodReference)k.Operand).Name == "Add"
                    && ((MethodReference)k.Operand).DeclaringType.FullName.Contains(Loc + "ELanguageLocale")).ToList();
                var sabitler = addler.Select(k => Sabit(k.Previous)).ToList();
                if (string.Join(",", sabitler) != "0,1,2,3,4,5,6,7")
                    throw new Hata("LocSelectionScreen: dil listesi beklenen gibi değil: " + string.Join(",", sabitler));
                var son = addler.Last();
                var alanYukle = son.Previous.Previous;                    // ldfld _availableLocales
                if (alanYukle.OpCode != OpCodes.Ldfld || alanYukle.Previous.OpCode != OpCodes.Ldarg)
                    throw new Hata("LocSelectionScreen: 'ldarg 0; ldfld _availableLocales' deseni yok");
                var y1 = il.Create(OpCodes.Ldarg, (ParameterDefinition)alanYukle.Previous.Operand);
                var y2 = il.Create(OpCodes.Ldfld, (FieldReference)alanYukle.Operand);
                var y3 = il.Create(OpCodes.Ldc_I4, TR);
                var y4 = il.Create(OpCodes.Callvirt, (MethodReference)son.Operand);
                il.InsertAfter(son, y1); il.InsertAfter(y1, y2); il.InsertAfter(y2, y3); il.InsertAfter(y3, y4);
                return "listeye TR eklendi, RU'dan sonra (4 talimat)";
            });

            // 4. StatMaxUpToast..ctor: EN/PD dışındaki diller LocToastLatin atlasından çizilir; kare tabanı
            //    = dil sırası×3 (FR0 DE1 ES2 BP3 RU4), tür ekler (Health +0, Aura +1, Sand +2). TR switch'te yok,
            //    varsayılan sıra 0 = Fransızca resim. Taban yazıldıktan hemen sonra: dil == TR ise taban 15
            //    (kare 15-17, tools/bildirim.mjs ekler). Switch dalları tabanın hesabına (ldloc sıra) atladığı
            //    için ekleme hesabın önüne değil, 'stloc taban' ile ardındaki br'nin arasına konur.
            Duzenle(mod, "Timespinner.GameStateManagement.Screens.InGame.Toasts.StatMaxUpToast", ".ctor", (ins, il) =>
            {
                int i = Bul(ins, k => k.OpCode == OpCodes.Call && ((MethodReference)k.Operand).Name == "get_CurrentLocale", "StatMaxUpToast: get_CurrentLocale");
                var dilYaz = ins[i + 1];                                  // stloc dil
                int m = Bul(ins, k => k.OpCode == OpCodes.Mul && Sabit(k.Previous) == 3, "StatMaxUpToast: 'ldc 3; mul'");
                var tabanYaz = ins[m + 1];                                // stloc taban
                var sonraki = ins[m + 2];                                 // br -> tür seçimi
                if (dilYaz.OpCode != OpCodes.Stloc || tabanYaz.OpCode != OpCodes.Stloc || sonraki.OpCode != OpCodes.Br)
                    throw new Hata("StatMaxUpToast: beklenen 'stloc dil' ve 'ldc 3; mul; stloc; br' deseni yok");
                if (ins.Any(k => k.Operand == sonraki)) throw new Hata("StatMaxUpToast: br'ye atlayan dal var, ekleme atlanır");
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldloc, (VariableDefinition)dilYaz.Operand));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(sonraki, il.Create(OpCodes.Bne_Un, sonraki));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_I4, TR_TOAST_TABAN));
                il.InsertBefore(sonraki, il.Create(OpCodes.Stloc, (VariableDefinition)tabanYaz.Operand));
                return "TR ise LocToastLatin kare tabanı " + TR_TOAST_TABAN + " (5 talimat)";
            });

            // 5. PlatformHelper.GuessLocale: yalnız dil hiç seçilmemişken çağrılır (ScreenManager.OnLoadConfigFile,
            //    HasPickedLocale=false). Steam dili yerele yazıldıktan hemen sonra: if (dil == "turkish") return TR;
            //    Oyunun switch'i dize özetiyle (ComputeStringHash) dallanıyor; araya case eklemek yerine önüne tek sınama.
            Duzenle(mod, "Timespinner.PlatformHelper", "GuessLocale", (ins, il) =>
            {
                int i = Bul(ins, k => k.OpCode == OpCodes.Call && ((MethodReference)k.Operand).Name == "GetCurrentGameLanguage", "GuessLocale: GetCurrentGameLanguage");
                var yaz = ins[i + 1];                                     // stloc dil
                var esit = ins.FirstOrDefault(k => k.OpCode == OpCodes.Call && ((MethodReference)k.Operand).Name == "op_Equality"
                    && ((MethodReference)k.Operand).DeclaringType.FullName == "System.String");
                if (yaz.OpCode != OpCodes.Stloc || esit == null)
                    throw new Hata("GuessLocale: beklenen 'call GetCurrentGameLanguage; stloc' deseni ya da string::op_Equality yok");
                if (ins.Any(k => k.OpCode == OpCodes.Ldstr && (string)k.Operand == "turkish"))
                    throw new Hata("GuessLocale: \"turkish\" zaten var (oyun Türkçeyi kendisi tanıyor olabilir)");
                var sonraki = yaz.Next;
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldloc, (VariableDefinition)yaz.Operand));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldstr, "turkish"));
                il.InsertBefore(sonraki, il.Create(OpCodes.Call, (MethodReference)esit.Operand));
                il.InsertBefore(sonraki, il.Create(OpCodes.Brfalse, sonraki));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ret));
                return "Steam dili turkish ise TR (6 talimat)";
            });

            // 6. GCM.LoadLocalizedContent: bölge başlığı atlası dile göre seçilir (switch dil-1: BP ... RU), TR
            //    switch'te yok, varsayılan dal İngilizce 'AreaTitles'. Varsayılan daldaki ldstr'ın önüne:
            //    dil == TR ise 'AreaTitles_TR' (tools/baslik-ciz.mjs üretir, TextureDatabase'e kaydı eklenir).
            Duzenle(mod, "Timespinner.GameAbstractions.GCM", "LoadLocalizedContent", (ins, il) =>
            {
                int i = Bul(ins, k => k.OpCode == OpCodes.Ldstr && (string)k.Operand == BASLIK, "LoadLocalizedContent: ldstr \"" + BASLIK + "\"");
                var dilYukle = ins[0];
                if (dilYukle.OpCode != OpCodes.Ldarg || ((ParameterDefinition)dilYukle.Operand).Name != "locale" || ins[2].OpCode != OpCodes.Sub || ins[3].OpCode != OpCodes.Switch)
                    throw new Hata("LoadLocalizedContent: beklenen 'ldarg locale; ldc 1; sub; switch' başı yok");
                if (ins.Any(k => k.OpCode == OpCodes.Ldstr && (string)k.Operand == BASLIK + "_TR"))
                    throw new Hata("LoadLocalizedContent: \"" + BASLIK + "_TR\" zaten var");
                var ingilizce = ins[i];
                var sonraki = ingilizce.Next;                             // ldarg localizedContent
                if (ins.Any(k => k.Operand == ingilizce) || sonraki.OpCode != OpCodes.Ldarg)
                    throw new Hata("LoadLocalizedContent: ldstr'a atlayan dal var ya da ardından ldarg gelmiyor");
                il.InsertBefore(ingilizce, il.Create(OpCodes.Ldarg, (ParameterDefinition)dilYukle.Operand));
                il.InsertBefore(ingilizce, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(ingilizce, il.Create(OpCodes.Bne_Un, ingilizce));
                il.InsertBefore(ingilizce, il.Create(OpCodes.Ldstr, BASLIK + "_TR"));
                il.InsertBefore(ingilizce, il.Create(OpCodes.Br, sonraki));
                return "TR ise " + BASLIK + "_TR (5 talimat)";
            });

            // 7. CharacterLevelUpToast.Update: seviye atlama yazısı (LevelUp atlasında kare 3-6, 84 geniş) Türkçede
            //    128 genişlikte yeni karelerden çizilir (tools/seviye.mjs), çizim noktası genişliğin yarısıdır:
            //    oyunun (42,10)'u 84 içindi. Kare 3 ve sonrasında oyun _textDrawOrigin'e LargeTextDrawOrigin yazıyor;
            //    o atamadan HEMEN SONRA: dil TR ve _animationIndex >= 3 ise _textDrawOrigin = new Vector2(64, 10).
            //    Kare 0-2 (14 geniş, küçük başlangıç parıltısı) dile bağlı değil, dokunulmaz.
            var locTuru = mod.GetType(Loc + "Loc");
            var dilOku = locTuru == null ? null : locTuru.Methods.FirstOrDefault(m => m.Name == "get_CurrentLocale" && m.IsStatic);
            if (dilOku == null) throw new Hata("Loc.get_CurrentLocale (statik) yok");
            Duzenle(mod, "Timespinner.GameStateManagement.Screens.InGame.Toasts.CharacterLevelUpToast", "Update", (ins, il) =>
            {
                int i = Bul(ins, k => k.OpCode == OpCodes.Stfld && ((FieldReference)k.Operand).Name == "_textDrawOrigin", "CharacterLevelUpToast.Update: stfld _textDrawOrigin");
                var yaz = ins[i];
                var sonraki = yaz.Next;
                var kare = ins.FirstOrDefault(k => k.OpCode == OpCodes.Ldfld && ((FieldReference)k.Operand).Name == "_animationIndex");
                // Vector2(float, float) kurucusu: aynı sınıfın .cctor'undaki newobj (yazı çizim noktaları orada kuruluyor)
                var tur = mod.GetType("Timespinner.GameStateManagement.Screens.InGame.Toasts.CharacterLevelUpToast");
                var vkurucu = tur.Methods.Single(m => m.IsConstructor && m.IsStatic).Body.Instructions
                    .Where(k => k.OpCode == OpCodes.Newobj && ((MethodReference)k.Operand).DeclaringType.Name == "Vector2"
                        && ((MethodReference)k.Operand).Parameters.Count == 2).Select(k => (MethodReference)k.Operand).FirstOrDefault();
                if (sonraki == null || kare == null || vkurucu == null)
                    throw new Hata("CharacterLevelUpToast.Update: _animationIndex alanı, sonraki talimat ya da Vector2 kurucusu bulunamadı");
                if (ins.Any(k => k.Operand == sonraki)) throw new Hata("CharacterLevelUpToast.Update: stfld'den sonrasına atlayan dal var, ekleme atlanır");
                il.InsertBefore(sonraki, il.Create(OpCodes.Call, dilOku));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(sonraki, il.Create(OpCodes.Bne_Un, sonraki));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldarg_0));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldfld, (FieldReference)kare.Operand));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_I4, SEVIYE_BUYUK_ILK));
                il.InsertBefore(sonraki, il.Create(OpCodes.Blt, sonraki));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldarg_0));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_R4, SEVIYE_CIZIM_X));
                il.InsertBefore(sonraki, il.Create(OpCodes.Ldc_R4, SEVIYE_CIZIM_Y));
                il.InsertBefore(sonraki, il.Create(OpCodes.Newobj, vkurucu));
                il.InsertBefore(sonraki, il.Create(OpCodes.Stfld, (FieldReference)yaz.Operand));
                return "TR ve kare >= " + SEVIYE_BUYUK_ILK + " ise çizim noktası (" + SEVIYE_CIZIM_X + "," + SEVIYE_CIZIM_Y + ") (12 talimat)";
            });

            // 8. CharacterLevelUpToast.DrawToastContent: yazının karesi GetFrameSource(_animationIndex) ile seçilir
            //    (iki çağrıdan SON olan; ilki alt çerçeve, kare 7). Argümanın ardından: dil TR ve kare >= 3 ise
            //    kare += (yeni ilk kare - 3): kare 3-6 → 34-37 (tools/icerik.mjs LevelUp'a ekler, tools/seviye.mjs çizer).
            //    Yığın: argüman yığında kalır; 'dup; ldc 3; blt' kopyayı tüketir, sonuç tek değer.
            Duzenle(mod, "Timespinner.GameStateManagement.Screens.InGame.Toasts.CharacterLevelUpToast", "DrawToastContent", (ins, il) =>
            {
                int i = Bul(ins, k => (k.OpCode == OpCodes.Call || k.OpCode == OpCodes.Callvirt) && ((MethodReference)k.Operand).Name == "GetFrameSource"
                    && k.Previous != null && k.Previous.OpCode == OpCodes.Ldfld && ((FieldReference)k.Previous.Operand).Name == "_animationIndex",
                    "CharacterLevelUpToast.DrawToastContent: GetFrameSource(_animationIndex)");
                var cagri = ins[i];
                if (ins.Count(k => (k.OpCode == OpCodes.Call || k.OpCode == OpCodes.Callvirt) && ((MethodReference)k.Operand).Name == "GetFrameSource") != 2)
                    throw new Hata("CharacterLevelUpToast.DrawToastContent: GetFrameSource çağrısı 2 değil (oyun güncellenmiş olabilir)");
                if (ins.Any(k => k.Operand == cagri)) throw new Hata("CharacterLevelUpToast.DrawToastContent: çağrıya atlayan dal var, ekleme atlanır");
                il.InsertBefore(cagri, il.Create(OpCodes.Call, dilOku));
                il.InsertBefore(cagri, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(cagri, il.Create(OpCodes.Bne_Un, cagri));
                il.InsertBefore(cagri, il.Create(OpCodes.Dup));
                il.InsertBefore(cagri, il.Create(OpCodes.Ldc_I4, SEVIYE_BUYUK_ILK));
                il.InsertBefore(cagri, il.Create(OpCodes.Blt, cagri));
                il.InsertBefore(cagri, il.Create(OpCodes.Ldc_I4, SEVIYE_TR_ILK - SEVIYE_BUYUK_ILK));
                il.InsertBefore(cagri, il.Create(OpCodes.Add));
                return "TR ve kare >= " + SEVIYE_BUYUK_ILK + " ise kare + " + (SEVIYE_TR_ILK - SEVIYE_BUYUK_ILK) + " (8 talimat)";
            });

            // 9. PauseMenuScreen.DrawCharacters: seviye etiketi base.Sprite.GetFrameSource(118) ("LV.").
            //    Metotta 8 GetFrameSource çağrısı var; argümanı sabit 118 olan TAM BİR tane (rakamlar 119 + _levelDigit
            //    ile çizilir, dokunulmaz). Çağrının hemen önüne: dil TR ise argümanı at, 157 koy.
            //    Yığın: [Sprite, 118] → TR'de 'pop; ldc 157' → [Sprite, 157]; TR değilse atlanır, 118 kalır.
            //    (Duzenle kısa biçimleri açar: ldc.i4.s 118 burada ldc.i4 118 görünür.)
            Duzenle(mod, "Timespinner.GameStateManagement.Screens.PauseMenu.PauseMenuScreen", "DrawCharacters", (ins, il) =>
            {
                int i = Bul(ins, k => (k.OpCode == OpCodes.Call || k.OpCode == OpCodes.Callvirt) && ((MethodReference)k.Operand).Name == "GetFrameSource"
                    && Sabit(k.Previous) == PAUSE_LV_KARE,
                    "PauseMenuScreen.DrawCharacters: GetFrameSource(" + PAUSE_LV_KARE + ")");
                var cagri = ins[i];
                if (ins.Any(k => k.Operand == cagri)) throw new Hata("PauseMenuScreen.DrawCharacters: çağrıya atlayan dal var, ekleme atlanır");
                il.InsertBefore(cagri, il.Create(OpCodes.Call, dilOku));
                il.InsertBefore(cagri, il.Create(OpCodes.Ldc_I4, TR));
                il.InsertBefore(cagri, il.Create(OpCodes.Bne_Un, cagri));
                il.InsertBefore(cagri, il.Create(OpCodes.Pop));
                il.InsertBefore(cagri, il.Create(OpCodes.Ldc_I4, PAUSE_SV_KARE));
                return "TR ise kare " + PAUSE_LV_KARE + " yerine " + PAUSE_SV_KARE + " (5 talimat)";
            });
        }
        catch (Hata h) { Console.Error.WriteLine("DURDU: " + h.Message + " (hiçbir şey yazılmadı)"); return 3; }

        asm.Write(cikti);
        Console.WriteLine("yazıldı: " + cikti + " (" + new FileInfo(cikti).Length + " bayt; girdi " + new FileInfo(girdi).Length + ")");
        return 0;
    }

    class Hata : Exception { public Hata(string m) : base(m) { } }

    static int Sabit(Instruction k)
    {
        return k != null && k.OpCode == OpCodes.Ldc_I4 ? (int)k.Operand : int.MinValue;
    }

    static int Bul(Mono.Collections.Generic.Collection<Instruction> ins, Func<Instruction, bool> kosul, string ne)
    {
        var bulunan = Enumerable.Range(0, ins.Count).Where(j => kosul(ins[j])).ToList();
        if (bulunan.Count != 1) throw new Hata(ne + ": " + bulunan.Count + " eşleşme (1 bekleniyordu)");
        return bulunan[0];
    }

    // Kısa biçimleri açar (ldc.i4.6 -> ldc.i4 6, ble.un.s -> ble.un), değiştirir, yeniden kısaltır:
    // eklenen baytlar kısa dalların menzilini aşarsa Cecil uzun biçimi kendisi seçer.
    static void Duzenle(ModuleDefinition mod, string tur, string metot, Func<Mono.Collections.Generic.Collection<Instruction>, ILProcessor, string> is_)
    {
        var t = mod.GetType(tur);
        if (t == null) throw new Hata(tur + " türü yok");
        var ms = t.Methods.Where(m => m.Name == metot && m.HasBody).ToList();
        if (ms.Count != 1) throw new Hata(tur + "::" + metot + ": " + ms.Count + " metot (1 bekleniyordu)");
        var g = ms[0].Body;
        int once = g.Instructions.Count;
        g.SimplifyMacros();
        string sonuc = is_(g.Instructions, g.GetILProcessor());
        g.OptimizeMacros();
        Console.WriteLine("  " + t.Name + "::" + metot + ": " + sonuc + "  [" + once + " -> " + g.Instructions.Count + " talimat]");
    }
}
