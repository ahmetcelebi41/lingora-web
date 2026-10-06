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
- `next.config.ts`: Next.js yapılandırması.
- `tsconfig.json`: strict TypeScript ve `@/*` alias.
- `eslint.config.mjs`: Next.js ve TypeScript lint kuralları.
- `package-lock.json`: npm bağımlılık kilidi.

Git deposu bu uygulama klasöründedir. Üst klasördeki `../docs/` proje planlarını
içerir ve uygulama deposunun kapsamı dışındadır. Mevcut baseline yalnızca
başlangıç sayfasını içerir; önceki 07.x planları uygulanmış özelliklerin kanıtı
olarak kullanılmaz.
