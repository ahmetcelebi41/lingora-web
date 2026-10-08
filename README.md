# LINGORA Web

LINGORA, İngilizce ve Türkçe arasında metin çevirisi ve İngilizce sesli okuma
sunan tarayıcı uygulamasıdır. Next.js App Router, React,
TypeScript strict mode ve ESLint kullanır. Sayfa ve root layout varsayılan
Server Components olarak çalışır; stiller native CSS ile tanımlıdır.

## Geliştirme

Node.js 24 LTS ve npm kullanın. Komutları `lingora-web/` içinde çalıştırın:

```sh
npm ci
npm run dev
```

Ana sayfa: <http://localhost:3000>

Windows PowerShell execution policy npm betiğini engelliyorsa `npm.cmd`
ve `npx.cmd` giriş noktalarını kullanabilirsiniz.

## Kalite kontrolü

```sh
npm run lint
npx tsc --noEmit
npm run build
node --test tests/*.test.cjs
git diff --check
```

## Dosya yapısı

- `src/app/page.tsx`: LINGORA ana çeviri ekranı.
- `src/app/layout.tsx`: Türkçe root layout ve metadata.
- `src/app/globals.css`: temel CSS reset, font ve renkler.
- `src/app/page.module.css`: başlangıç sayfasının spacing ve metin stilleri.
- `next.config.ts`: Next.js yapılandırması.
- `tsconfig.json`: strict TypeScript ve `@/*` alias.
- `eslint.config.mjs`: Next.js ve TypeScript lint kuralları.
- `package-lock.json`: npm bağımlılık kilidi.

Git deposu bu uygulama klasöründedir. Üst klasördeki `../docs/` proje planlarını
içerir ve uygulama deposunun kapsamı dışındadır. Uygulanan özellikler kaynak
kod ve gerçek QA sonuçları üzerinden doğrulanır.

## Design system foundation

Semantic renk, spacing, radius, tipografi, focus ve minimum etkileşim hedefi
tokenları `src/app/globals.css` içinde tanımlıdır. Primary renk `#4F46E5`,
container üst sınırı `1120px`, tek layout breakpoint'i `1024px` değerindedir.
Spacing değerleri varsayılan 16px kök boyutunda 4/8/12/16/20/24/32/48/64px'e
karşılık gelen `rem` birimleriyle tanımlıdır. Tipografi 28/20/16/14px ölçeği,
400/500/600 ağırlıkları ve birimsiz satır yüksekliklerini kullanır.

Font stratejisi `Inter, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif` fallback zinciridir. Inter cihazda kuruluysa kullanılır;
kurulu değilse sistem fontu kullanılır. Harici webfont indirilmez.

`.container` helper'ı responsive yatay padding ve merkezleme sağlar.
`--interaction-target-min` etkileşimli öğeler için varsayılan
44px hedefini tanımlar. Global `:focus-visible` 2px outline ve 2px offset
kullanır; reduced-motion tercihi animation/transition sürelerini azaltır
ve smooth scroll'u kapatır. Sayfa ve layout Server Components olarak kalır.

## UI primitives

Bileşenler ve prop tipleri `@/components/ui` üzerinden import edilir:

- `Button`: primary/secondary/ghost; varsayılan `type="button"`.
  `loading` native disabled ve `aria-busy` uygular; `loadingText` değiştirilebilir.
- `Textarea`: zorunlu `id` ve `label`; helper/error metni, native disabled,
  readOnly ve yalnız dikey resize desteği.
- `Select`: zorunlu `id` ve `label`; native option children, helper/error
  metni ve disabled desteği.
- `IconButton`: zorunlu `aria-label`; dekoratif icon/children, varsayılan
  ghost variant ve güvenli button type. Button primitive'ini kullanır.
- `StatusMessage`: info/success/warning/error; renk dışında görünür durum
  etiketi. Varsayılan live region/alert yoktur; caller `role` ve `aria-live`
  gibi native props ile duyuru davranışını belirler.

Textarea/Select `id` değerleri sayfada benzersiz olmalı; `${id}-helper` ve
`${id}-error` değerleri açıklama düğümleri için ayrılmıştır. Caller'ın mevcut
`aria-describedby` referansları korunur; error text olduğunda `aria-invalid`
ve hata açıklaması otomatik ilişkilendirilir. Whitespace açıklamalar atlanır.

CSS Modules mevcut semantic tokenları ve global focus-visible stilini kullanır.
Button/IconButton minimum 44×44px; primary CTA minimum 48px yüksekliğindedir.
Form control'ları dar alanda yüzde 100 genişliğe uyarlanır. Bileşenler state,
hook veya browser API kullanmaz; Server Component uyumludur. Event handler
gereken kullanımda client boundary'yi çağıran etkileşimli katman belirler.
Primitive'ler translator UI tarafından yeniden kullanılır.

## App shell

`src/components/layout/AppShell.tsx` page seviyesinde kullanılır; root layout
metadata, html/body ve global CSS sorumluluklarını korur. AppShell bir native
header ve bir native main üretir. Header'daki LINGORA wordmark'ı heading
değildir; ana sayfanın tek `h1` öğesi main içinde kalır.

Header ve main aynı global `.container` helper'ını kullanır. Kabuk minimum
viewport yüksekliğinde, içerik büyüdükçe uzayan bir flex yapıdır; header veya
main üzerinde içerik kesen sabit yükseklik bulunmaz. Spacing ve renkler mevcut
semantic tokenlardan gelir.

AppShell'in isteğe bağlı `workspace` prop'u çeviri panelleri için grid
slotudur. Verilmediğinde slot markup'ı veya placeholder gösterilmez. Slot
1024px ve altında tek kolon, 1024px üzerinde iki eşit `minmax(0, 1fr)` kolon
sağlar; kolon aralığı 24px tokenıdır. Slot ve çocukları `min-inline-size: 0`
ile dar alana uyarlanır. Bileşenlerde state, hook veya client boundary yoktur.

## Translator UI

`src/components/translator/Translator.tsx` AppShell'in workspace slotunda
kaynak ve sonuç panellerini sunar. Mevcut workspace grid'i 1024px ve altında tek,
desktop'ta iki eşit kolon sağlar. Swap kontrolü mobilde panellerin arasında,
desktop'ta kolon aralığında yer alır. Paneller aynı surface/border/radius ve
spacing tokenlarını, textarea'lar aynı minimum yüksekliği kullanır. Panel
yüksekliği sabit değildir; aksiyonlar dar alanda wrap olur.

Translator bir Client Component'tir. Dil seçicileri ve kaynak metin React
state'iyle yönetilir; başlangıç yönü İngilizce (`en`) → Türkçe (`tr`) olur.
Kaynak textarea düzenlenebilir, sonuç textarea readOnly'dir. Kaynak trim
sonrası dolu, diller farklı ve yükleme yoksa Çevir aktiftir. Çeviri sırasında
Çevir, dil seçicileri, swap ve temizleme devre dışıdır. Kaynak veya dil
değişiklikleri bekleyen sonucu geçersiz kılar; success/error sonrasında CTA
yeniden kullanılabilir. Sonuç varsa ve yükleme yoksa Kopyala aktiftir; sonucu
değiştirmeden Clipboard API ile panoya yazar ve 1,8 saniye Kopyalandı gösterir.
Clipboard hatası ayrı bir kullanıcı dostu mesajla gösterilir.

Dinle/Durdur browser-native Web Speech API ile EN→TR için İngilizce kaynak,
TR→EN için İngilizce sonuç metnini okur (lang en-US, rate 0.9, pitch 1, volume 1).
“İngilizce ses” ile sistem sesi seçilebilir; seçim browser localStorage’da
(`lingora.tts.voice`) saklanır. Seslerin kullanılabilirliği OS/browser’a bağlıdır.
Otomatik mod önce en-US, sonra diğer İngilizce sesleri tercih eder; uygun ses
veya kayıtlı seçim bulunamazsa otomatik/browser fallback kullanılır.
Boş metin, çeviri yüklemesi veya API desteği yoksa Dinle
devre dışıdır; Durdur yalnız okuma sırasında aktiftir. Metin/dil değişimi,
temizleme, swap, yeni çeviri ve unmount aktif okumayı iptal eder. Sesli okuma
hataları translation/copy durumundan ayrı bir kullanıcı dostu mesajla gösterilir.

## Browser-side translation

EN→TR primary provider tarayıcının built-in Translator API'sidir. Global yoksa
veya EN→TR availability sonucu `unavailable` ise compatibility fallback olarak
`@huggingface/transformers@4.3.1` ile browser-local `Xenova/m2m100_418M`
kullanılır. `available`, `downloadable` ve
`downloading` built-in yolundadır. Fallback modelinin kalitesi built-in modelle
aynı kabul edilmez; desteklenmeyen tarayıcılarda temel çeviri modu kullanılır.
TR→EN browser-local `Xenova/opus-mt-tr-en` kullanır. Tarayıcı desteği değişebilir.

API key, backend veya harici translation API yoktur; metin browser içinde işlenir
ve console'a loglanmaz. İlk kullanımda browser-managed model hazırlığı/indirmesi
gerekebilir; fallback/TR→EN model ve runtime asset'leri de ağ üzerinden alınır.
Build/SSR sırasında model initialize edilmez. Built-in create ilk Çevir tıklamasının
doğrudan çağrı zincirindedir; hazır instance tekrar kullanılır ve son UI unmount'ta
temizlenir. Ham çeviri çıktısı düzeltilmez veya yeniden yazılmaz.

Hazırlıkta `Model hazırlanıyor… İlk kullanım biraz sürebilir.`, inference
sırasında `Çevriliyor…` erişilebilir durum alanında gösterilir. Sahte yüzde,
progress bar veya kalan süre yoktur. Built-in availability/izin/create/download/
inference hataları sessiz fallback yapmaz; kullanıcı dostu hata gösterilir ve
kullanıcı yeniden Çevir ile deneyebilir. Otomatik retry yoktur.

## Static hosting

`next.config.ts` içindeki `output: "export"`, `npm run build` ile `out/`
klasörüne statik HTML/CSS/JS ve yerel favicon üretir. Production HTTPS
kullanır; Next.js server veya translation backend gerekmez. `out/` statik host
tarafından servis edilir; `next start` kullanılmaz.

V1.0 hosting hedefi GitHub Pages Free'dir; public repository gerekir.
Repository Settings → Pages → Source, `GitHub Actions` olarak seçilmelidir.
`.github/workflows/deploy-pages.yml`, final QA sonrasında `main` üzerinden
manuel başlatılır; push otomatik deploy yapmaz. Workflow Node.js 24 ile
`npm ci`, test/lint/typecheck ve `npm run build` çalıştırır; `out/` artifact'ini
resmi GitHub Pages actions ile yayımlar. Özel secret/API key/npm token gerekmez.

Repository `ahmetcelebi41/lingora-web`, project site adresi
`https://ahmetcelebi41.github.io/lingora-web/` olacaktır. Workflow, gerçek
Pages metadata'sındaki `base_path` değerini
`GITHUB_PAGES_BASE_PATH` ile build'e aktarır; repo adı hard-code edilmez.
`basePath` JS/CSS, lazy runtime ve favicon yollarını kapsar; ayrıca `assetPrefix`
kullanılmaz. `npm run dev` bu değişken set edilse bile kökte çalışır. Yerel
`npm run build`, değişken verilmezse root export üretir; subpath preview için
değişkene gerçek Pages base path verilerek yeniden build alınmalıdır.

26.861.777 byte ONNX WASM dosyası export artifact'inde korunur; runtime/model
kaynakları değiştirilmez. Gerçek deploy kontrolü henüz yapılmamıştır.
