# LINGORA Web

LINGORA web uygulamasının başlangıç projesi. Next.js App Router, React,
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
git diff --check
```

## Dosya yapısı

- `src/app/page.tsx`: sade LINGORA başlangıç sayfası.
- `src/app/layout.tsx`: Türkçe root layout ve metadata.
- `src/app/globals.css`: temel CSS reset, font ve renkler.
- `src/app/page.module.css`: başlangıç sayfasının spacing ve metin stilleri.
- `next.config.ts`: Next.js yapılandırması.
- `tsconfig.json`: strict TypeScript ve `@/*` alias.
- `eslint.config.mjs`: Next.js ve TypeScript lint kuralları.
- `package-lock.json`: npm bağımlılık kilidi.

Git deposu bu uygulama klasöründedir. Üst klasördeki `../docs/` proje planlarını
içerir ve uygulama deposunun kapsamı dışındadır. Mevcut baseline yalnızca
başlangıç sayfasını içerir; önceki 07.x planları uygulanmış özelliklerin kanıtı
olarak kullanılmaz.

## Design system foundation

Semantic renk, spacing, radius, tipografi, focus ve minimum etkileşim hedefi
tokenları `src/app/globals.css` içinde tanımlıdır. Primary renk `#4F46E5`,
container üst sınırı `1120px`, tek layout breakpoint'i `1024px` değerindedir.
Spacing değerleri varsayılan 16px kök boyutunda 4/8/12/16/20/24/32/48/64px'e
karşılık gelen `rem` birimleriyle tanımlıdır. Tipografi 28/20/16/14px ölçeği,
400/500/600 ağırlıkları ve birimsiz satır yüksekliklerini kullanır.

Font stratejisi `Inter, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif` fallback zinciridir. `next/font/google` ile Inter'in
400/500/600 ağırlıkları denenmiş, build sırasında Google Fonts bağlantısı
başarısız olduğu için harici font indirme bağımlılığı kaldırılmıştır. Inter
cihazda kuruluysa kullanılır; kurulu değilse sistem fontu kullanılır.

`.container` helper'ı responsive yatay padding ve merkezleme sağlar.
`--interaction-target-min` gelecekteki etkileşimli öğeler için varsayılan
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
Baseline ana sayfa yalnız mevcut LINGORA başlığı ve açıklamasını içerir.
