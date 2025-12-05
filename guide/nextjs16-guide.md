## Metadata API - SEO e Meta Tags

Next.js 16 offre una potente **Metadata API** per definire i metadati dell'applicazione, migliorando la SEO e la condivisibilità sui social media. I metadati vengono automaticamente inseriti negli elementi `<head>` delle pagine.

### Tipi di Metadata

Esistono due approcci per definire i metadata:

1. **Config-based**: Oggetto `metadata` statico o funzione `generateMetadata` dinamica
2. **File-based**: File speciali come `favicon.ico`, `opengraph-image.jpg`, `robots.txt`, `sitemap.xml`

### Metadata Statico

Per metadata che non cambiano tra richieste, esporta un oggetto `Metadata` da un file `layout.tsx` o `page.tsx`:

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Next.js App',
  description: 'An awesome Next.js 16 application',
  keywords: ['Next.js', 'React', 'TypeScript', 'SEO'],
  authors: [{ name: 'Your Name', url: 'https://yoursite.com' }],
  creator: 'Your Name',
  publisher: 'Your Company',
  
  // Open Graph (social media)
  openGraph: {
    title: 'My Next.js App',
    description: 'An awesome Next.js 16 application',
    url: 'https://yoursite.com',
    siteName: 'My Next.js App',
    images: [
      {
        url: 'https://yoursite.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'My Next.js App',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'My Next.js App',
    description: 'An awesome Next.js 16 application',
    creator: '@yourusername',
    images: ['https://yoursite.com/twitter-image.jpg'],
  },
  
  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  // Icons
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  
  // Manifest
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### Metadata Dinamico con generateMetadata

Per metadata che dipendono da dati dinamici (route params, database, API), usa la funzione `generateMetadata`:

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// 🆕 In Next.js 16, params è asincrono
export async function generateMetadata(
  { params, searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  // Await params (Next.js 16)
  const { slug } = await params;
  
  // Fetch dati del post
  const post = await fetch(`https://api.example.com/posts/${slug}`).then(
    (res) => res.json()
  );
  
  // Accesso ai metadata del parent (opzionale)
  const previousImages = (await parent).openGraph?.images || [];
  
  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage, ...previousImages],
      publishedTime: post.publishedAt,
      authors: [post.author.name],
    },
    
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = await fetch(`https://api.example.com/posts/${slug}`).then(
    (res) => res.json()
  );
  
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

**Parametri di `generateMetadata`:**

- **`params`**: Oggetto (asincrono) contenente i parametri della route dinamica
- **`searchParams`**: Oggetto (asincrono) con i query parameters dell'URL
- **`parent`**: Promise dei metadata risolti dai segmenti parent

### Template per i Titoli

Usa `title.template` per definire un template per i titoli delle pagine:

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | My Next.js App',
    default: 'My Next.js App',
  },
  description: 'An awesome Next.js application',
};
```

```tsx
// app/about/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About', // Diventa: "About | My Next.js App"
};

export default function AboutPage() {
  return <h1>About Us</h1>;
}
```

**Risultato:**
- `/` → "My Next.js App" (default)
- `/about` → "About | My Next.js App"
- `/blog/my-post` → "My Post | My Next.js App"

### 🆕 Streaming Metadata (Next.js 16)

Next.js 16 introduce lo **streaming metadata**, che migliora le performance permettendo di inviare l'UI iniziale al browser senza attendere il completamento di `generateMetadata`.

**Come Funziona:**

1. Il browser riceve immediatamente lo static shell
2. Quando `generateMetadata` si risolve, i meta tag vengono aggiunti al `<body>`
3. I bot che eseguono JavaScript (es. Googlebot) interpretano correttamente i metadata
4. I bot limitati all'HTML (es. Facebook) continuano a bloccare il rendering

**Configurazione per Bot HTML-Limited:**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Override della lista User Agent per bot HTML-limited
  htmlLimitedBots: /.*/,  // Tutti i bot (esempio)
};

module.exports = nextConfig;
```

**Vantaggi:**
- ⚡ Riduce il Time To First Byte (TTFB)
- 📊 Può migliorare il Largest Contentful Paint (LCP)
- 🎯 Migliore perceived performance

### Evitare Fetch Duplicati con React cache()

Se hai bisogno di fetchare gli stessi dati sia per i metadata che per la pagina, usa `cache()` di React per memoizzare la funzione:

```tsx
// lib/data/posts.ts
import { cache } from 'react';
import { db } from '@/lib/db';

// getPost verrà chiamato più volte ma eseguito una sola volta
export const getPost = cache(async (slug: string) => {
  const post = await db.query.posts.findFirst({
    where: (posts, { eq }) => eq(posts.slug, slug),
  });
  return post;
});
```

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { getPost } from '@/lib/data/posts';

type Props = {
  params: Promise<{ slug: string }>;
};

// Usa getPost nei metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug); // Prima chiamata
  
  return {
    title: post?.title || 'Post not found',
    description: post?.excerpt,
  };
}

// Usa getPost nella pagina (nessun fetch duplicato!)
export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug); // Seconda chiamata, ma cached!
  
  if (!post) {
    return <div>Post not found</div>;
  }
  
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

### Metadata Basati su File

Next.js supporta file speciali per i metadata che vengono serviti automaticamente:

#### Favicon e Icons

```
app/
├── favicon.ico          # Favicon principale
├── icon.png             # Icon generico
├── apple-icon.png       # Apple touch icon
└── icon.svg             # Icon SVG
```

**Icon Dinamici:**

```tsx
// app/icon.tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'black',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
        }}
      >
        A
      </div>
    ),
    {
      ...size,
    }
  );
}
```

#### Open Graph e Twitter Images

```
app/
├── opengraph-image.jpg    # OG image globale
└── blog/
    └── [slug]/
        ├── opengraph-image.jpg  # OG image per questo post
        └── twitter-image.jpg    # Twitter card image
```

**OG Image Dinamici:**

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Blog Post Cover';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// 🆕 Next.js 16: params è asincrono anche qui
export default async function Image({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  
  // Fetch dati del post
  const post = await fetch(`https://api.example.com/posts/${slug}`).then(
    (res) => res.json()
  );
  
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {post.title}
      </div>
    ),
    {
      ...size,
    }
  );
}
```

**Generare Multiple OG Images:**

```tsx
// app/blog/[slug]/opengraph-image.tsx

// 🆕 generateImageMetadata con params asincrono
export async function generateImageMetadata({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  
  return [
    { id: 'default', alt: `${slug} cover` },
    { id: 'dark', alt: `${slug} dark cover` },
  ];
}

// 🆕 id è ora Promise<string>
export default async function Image({ 
  params, 
  id 
}: { 
  params: Promise<{ slug: string }>; 
  id: Promise<string>;
}) {
  const { slug } = await params;
  const imageId = await id; // id è ora asincrono
  
  // Genera immagini diverse basate su imageId
  const isDark = imageId === 'dark';
  
  return new ImageResponse(
    (
      <div
        style={{
          background: isDark ? 'black' : 'white',
          color: isDark ? 'white' : 'black',
          // ... altri stili
        }}
      >
        {slug}
      </div>
    )
  );
}
```

#### robots.txt

```ts
// app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/private/', '/admin/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: '/api/',
      },
    ],
    sitemap: 'https://yoursite.com/sitemap.xml',
  };
}
```

#### sitemap.xml

```ts
// app/sitemap.ts
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch dynamic routes
  const posts = await fetch('https://api.example.com/posts').then((res) =>
    res.json()
  );
  
  const postEntries: MetadataRoute.Sitemap = posts.map((post: any) => ({
    url: `https://yoursite.com/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));
  
  return [
    {
      url: 'https://yoursite.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://yoursite.com/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...postEntries,
  ];
}
```

**Sitemap Multipli:**

```ts
// app/sitemap.ts
import { MetadataRoute } from 'next';

// Genera ID per sitemap multipli
export async function generateSitemaps() {
  return [
    { id: 'posts' },
    { id: 'products' },
    { id: 'categories' },
  ];
}

export default async function sitemap({
  id,
}: {
  id: string;
}): Promise<MetadataRoute.Sitemap> {
  // Genera sitemap basato sull'ID
  if (id === 'posts') {
    const posts = await fetchPosts();
    return posts.map((post) => ({
      url: `https://yoursite.com/blog/${post.slug}`,
      lastModified: post.updatedAt,
    }));
  }
  
  if (id === 'products') {
    // ... logica per products
  }
  
  return [];
}
```

### manifest.json

```ts
// app/manifest.ts
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Next.js App',
    short_name: 'Next App',
    description: 'An awesome Next.js 16 application',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
```

### Metadata Personalizzati

Per metadata non supportati nativamente, usa il campo `other`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  other: {
    'custom-tag': 'custom-value',
    'pinterest:id': '123456',
  },
};
```

Per array di valori:

```tsx
export const metadata: Metadata = {
  other: {
    'fb:admins': ['admin1', 'admin2'],
  },
};
```

### Best Practices per SEO

**1. Metadata Completi e Accurati**

```tsx
export const metadata: Metadata = {
  // ✅ Titolo descrittivo (50-60 caratteri)
  title: 'Learn Next.js 16 - Complete Guide for Beginners',
  
  // ✅ Description concisa (150-160 caratteri)
  description: 'Master Next.js 16 with our comprehensive guide. Learn App Router, Server Components, and modern React patterns.',
  
  // ✅ Keywords rilevanti (3-5)
  keywords: ['Next.js', 'React', 'Tutorial', 'Web Development'],
  
  // ✅ Open Graph completo
  openGraph: {
    title: 'Learn Next.js 16',
    description: 'Complete guide for beginners',
    images: [
      {
        url: 'https://yoursite.com/og-image.jpg',
        width: 1200,
        height: 630,
      },
    ],
  },
};
```

**2. Usa generateMetadata per Contenuti Dinamici**

```tsx
// ❌ Non usare metadata statico per contenuti dinamici
export const metadata: Metadata = {
  title: 'Blog Post', // Generico!
};

// ✅ Usa generateMetadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  return {
    title: post.title, // Specifico!
    description: post.excerpt,
  };
}
```

**3. Struttura Gerarchica dei Metadata**

```tsx
// app/layout.tsx - Metadata globali
export const metadata: Metadata = {
  title: {
    template: '%s | My Site',
    default: 'My Site',
  },
  description: 'Default description',
};

// app/blog/layout.tsx - Override per sezione blog
export const metadata: Metadata = {
  title: {
    template: '%s | Blog | My Site',
    default: 'Blog | My Site',
  },
};

// app/blog/[slug]/page.tsx - Metadata specifici del post
export async function generateMetadata({ params }: Props) {
  const post = await getPost(params.slug);
  return {
    title: post.title, // Usa il template del parent
  };
}
```

**4. Robots e Indexing**

```tsx
// ✅ Pagine pubbliche
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

// ✅ Pagine private/admin
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

// ✅ Pagine in development/preview
export const metadata: Metadata = {
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production',
  },
};
```

**5. Canonical URLs**

```tsx
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://yoursite.com/blog/post-slug',
  },
};
```

**6. Sitemap e Robots**

- Genera sempre un `sitemap.xml` dinamico
- Aggiorna la `lastModified` quando i contenuti cambiano
- Usa `robots.txt` per controllare il crawling

### 🆕 Caching dei Metadata Files (Next.js 16)

**Importante:** I metadata files speciali come `sitemap.ts`, `opengraph-image.tsx`, `icon.tsx` sono **cachati per default** in Next.js 16.

Se usi `proxy.ts`, devi escludere questi file:

```ts
// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // La tua logica di proxy
  return NextResponse.next();
}

export const config = {
  // ✅ Escludi i metadata files dal matcher
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image|twitter-image|icon).*)' 
  ],
};
```

## Image Optimization con next/image

Next.js include un componente `<Image>` ottimizzato che gestisce automaticamente:

- 🖼️ **Lazy loading**: Le immagini vengono caricate solo quando entrano nel viewport
- 📐 **Responsive images**: Genera automaticamente versioni ridimensionate
- 🎨 **Formato moderno**: Converte in WebP/AVIF se supportato
- 🔄 **Placeholder**: Mostra blur placeholder durante il caricamento
- ⚡ **Performance**: Previene Layout Shift (CLS)

### Utilizzo Base

```tsx
// components/ProductImage.tsx
import Image from 'next/image';

export function ProductImage() {
  return (
    <Image
      src="/product.jpg"
      alt="Product description"
      width={500}
      height={300}
      // priority - carica immediatamente (per immagini above-the-fold)
      // priority
    />
  );
}
```

### 🆕 Configurazione Predefinita in Next.js 16

In Next.js 16, il componente `<Image>` ha alcuni nuovi defaults:

```tsx
// Questi sono ora i defaults in Next.js 16
<Image
  src="/image.jpg"
  alt="Description"
  width={800}
  height={600}
  // 🆕 loading="lazy" è ora il default (prima era "eager")
  // 🆕 decoding="async" è ora il default
/>
```

### Immagini Esterne

Per usare immagini da domini esterni, configura `next.config.js`:

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example.com',
        port: '',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'api.unsplash.com',
      },
    ],
  },
};

module.exports = nextConfig;
```

```tsx
// Ora puoi usare immagini da questi domini
<Image
  src="https://cdn.example.com/images/photo.jpg"
  alt="External image"
  width={800}
  height={600}
/>
```

### Responsive Images con fill

Per immagini che devono riempire il container parent:

```tsx
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <Image
    src="/hero.jpg"
    alt="Hero image"
    fill
    style={{ objectFit: 'cover' }}
    priority
  />
</div>
```

### Sizes per Responsive Breakpoints

Usa `sizes` per ottimizzare il caricamento su diversi dispositivi:

```tsx
<Image
  src="/responsive.jpg"
  alt="Responsive image"
  width={1200}
  height={800}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

**Breakdown di `sizes`:**
- Mobile (≤768px): l'immagine occupa 100% della viewport
- Tablet (769-1200px): 50% della viewport
- Desktop (>1200px): 33% della viewport

Next.js genera automaticamente le versioni ottimizzate per ogni breakpoint.

### Placeholder Blur

Mostra una versione sfocata dell'immagine durante il caricamento:

```tsx
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Base64 image
/>
```

**Generare blurDataURL automaticamente:**

Per immagini locali (in `public/`), Next.js genera automaticamente il blur:

```tsx
import profilePic from '../public/me.jpg'; // Import statico

<Image
  src={profilePic}
  alt="Profile picture"
  placeholder="blur" // blurDataURL generato automaticamente
/>
```

Per immagini remote, usa una libreria come `plaiceholder`:

```bash
npm install plaiceholder sharp
```

```tsx
import { getPlaiceholder } from 'plaiceholder';

export async function generateMetadata({ params }: Props) {
  const post = await getPost(params.slug);
  const { base64 } = await getPlaiceholder(post.imageUrl);
  
  return {
    // ... metadata
  };
}

export default async function Page({ params }: Props) {
  const post = await getPost(params.slug);
  const { base64 } = await getPlaiceholder(post.imageUrl);
  
  return (
    <Image
      src={post.imageUrl}
      alt={post.title}
      width={800}
      height={600}
      placeholder="blur"
      blurDataURL={base64}
    />
  );
}
```

### Priority per Above-the-Fold Images

Usa `priority` per immagini visibili immediatamente:

```tsx
// Hero image, logo, o qualsiasi immagine above-the-fold
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1920}
  height={1080}
  priority // ⚡ Carica immediatamente, no lazy loading
/>
```

### Quality per Ottimizzazione

Controlla la qualità dell'immagine (1-100, default 75):

```tsx
<Image
  src="/high-quality.jpg"
  alt="High quality image"
  width={800}
  height={600}
  quality={90} // Maggiore qualità, file più grande
/>
```

### Loader Personalizzato

Per usare un CDN custom o un servizio di image optimization:

```js
// next.config.js
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
  },
};
```

```ts
// lib/image-loader.ts
export default function cloudflareLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const params = [`width=${width}`];
  if (quality) {
    params.push(`quality=${quality}`);
  }
  const paramsString = params.join(',');
  return `/cdn-cgi/image/${paramsString}/${src}`;
}
```

### Best Practices per Image Optimization

**1. Usa sempre width e height**

```tsx
// ✅ Corretto - previene Layout Shift
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
/>

// ❌ Evita - causa Layout Shift
<Image
  src="/photo.jpg"
  alt="Photo"
  fill
  // Senza dimensioni definite nel parent
/>
```

**2. Priority solo per Above-the-Fold**

```tsx
// ✅ Hero image - priority
<Image src="/hero.jpg" alt="Hero" width={1920} height={1080} priority />

// ✅ Immagini sotto la fold - lazy loading (default)
<Image src="/gallery1.jpg" alt="Gallery" width={400} height={300} />
<Image src="/gallery2.jpg" alt="Gallery" width={400} height={300} />
```

**3. Usa Placeholder per UX Migliore**

```tsx
// ✅ Con placeholder blur
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/..."
/>
```

**4. Ottimizza le Dimensioni**

```tsx
// ❌ Immagine troppo grande per il container
<div style={{ width: '300px' }}>
  <Image src="/huge-image.jpg" width={3000} height={2000} />
</div>

// ✅ Dimensioni appropriate con sizes
<div style={{ width: '300px', position: 'relative', height: '200px' }}>
  <Image
    src="/image.jpg"
    fill
    sizes="300px"
    style={{ objectFit: 'cover' }}
  />
</div>
```

**5. Formati Moderni Automatici**

Next.js serve automaticamente WebP/AVIF se il browser li supporta. Non serve configurazione!

## Font Optimization con next/font

Next.js 16 include un sistema di ottimizzazione dei font che:

- 📦 **Self-hosting automatico**: Scarica e self-hosta i font Google
- ⚡ **Zero Layout Shift**: Usa `font-display: swap` e size-adjust
- 🎯 **Performance**: Elimina richieste di rete extra
- 🔒 **Privacy**: Nessuna richiesta a Google Fonts in runtime

### Google Fonts

```tsx
// app/layout.tsx
import { Inter, Roboto_Mono } from 'next/font/google';

// Font principale
const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Come caricare il font
  variable: '--font-inter', // CSS variable (opzionale)
});

// Font monospace per code
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-mono',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**CSS Variables nel Tailwind:**

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
        mono: ['var(--font-roboto-mono)'],
      },
    },
  },
};
```

Ora puoi usare le classi Tailwind:

```tsx
<h1 className="font-sans">Titolo con Inter</h1>
<code className="font-mono">Codice con Roboto Mono</code>
```

### Font con Pesi Specifici

```tsx
import { Poppins } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700'], // Solo i pesi necessari
  style: ['normal', 'italic'], // Stili
  display: 'swap',
});
```

### Font con Preload

```tsx
import { Open_Sans } from 'next/font/google';

const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
  preload: true, // Default, precarica il font
  // preload: false, // Se vuoi disabilitare il preload
});
```

### Font Variabili

I font variabili offrono tutti i pesi in un unico file:

```tsx
import { Inter } from 'next/font/google';

// Inter è un variable font, supporta tutti i pesi da 100 a 900
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Uso con weight dinamico in CSS
<style jsx>{`
  .light { font-weight: 300; }
  .normal { font-weight: 400; }
  .bold { font-weight: 700; }
`}</style>
```

### Local Fonts

Per usare font custom locali:

```tsx
// app/layout.tsx
import localFont from 'next/font/local';

const myFont = localFont({
  src: [
    {
      path: '../public/fonts/MyFont-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/MyFont-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../public/fonts/MyFont-Italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-my-font',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={myFont.variable}>
      <body className={myFont.className}>{children}</body>
    </html>
  );
}
```

**Struttura dei File Font:**

```
public/
└── fonts/
    ├── MyFont-Regular.woff2
    ├── MyFont-Bold.woff2
    └── MyFont-Italic.woff2
```

### Font per Componenti Specifici

Non devi sempre applicare i font globalmente:

```tsx
// components/Hero.tsx
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
});

export function Hero() {
  return (
    <div className={playfair.className}>
      <h1>Beautiful Serif Title</h1>
      <p>This section uses Playfair Display</p>
    </div>
  );
}
```

### Fallback Fonts

Next.js genera automaticamente fallback fonts per prevenire layout shift:

```tsx
import { Roboto } from 'next/font/google';

const roboto = Roboto({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  // Next.js genera automaticamente:
  // font-family: '__Roboto_abc123', '__Roboto_Fallback_abc123';
});
```

**Fallback Custom:**

```tsx
const roboto = Roboto({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  fallback: ['system-ui', 'arial'], // Fallback personalizzati
});
```

### Adjustments per Ridurre Layout Shift

```tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: true, // Default, abilita size-adjust CSS
});
```

Next.js calcola automaticamente `size-adjust`, `ascent-override`, `descent-override` per il font fallback, minimizzando il layout shift.

### Font con Subset Multipli

Per supportare più lingue:

```tsx
import { Noto_Sans } from 'next/font/google';

const notoSans = Noto_Sans({
  subsets: ['latin', 'latin-ext', 'cyrillic'], // Multipli subset
  weight: ['400', '700'],
  display: 'swap',
});
```

### Best Practices per Font Optimization

**1. Usa Variable Fonts quando Possibile**

```tsx
// ✅ Variable font - un file per tutti i pesi
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });

// ❌ Font statico - un file per ogni peso
import { Roboto } from 'next/font/google';
const roboto = Roboto({ 
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'] 
});
```

**2. Carica Solo i Pesi Necessari**

```tsx
// ✅ Solo i pesi usati
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '700'], // Solo regular e bold
});

// ❌ Tutti i pesi (file più grandi)
const inter = Inter({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
});
```

**3. Usa Subset Appropriati**

```tsx
// ✅ Solo subset necessari
const inter = Inter({
  subsets: ['latin'], // Solo caratteri latini
});

// ❌ Subset non necessari
const inter = Inter({
  subsets: ['latin', 'cyrillic', 'greek', 'vietnamese'], // Troppi!
});
```

**4. Preload per Font Critici**

```tsx
// ✅ Font principale - preload
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true, // Default
});

// ✅ Font secondario - no preload
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  preload: false, // Non critico
});
```

**5. Display Strategy Appropriata**

```tsx
// ✅ Swap per font web (evita FOIT)
const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Mostra fallback immediatamente
});

// ✅ Optional per font decorativi
const decorative = Playfair_Display({
  subsets: ['latin'],
  display: 'optional', // Non blocca il render
});

// ❌ Block (evitare - causa FOIT)
// display: 'block' // Nasconde il testo fino al caricamento
```

**6. CSS Variables per Flessibilità**

```tsx
// ✅ Definisci CSS variables
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// Uso in Tailwind
<h1 className="font-[var(--font-inter)]">Title</h1>

// Uso in CSS modules
.title {
  font-family: var(--font-inter);
}
```

### Combinare Font Google e Local

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const customFont = localFont({
  src: '../public/fonts/CustomFont.woff2',
  variable: '--font-custom',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${customFont.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

## Environment Variables - Best Practices

Next.js supporta variabili d'ambiente per separare configurazione e codice. In Next.js 16, la gestione delle variabili d'ambiente rimane invariata ma è importante seguire le best practices.

### Tipi di Environment Variables

Next.js distingue tra due tipi di variabili d'ambiente:

1. **Server-side only**: Accessibili solo in Server Components, Route Handlers, Server Actions
2. **Client-side (public)**: Accessibili ovunque, inclusi Client Components

### File di Environment Variables

```
my-nextjs-app/
├── .env                  # Default (committato in Git)
├── .env.local            # Local overrides (NON committare)
├── .env.development      # Development environment
├── .env.production       # Production environment
├── .env.test             # Test environment
└── .env.example          # Template (committato in Git)
```

**Ordine di Precedenza:**

1. `.env.{environment}.local` (maggiore priorità)
2. `.env.local` (non usato in test)
3. `.env.{environment}`
4. `.env`

### Variabili Server-Side

Variabili **senza** prefisso `NEXT_PUBLIC_` sono accessibili solo lato server:

```bash
# .env.local

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
DATABASE_POOL_MAX=10

# Authentication
AUTH_SECRET="your-super-secret-key-change-this-in-production"
CLERK_SECRET_KEY="sk_test_..."

# External APIs
OPENAI_API_KEY="sk-..."
STRIPE_SECRET_KEY="sk_test_..."

# Email Service
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="your-email@example.com"
SMTP_PASSWORD="your-password"
```

**Accesso in Server Components:**

```tsx
// app/api/data/page.tsx (Server Component)

export default async function DataPage() {
  // ✅ Accessibile - Server Component
  const dbUrl = process.env.DATABASE_URL;
  
  // Usa la variabile
  const data = await fetchFromDatabase(dbUrl);
  
  return <div>{/* render data */}</div>;
}
```

**Accesso in Route Handlers:**

```ts
// app/api/users/route.ts

import { NextResponse } from 'next/server';

export async function GET() {
  // ✅ Accessibile - Route Handler (server-side)
  const apiKey = process.env.OPENAI_API_KEY;
  
  const response = await fetch('https://api.openai.com/v1/...', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  
  return NextResponse.json(await response.json());
}
```

**Accesso in Server Actions:**

```ts
// app/actions/email.ts
"use server";

export async function sendEmail(to: string, subject: string, body: string) {
  // ✅ Accessibile - Server Action
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  
  // Invia email
  await sendEmailViaSmtp({
    host: smtpHost,
    user: smtpUser,
    password: smtpPassword,
    to,
    subject,
    body,
  });
}
```

### Variabili Client-Side (Public)

Variabili con prefisso `NEXT_PUBLIC_` sono accessibili ovunque, **inclusi Client Components**:

```bash
# .env.local

# Public variables (embedded nel bundle JavaScript!)
NEXT_PUBLIC_API_URL="https://api.example.com"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_SITE_URL="https://yoursite.com"
NEXT_PUBLIC_APP_NAME="My Next.js App"
```

**⚠️ IMPORTANTE:** Le variabili `NEXT_PUBLIC_*` vengono **embedded nel bundle JavaScript** e sono visibili a tutti gli utenti. **Non mettere mai dati sensibili in variabili public!**

**Accesso in Client Components:**

```tsx
// components/Analytics.tsx
"use client";

import { useEffect } from 'react';

export function Analytics() {
  useEffect(() => {
    // ✅ Accessibile - Client Component
    const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
    
    // Inizializza Google Analytics
    if (gaId) {
      window.gtag('config', gaId);
    }
  }, []);
  
  return null;
}
```

```tsx
// components/ApiClient.tsx
"use client";

export function ApiClient() {
  // ✅ Accessibile - Client Component
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  
  const fetchData = async () => {
    const response = await fetch(`${apiUrl}/data`);
    return response.json();
  };
  
  return <button onClick={fetchData}>Fetch Data</button>;
}
```

### Type Safety con TypeScript

Definisci i tipi per le env variables:

```ts
// env.d.ts (nella root del progetto)

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Server-side only
      DATABASE_URL: string;
      AUTH_SECRET: string;
      CLERK_SECRET_KEY: string;
      OPENAI_API_KEY: string;
      STRIPE_SECRET_KEY: string;
      SMTP_HOST: string;
      SMTP_PORT: string;
      SMTP_USER: string;
      SMTP_PASSWORD: string;
      
      // Client-side (public)
      NEXT_PUBLIC_API_URL: string;
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
      NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: string;
      NEXT_PUBLIC_SITE_URL: string;
      NEXT_PUBLIC_APP_NAME: string;
      
      // Node.js
      NODE_ENV: 'development' | 'production' | 'test';
    }
  }
}

export {};
```

Ora TypeScript ti avvisa se usi variabili non definite o con typo:

```tsx
// ✅ TypeScript autocomplete e type checking
const dbUrl = process.env.DATABASE_URL; // string

// ❌ TypeScript error: Property 'DATABASE_UR' does not exist
const dbUrl = process.env.DATABASE_UR;
```

### Validazione con Zod

Valida le env variables all'avvio dell'app:

```ts
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Server-side
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  
  // Client-side
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

// Valida all'avvio
export const env = envSchema.parse(process.env);

// Uso type-safe
export type Env = z.infer<typeof envSchema>;
```

```tsx
// app/page.tsx
import { env } from '@/lib/env';

export default function Page() {
  // ✅ Type-safe e validato
  const dbUrl = env.DATABASE_URL;
  
  return <div>...</div>;
}
```

### Template .env.example

Crea un template per altri sviluppatori:

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
DATABASE_POOL_MAX=10

# Authentication (get from clerk.com)
AUTH_SECRET="generate-with-openssl-rand-base64-32"
CLERK_SECRET_KEY="sk_test_your_key_here"

# External APIs
OPENAI_API_KEY="sk-your_key_here"
STRIPE_SECRET_KEY="sk_test_your_key_here"

# Email Service
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="your-email@example.com"
SMTP_PASSWORD="your-password"

# Public Variables
NEXT_PUBLIC_API_URL="https://api.example.com"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_your_key_here"
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="My Next.js App"
```

### Environment-Specific Configurations

```bash
# .env.development
DATABASE_URL="postgresql://localhost:5432/mydb_dev"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# .env.production
DATABASE_URL="postgresql://prod-host:5432/mydb_prod"
NEXT_PUBLIC_API_URL="https://api.yoursite.com"
NEXT_PUBLIC_SITE_URL="https://yoursite.com"

# .env.test
DATABASE_URL="postgresql://localhost:5432/mydb_test"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
```

### Runtime Environment Variables

Alcune variabili potrebbero essere disponibili solo a runtime (es. su Vercel, Railway):

```tsx
// app/api/config/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  // Queste variabili sono settate dalla piattaforma
  const vercelUrl = process.env.VERCEL_URL;
  const vercelEnv = process.env.VERCEL_ENV; // preview | production | development
  
  return NextResponse.json({
    url: vercelUrl,
    environment: vercelEnv,
  });
}
```

### Best Practices per Environment Variables

**1. Mai Committare .env.local**

```bash
# .gitignore

# Environment variables
.env*.local
.env.local

# ✅ Committa questi
# .env.example
# .env (valori di default non sensibili)
```

**2. Usa NEXT_PUBLIC_ Solo per Dati Non Sensibili**

```bash
# ❌ MAI fare questo
NEXT_PUBLIC_DATABASE_URL="postgresql://..."
NEXT_PUBLIC_API_SECRET="super-secret"
NEXT_PUBLIC_STRIPE_SECRET_KEY="sk_live_..."

# ✅ Corretto
DATABASE_URL="postgresql://..."  # Server-side only
API_SECRET="super-secret"  # Server-side only
STRIPE_SECRET_KEY="sk_live_..."  # Server-side only

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."  # OK - è pubblico
NEXT_PUBLIC_API_URL="https://api.example.com"  # OK - è pubblico
```

**3. Valida All'Avvio**

```ts
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  // ... altre variabili
});

// ✅ Throw error se variabili mancanti o invalide
try {
  envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment variables:', error);
  process.exit(1);
}
```

**4. Documenta le Variabili**

```bash
# .env.example

# Database Configuration
# Get a PostgreSQL database from: https://railway.app/
DATABASE_URL="postgresql://user:password@host:5432/db"

# Authentication Secret
# Generate with: openssl rand -base64 32
AUTH_SECRET="your-32-character-secret-key-here"

# Clerk Authentication
# Sign up at: https://clerk.com/
# Dashboard: https://dashboard.clerk.com/
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

**5. Diversi Valori per Ambienti Diversi**

```tsx
// lib/config.ts

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

// Uso
import { config } from '@/lib/config';

if (config.isDevelopment) {
  console.log('Running in development mode');
}
```

**6. Usa Helper Functions**

```ts
// lib/env-helpers.ts

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  
  return value;
}

export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// Uso
const dbUrl = getRequiredEnv('DATABASE_URL');
const port = getOptionalEnv('PORT', '3000');
```

**7. Type-Safe Access**

```ts
// lib/env.ts

export const serverEnv = {
  databaseUrl: process.env.DATABASE_URL!,
  authSecret: process.env.AUTH_SECRET!,
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
} as const;

export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
} as const;

// Uso type-safe
import { serverEnv, publicEnv } from '@/lib/env';

// ✅ Autocomplete e type checking
const dbUrl = serverEnv.databaseUrl;
const apiUrl = publicEnv.apiUrl;
```

**8. Vercel Environment Variables**

Su Vercel, puoi settare env variables tramite:

- Dashboard: `Settings > Environment Variables`
- CLI: `vercel env add`

```bash
# Aggiungi variabile per tutti gli environment
vercel env add DATABASE_URL

# Aggiungi variabile solo per production
vercel env add DATABASE_URL production

# Scarica le env variables localmente
vercel env pull .env.local
```

### Debugging Environment Variables

```tsx
// app/api/debug-env/route.ts (solo in development!)

import { NextResponse } from 'next/server';

export async function GET() {
  // ⚠️ ATTENZIONE: Solo per debugging, rimuovi in production!
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }
  
  return NextResponse.json({
    // Mostra solo nomi, non valori sensibili
    serverVars: Object.keys(process.env).filter(
      (key) => !key.startsWith('NEXT_PUBLIC_')
    ),
    publicVars: Object.keys(process.env).filter((key) =>
      key.startsWith('NEXT_PUBLIC_')
    ),
  });
}
```

---

## Riepilogo delle Sezioni Aggiunte

Abbiamo aggiunto quattro sezioni fondamentali alla guida:

### ✅ Metadata API - SEO e Meta Tags
- Metadata statici e dinamici
- `generateMetadata` con async params
- Template per titoli
- Streaming metadata (novità Next.js 16)
- File-based metadata (favicon, OG images, sitemap, robots)
- Best practices SEO

### ✅ Image Optimization - next/image
- Componente `<Image>` ottimizzato
- Immagini esterne e remotePatterns
- Responsive images con `fill` e `sizes`
- Placeholder blur
- Priority per above-the-fold
- Quality control e loader personalizzati
- Best practices per performance

### ✅ Font Optimization - next/font
- Google Fonts con self-hosting automatico
- Local fonts custom
- Variable fonts e font specifici
- CSS variables per flessibilità
- Display strategies
- Best practices per ridurre layout shift

### ✅ Environment Variables - Best Practices
- Server-side vs Client-side variables
- File di environment (.env, .env.local, ecc.)
- Type safety con TypeScript
- Validazione con Zod
- Template .env.example
- Environment-specific configurations
- Best practices per sicurezza

La guida è ora completa e pronta per l'uso! 🚀# Next.js 16: Guida Completa (App Router)

Questa guida fornisce una panoramica completa e pratica di Next.js 16, con particolare attenzione all'App Router, ai Server Components, alle Server Actions, Cache Components e all'integrazione di Clerk per l'autenticazione. È progettata per essere utilizzata come riferimento e come input per un LLM.

## 🆕 Novità di Next.js 16

### Principali Cambiamenti dalla Versione 15

Next.js 16 introduce miglioramenti significativi in termini di performance, caching esplicito e developer experience, con Turbopack come bundler predefinito e il React Compiler ora stabile.

**Highlights:**
- ⚡ **Turbopack (Stabile)**: Bundler predefinito per tutte le app
- 🎯 **Cache Components**: Nuovo modello di caching esplicito con `"use cache"`
- 🔄 **updateTag()**: Nuova API per semantica read-your-writes
- 🚀 **React Compiler (Stabile)**: Memoization automatica dei componenti
- 📦 **React 19.2**: View Transitions, `useEffectEvent()`, `<Activity/>`
- 🔌 **proxy.js**: Sostituisce `middleware.ts` (deprecato)
- ⚠️ **Breaking Changes**: `params` e `searchParams` ora completamente asincroni

### Requisiti di Sistema Aggiornati

Next.js 16 richiede versioni minime aggiornate del software: Node.js 20.9.0 (Node.js 18 non è più supportato), TypeScript 5.1.0, e browser moderni come Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+.

```bash
# Verifica le versioni
node --version  # >= 20.9.0
npm --version
```

## Creazione di un Progetto Next.js 16

Utilizza `create-next-app` per inizializzare un nuovo progetto:

```bash
npx create-next-app@latest
# oppure
bun create next-app
```

**Opzioni Consigliate:**

*   TypeScript: **Yes**
*   ESLint: **Yes**
*   Tailwind CSS: **Yes**
*   `src/` directory: **Yes**
*   App Router: **Yes**
*   Turbopack: **Yes** (ora predefinito)
*   Import alias: (Scegli l'alias di default o personalizzalo)

```bash
cd my-nextjs-app
npm run dev
# oppure
bun run dev
```

Questo avvia il server di sviluppo (di solito su `http://localhost:3000`).

## Struttura del Progetto (App Router)

```
my-nextjs-app/
├── .next/            # Generato da Next.js (non modificare)
├── node_modules/     # Dipendenze del progetto
├── public/           # File statici (immagini, ecc.)
├── src/
│   └── app/          # App Router (qui risiede la maggior parte del codice)
│       ├── page.tsx  # Componente principale della route "/"
│       ├── layout.tsx # Layout radice (obbligatorio)
│       ├── globals.css # Fogli di stile globali
│       └── (altre cartelle e file per le route)
├── components/       # Componenti React riutilizzabili
├── proxy.ts          # 🆕 Sostituisce middleware.ts (opzionale)
├── .env.local        # Variabili d'ambiente (NON committare)
├── package.json      # Dipendenze e script
├── tsconfig.json     # Configurazione di TypeScript
└── (altri file di configurazione)
```

## 🆕 Turbopack (Stabile)

Turbopack è ora il bundler predefinito in Next.js 16, offrendo build di produzione da 2 a 5 volte più veloci e Fast Refresh fino a 10 volte più veloce.

**Vantaggi:**
- ⚡ 2-5x più veloce nelle build di produzione
- 🔥 5-10x più veloce nel Fast Refresh (hot reload)
- 📦 File System Caching (beta): startup ancora più rapidi

**Configurazione (già predefinito):**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack è ora il default, non serve configurazione
  // Per disabilitarlo (sconsigliato):
  // experimental: {
  //   turbo: false
  // }
}

module.exports = nextConfig
```

**Build di produzione con Turbopack:**

```bash
npm run build
# Turbopack è ora usato automaticamente
```

## React Server Components (RSC) e Client Components

Next.js 16 utilizza l'architettura dei **React Server Components (RSC)**.  I componenti sono suddivisi in:

*   **Server Components:**
    *   Eseguiti *esclusivamente* sul server.
    *   *Default* nell'App Router (non è necessario alcun marcatore speciale).
    *   Ideali per:
        *   Data fetching (accesso a database, API, ecc.).
        *   Logica di business lato server.
        *   Accesso a risorse backend (file system, ecc.).
        *   Mantenere dati sensibili (API keys) sul server.
    *   *Non* possono usare:
        *   State (`useState`, `useReducer`).
        *   Effetti (`useEffect`, `useLayoutEffect`).
        *   Event handlers (`onClick`, ecc.).
        *   API del browser (`window`, `localStorage`, ecc.).
    *   Migliorano le performance:
        *   Riducono il JavaScript inviato al client.
        *   Migliorano la SEO.

*   **Client Components:**
    *   Eseguiti nel browser (ma possono essere pre-renderizzati sul server).
    *   Richiedono la direttiva `"use client";` all'inizio del file.
    *   Usati per:
        *   Interattività (gestione eventi, state, effetti).
        *   Accesso alle API del browser.
    *   Dovrebbero essere usati *solo quando necessario*.  L'ideale è che siano componenti "foglia" (terminali) nell'albero dei componenti.

**Esempio (Server Component - `components/Greet.tsx`):**

```tsx
// components/Greet.tsx  (Server Component - Nessun "use client")

function Greet() {
  // Questo codice viene eseguito SOLO sul server
  console.log("Greet component (server)");
  return <div>Hello from the Server!</div>;
}

export default Greet;
```

**Esempio (Client Component - `components/Counter.tsx`):**

```tsx
// components/Counter.tsx (Client Component)

"use client"; // Direttiva OBBLIGATORIA

import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  // Questo codice viene eseguito nel browser
  console.log("Counter component (client)");

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}

export default Counter;
```

**Regola Generale:** Inizia con Server Components e usa Client Components solo quando hai bisogno di interattività o di accedere alle API del browser.

## Routing (App Router)

L'App Router di Next.js utilizza una struttura di cartelle per definire le route:

*   **`app/`:** La cartella radice dell'App Router.
*   **`page.tsx` (o `page.js`):** Definisce il componente React per una specifica route.
*   **Cartelle:** Ogni cartella all'interno di `app` rappresenta un segmento dell'URL.

**Esempi:**

| Route          | File                                     |
| -------------- | ---------------------------------------- |
| `/`            | `app/page.tsx`                           |
| `/about`       | `app/about/page.tsx`                     |
| `/blog/post-1` | `app/blog/post-1/page.tsx`              |

### 🆕 Route Dinamiche con Async Params

In Next.js 16, l'accesso sincrono a params e searchParams è stato completamente rimosso. Queste API possono essere accessate solo in modo asincrono.

Usa le parentesi quadre `[]` per creare segmenti dinamici:

*   `/products/[id]` -> `app/products/[id]/page.tsx`

```tsx
// app/products/[id]/page.tsx (Server Component)

// ⚠️ BREAKING CHANGE: params è ora asincrono
async function ProductDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Devi fare await di params
  
  // ... fetch data for product with id ...
  return <div>Product ID: {id}</div>;
}

export default ProductDetails;
```

**Helper per Type-Safety:**

```bash
# Genera type helpers per params e searchParams
npx next typegen
```

```tsx
// Con type helpers generati
import type { PageProps } from '@/types/page';

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const query = await props.searchParams;
  
  return <h1>Blog Post: {slug}</h1>;
}
```

**Route Groups:**

Raggruppano logicamente le route senza influenzare l'URL.  Usa le parentesi tonde `()`:

*   `/login` -> `app/(auth)/login/page.tsx`
*   `/register` -> `app/(auth)/register/page.tsx`

## 🆕 Routing e Navigazione Migliorati

Next.js 16 include una revisione completa del sistema di routing e navigazione, rendendo le transizioni di pagina più veloci e leggere.

**Novità:**
- **Layout Deduplication**: I layout condivisi vengono scaricati una sola volta invece che separatamente per ogni Link. Ad esempio, una pagina con 50 link prodotto scarica il layout condiviso una volta invece di 50 volte.
- **Incremental Prefetching**: Prefetch intelligente che scarica solo le parti mancanti dalla cache.
- **Automatic Cancellation**: Cancellazione automatica delle richieste quando i link escono dal viewport.

## Layouts

I Layouts definiscono l'UI condivisa tra più pagine (header, footer, ecc.).

*   **`app/layout.tsx` (Layout Radice):** Obbligatorio.  Si applica a *tutte* le route. Definisce la struttura di base della pagina (`<html>`, `<body>`).

```tsx
// app/layout.tsx

import Navigation from './components/Navigation';
import Footer from './components/Footer';
import { ClerkProvider } from '@clerk/nextjs'; // Importa ClerkProvider (se usi Clerk)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
        <html lang="en">
          <body>
            <Navigation />
            <main>{children}</main>
            <Footer />
          </body>
        </html>
    </ClerkProvider>
  );
}
```

*   **Layout Annidati:** Crea layout specifici per sezioni dell'applicazione (es. `app/products/layout.tsx`).

```tsx
// app/products/layout.tsx
import Sidebar from './components/Sidebar';

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="products-layout">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

## Navigazione (next/link)

Usa il componente `<Link>` di `next/link` per la navigazione *client-side* (senza ricaricare la pagina):

```tsx
// components/Navigation.tsx (Client Component)

"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation'; // Per evidenziare il link attivo

function Navigation() {
  const pathname = usePathname();

  const linkClass = (href: string) => {
    return pathname === href ? "active-link" : "normal-link";
  };

  return (
    <nav>
      <Link href="/" className={linkClass("/")}>Home</Link>
      <Link href="/about" className={linkClass("/about")}>About</Link>
      {/* ... altri link ... */}
    </nav>
  );
}
export default Navigation
```

*   **`usePathname`:** Hook di `next/navigation` per ottenere il percorso corrente (utile per evidenziare il link attivo).
*   **`"use client";`:** Obbligatorio perché `Navigation` usa un hook (`usePathname`) e gestisce la navigazione.
* **Prefetching automatico:** Next.js precarica automaticamente le pagine collegate tramite `<Link>` quando appaiono nel viewport, rendendo la navigazione istantanea.

## 🆕 Proxy.js (sostituisce Middleware)

Il file middleware.js è ora sostituito da proxy.js. L'obiettivo è chiarire il ruolo di questo file nella gestione delle richieste di rete.

**Migrazione da middleware.ts a proxy.ts:**

```ts
// proxy.ts (nuovo)

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Esporta come "proxy" o come default
export function proxy(request: NextRequest) {
  // Stessa logica del middleware
  console.log('Request URL:', request.url);
  
  return NextResponse.next();
}

// Oppure esporta come default
export default function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Nota:** `middleware.ts` è temporaneamente ancora supportato ma considerato deprecato.

## Route Handlers (API Endpoints)

I Route Handlers permettono di creare endpoint API *all'interno* dell'App Router.

*   **File `route.ts` (o `route.js`):**  All'interno di una cartella, definisce le funzioni che gestiscono le richieste HTTP (GET, POST, PUT, DELETE, ecc.).  Il nome del file *deve* essere `route.ts` (case-sensitive).

**Esempio: `app/api/users/route.ts`**

```ts
// app/api/users/route.ts (Route Handler)
import { NextResponse } from 'next/server';
import { z } from 'zod'; // Importa Zod (consigliato per la validazione)

// Dati di esempio (in un'applicazione reale, useresti un database)
const users = [
  { id: 1, name: "John Doe" },
  { id: 2, name: "Jane Doe" },
];

// Schema Zod per la validazione dei dati in POST
const createUserSchema = z.object({
  name: z.string().min(3),
});

// GET /api/users - Restituisce tutti gli utenti
export async function GET() {
  return NextResponse.json(users);
}

// POST /api/users - Crea un nuovo utente
export async function POST(request: Request) {
  try {
    const rawData = await request.json();
    const validatedData = createUserSchema.parse(rawData); // Validazione con Zod

    const newUser = {
      id: users.length + 1,
      name: validatedData.name,
    };
    users.push(newUser);

    return NextResponse.json(newUser, { status: 201 }); // 201 Created

  } catch (error) {
      if (error instanceof z.ZodError) {
          return NextResponse.json({ message: "Validation Error", errors: error.errors }, { status: 400 })
      }
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
```

**Esempio: `app/api/users/[id]/route.ts` (Route Dinamica con Async Params)**

```ts
// app/api/users/[id]/route.ts

import { NextResponse } from 'next/server';

// 🆕 params è ora asincrono anche nei Route Handlers
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await necessario
  const userId = parseInt(id);
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
```

*   **`NextResponse`:** Helper di Next.js per creare risposte API (JSON, redirect, ecc.).
*   **`Request`:** Oggetto standard che rappresenta la richiesta HTTP.
*   **Validazione (Zod):** *Fondamentale*. Usa una libreria come Zod per validare i dati in ingresso.
*   **Gestione Errori (`try...catch`):**  Gestisci *sempre* gli errori e restituisci codici di stato HTTP appropriati (400 Bad Request, 404 Not Found, 500 Internal Server Error, ecc.).

## 🆕 Cache Components e "use cache"

Cache Components sono un nuovo set di funzionalità progettate per rendere il caching in Next.js più esplicito e flessibile. Si basano sulla nuova direttiva "use cache", che può essere utilizzata per cacheare pagine, componenti e funzioni.

**Differenza Chiave da Next.js 15:**
- **Next.js 15**: Caching implicito e automatico (spesso confuso)
- **Next.js 16**: Caching **esplicito e opt-in** con `"use cache"`

### Abilitare Cache Components

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cacheComponents: true, // Abilita Cache Components
  }
}

module.exports = nextConfig
```

### Usare "use cache"

```tsx
// app/products/page.tsx

// 🆕 Direttiva "use cache" per cacheare l'intera pagina
"use cache";

export default async function ProductsPage() {
  const products = await fetchProducts();
  
  return (
    <div>
      <h1>Products</h1>
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
```

**Cacheare funzioni specifiche:**

```tsx
// lib/data.ts

// 🆕 Cache solo questa funzione
export async function getProducts() {
  "use cache";
  
  const res = await fetch('https://api.example.com/products');
  return res.json();
}
```

**Cacheare componenti:**

```tsx
// components/ProductList.tsx

// 🆕 Cache questo componente
async function ProductList() {
  "use cache";
  
  const products = await fetchProducts();
  return <ul>{/* ... */}</ul>;
}
```

## Data Fetching

Next.js 16 offre diverse strategie per il data fetching:

### 1. Server Components (Consigliato)

*   Data fetching *direttamente* all'interno del componente, usando `async/await`.
*   Il codice viene eseguito *solo* sul server.
*   Ideale per la maggior parte dei casi d'uso.

```tsx
// app/products/page.tsx (Server Component)

async function getProducts() {
  const res = await fetch('https://api.example.com/products');
  if (!res.ok) {
    throw new Error('Failed to fetch products');
  }
  return res.json();
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <ul>
      {products.map((product: any) => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  );
}
```

### 🆕 Caching con fetch in Next.js 16

**Importante**: A differenza del caching implicito nelle versioni precedenti dell'App Router, il caching con Cache Components è interamente opt-in. Tutto il codice dinamico in qualsiasi pagina, layout o route API viene eseguito al momento della richiesta per impostazione predefinita.

```ts
// Esempi di caching con fetch

// ⚠️ NUOVO COMPORTAMENTO: Nessun caching di default (tutto dinamico)
const res1 = await fetch('https://...');

// Nessun caching (esplicito)
const res2 = await fetch('https://...', { cache: 'no-store' });

// Revalidate ogni 60 secondi
const res3 = await fetch('https://...', { next: { revalidate: 60 } });

// Revalidate on demand (usando tags)
const res4 = await fetch('https://...', { next: { tags: ['products'] } });

// 🆕 Oppure usa "use cache" per caching esplicito
async function getCachedData() {
  "use cache";
  const res = await fetch('https://...');
  return res.json();
}
```

### 2. Client Components

*   Usa `useEffect` e `useState` (come in una normale applicazione React).
*   Il data fetching avviene nel browser.
*   Usalo *solo* quando necessario (interattività, API del browser).

```tsx
// app/client-data/page.tsx (Client Component)

"use client";

import { useState, useEffect } from 'react';

function ClientDataPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('https://api.example.com/data');
          if (!res.ok) {
              throw new Error('Failed to fetch');
          }
        const jsonData = await res.json();
        setData(jsonData);
      } catch (err:any) {
          setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }
  if (error) {
      return <div>Error: {error}</div>
  }

  return <div>{/* ... render data ... */}</div>;
}

export default ClientDataPage;
```

### 🆕 Gestione di Loading, Streaming e Suspense

Next.js 16 introduce un modello completamente rivisto per gestire il rendering dinamico, basato su **Suspense boundaries** e **Partial Prerendering (PPR)**. Questo approccio offre un perfetto equilibrio tra performance e freschezza dei dati.

#### Concetti Chiave: Static Shell + Dynamic Streaming

Con Cache Components abilitato, Next.js pre-renderizza una **"static shell"** (guscio statico) contenente tutto il contenuto cachabile, mentre le parti dinamiche vengono stremate in parallelo quando sono pronte.

**Come Funziona:**
1. 🚀 L'utente riceve immediatamente lo static shell (HTML pre-renderizzato)
2. ⏳ Le sezioni dinamiche mostrano fallback UI (skeleton, loader)
3. 📡 Solo le parti dinamiche vengono renderizzate e stremate in parallelo
4. ✅ I fallback vengono sostituiti con il contenuto reale appena pronto

**Visualizzazione:**
```
┌─────────────────────────────────┐
│  Static Header (pre-rendered)   │ ← Visibile immediatamente
├─────────────────────────────────┤
│  Product Info (cached)          │ ← Visibile immediatamente
├─────────────────────────────────┤
│  [Loading Cart...]              │ ← Fallback UI, poi streaming
├─────────────────────────────────┤
│  [Loading Recommendations...]   │ ← Fallback UI, poi streaming
└─────────────────────────────────┘
```

#### I Tre Tipi di Dati con Suspense

Next.js 16 categorizza i dati in tre tipologie, ognuna con un pattern specifico:

**1. Runtime Data (Dati Specifici della Richiesta)**

Dati disponibili solo quando un utente fa una richiesta specifica. **Devono sempre** essere wrappati in Suspense.

```tsx
// app/page.tsx

import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ sort: string }>;
}) {
  return (
    <>
      <h1>Questa parte è pre-renderizzata</h1>
      
      {/* Runtime data: richiede Suspense */}
      <Suspense fallback={<UserSkeleton />}>
        <UserProfile />
      </Suspense>
      
      <Suspense fallback={<TableSkeleton />}>
        <ProductTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Componente che usa runtime APIs
async function UserProfile() {
  const session = (await cookies()).get('session')?.value;
  const userAgent = (await headers()).get('user-agent');
  
  return (
    <div>
      <p>Session: {session}</p>
      <p>Browser: {userAgent}</p>
    </div>
  );
}
```

**Runtime APIs che richiedono Suspense:**
- `cookies()`
- `headers()`
- `searchParams` prop
- `params` prop (senza `generateStaticParams`)

**2. Dynamic Data (Dati che Cambiano tra Richieste)**

Dati come fetch calls o database queries che non sono user-specific ma cambiano nel tempo.

```tsx
// app/blog/page.tsx

import { Suspense } from 'react';

export default function BlogPage() {
  return (
    <>
      <h1>Blog</h1>
      
      {/* Dynamic data: può beneficiare di Suspense per streaming */}
      <Suspense fallback={<PostsSkeleton />}>
        <BlogPosts />
      </Suspense>
    </>
  );
}

async function BlogPosts() {
  // Fetch dinamico - cambia tra richieste
  const res = await fetch('https://api.cms.com/posts');
  const { posts } = await res.json();
  
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

**3. Cached Data (Dati Cacheable con "use cache")**

Dati che possono essere cachati e inclusi nello static shell.

```tsx
// app/products/page.tsx

import { cacheLife } from 'next/cache';
import { Suspense } from 'react';

export default function ProductsPage() {
  return (
    <>
      {/* Cached data: incluso nello static shell */}
      <CachedProductList />
      
      {/* Dynamic data: streamed */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <PersonalizedRecommendations />
      </Suspense>
    </>
  );
}

// Questo componente è cachato e pre-renderizzato
async function CachedProductList() {
  "use cache";
  cacheLife('hours');
  
  const products = await db.query('SELECT * FROM products');
  return <ProductGrid products={products} />;
}

// Questo componente è dinamico e streamed
async function PersonalizedRecommendations() {
  const userId = await getCurrentUserId();
  const recommendations = await getRecommendations(userId);
  return <RecommendationGrid items={recommendations} />;
}
```

#### ⚠️ Errore: Missing Suspense Boundary

Con Cache Components, Next.js **richiede** che il codice dinamico sia wrappato in Suspense. Se dimentichi, vedrai questo errore:

```
Error: Uncached data was accessed outside of <Suspense>
```

**Perché questo errore è importante:**
Senza Suspense, l'intera pagina viene bloccata in attesa dei dati dinamici, risultando in un'esperienza utente lenta. Next.js forza questo pattern per garantire che l'app carichi istantaneamente.

**Come Risolvere:**

**Opzione 1: Wrappa in Suspense**
```tsx
// ❌ Errore: dynamic data senza Suspense
export default async function Page() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}

// ✅ Corretto: wrappato in Suspense
export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DynamicContent />
    </Suspense>
  );
}

async function DynamicContent() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}
```

**Opzione 2: Usa "use cache"**
```tsx
// ✅ Alternativa: cache il componente
export default async function Page() {
  "use cache";
  cacheLife('minutes');
  
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}
```

**Nota:** Runtime APIs (cookies, headers) **non possono** essere cachate, quindi richiedono sempre Suspense.

#### Pattern Avanzati con Suspense

**1. Streaming Parallelo di Multiple Sezioni**

```tsx
// app/dashboard/page.tsx

import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      
      {/* Tutte queste sezioni vengono stremate in parallelo */}
      <div className="grid">
        <Suspense fallback={<CardSkeleton />}>
          <RevenueCard />
        </Suspense>
        
        <Suspense fallback={<CardSkeleton />}>
          <UsersCard />
        </Suspense>
        
        <Suspense fallback={<CardSkeleton />}>
          <OrdersCard />
        </Suspense>
      </div>
      
      <Suspense fallback={<ChartSkeleton />}>
        <SalesChart />
      </Suspense>
    </div>
  );
}
```

**2. Passare Props Dinamiche Senza Trigger Dinamico**

I componenti diventano dinamici solo quando il valore viene **acceduto**. Puoi passare props dinamiche senza renderizzare l'intero componente dinamico:

```tsx
// app/products/page.tsx

import { Suspense } from 'react';
import { ProductTable } from './table';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ sort: string; filter: string }>;
}) {
  return (
    <section>
      {/* Questa parte è pre-renderizzata */}
      <h1>Products</h1>
      <p>Browse our catalog</p>
      
      {/* Solo la table diventa dinamica quando accede a searchParams */}
      <Suspense fallback={<TableSkeleton />}>
        <ProductTable 
          sortPromise={searchParams.then(p => p.sort)}
          filterPromise={searchParams.then(p => p.filter)}
        />
      </Suspense>
    </section>
  );
}
```

```tsx
// app/products/table.tsx

interface TableProps {
  sortPromise: Promise<string>;
  filterPromise: Promise<string>;
}

export async function ProductTable({ sortPromise, filterPromise }: TableProps) {
  // Solo quando fai await qui il componente diventa dinamico
  const sort = await sortPromise;
  const filter = await filterPromise;
  
  const products = await fetchProducts({ sort, filter });
  
  return <table>{/* ... */}</table>;
}
```

**Vantaggi di questo pattern:**
- Il resto della pagina viene pre-renderizzato
- Solo la table richiede rendering dinamico
- Migliore performance e UX

**3. Nested Suspense per Caricamento Progressivo**

```tsx
// app/product/[id]/page.tsx

import { Suspense } from 'react';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  return (
    <>
      {/* Livello 1: Carica velocemente */}
      <Suspense fallback={<ProductHeaderSkeleton />}>
        <ProductHeader id={id} />
        
        {/* Livello 2: Carica i dettagli */}
        <Suspense fallback={<ProductDetailsSkeleton />}>
          <ProductDetails id={id} />
          
          {/* Livello 3: Carica le recensioni più lentamente */}
          <Suspense fallback={<ReviewsSkeleton />}>
            <ProductReviews id={id} />
          </Suspense>
        </Suspense>
      </Suspense>
    </>
  );
}
```

**4. Skeleton UI Semantici**

Crea skeleton che riflettono la struttura del contenuto reale:

```tsx
// components/skeletons.tsx

export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-48 bg-gray-200 rounded"></div>
      <div className="mt-2 h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="mt-2 h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

#### File Speciali: loading.tsx e error.tsx

Oltre a Suspense manuale, Next.js supporta file speciali per gestire loading e errori a livello di route:

**loading.tsx - Fallback Automatico**

```tsx
// app/products/loading.tsx

export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-gray-200 rounded"></div>
        ))}
      </div>
    </div>
  );
}
```

Il file `loading.tsx` viene automaticamente wrappato in un boundary Suspense da Next.js:

```tsx
// Equivalente a:
<Suspense fallback={<Loading />}>
  <Page />
</Suspense>
```

**error.tsx - Gestione Errori**

```tsx
// app/products/error.tsx

"use client"; // Error boundaries devono essere Client Components

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log dell'errore a un servizio di error reporting
    console.error('Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Try again
      </button>
    </div>
  );
}
```

**global-error.tsx - Errori nel Root Layout**

Per gestire errori nel root layout, crea `global-error.tsx`:

```tsx
// app/global-error.tsx

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Application Error</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
```

#### Come Funziona lo Streaming

Lo streaming divide la route in chunks e li invia progressivamente al client:

**1. Single HTTP Request**
```
Request →  Static Shell + Stream(Dynamic1) + Stream(Dynamic2) + Stream(Dynamic3)
```

Tutto viene inviato in una singola richiesta HTTP, evitando round-trips multipli.

**2. Parallelizzazione**
```
┌─────────────────┐
│  Static Shell   │ → Inviato immediatamente
└─────────────────┘
        ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  Dynamic Part 1 │  Dynamic Part 2 │  Dynamic Part 3 │ → Rendering in parallelo
└─────────────────┴─────────────────┴─────────────────┘
        ↓                 ↓                 ↓
    Streaming        Streaming        Streaming → Inviati appena pronti
```

**3. Progressive Hydration**

```tsx
// Il JavaScript viene caricato e idratato progressivamente
┌────────────────────────────────────────────┐
│ 1. HTML statico (visibile immediatamente)  │
│ 2. JavaScript streaming (hydration)        │
│ 3. Componenti interattivi progressivamente │
└────────────────────────────────────────────┘
```

#### Best Practices per Suspense

**✅ DO: Wrappa Unità Logiche**

```tsx
// ✅ Buono: ogni sezione ha il suo boundary
<Suspense fallback={<HeaderSkeleton />}>
  <Header />
</Suspense>
<Suspense fallback={<ContentSkeleton />}>
  <Content />
</Suspense>
<Suspense fallback={<SidebarSkeleton />}>
  <Sidebar />
</Suspense>
```

**❌ DON'T: Un Solo Suspense per Tutto**

```tsx
// ❌ Cattivo: blocca tutto insieme
<Suspense fallback={<PageSkeleton />}>
  <Header />
  <Content />
  <Sidebar />
</Suspense>
```

**✅ DO: Skeleton Semantici e Accessibili**

```tsx
// ✅ Buono: aria-label per screen readers
<div 
  role="status" 
  aria-label="Loading products"
  className="animate-pulse"
>
  <ProductGridSkeleton />
</div>
```

**✅ DO: Usa Suspense per Fetch Waterfall**

```tsx
// ✅ Buono: richieste parallele con Suspense separati
function Page() {
  return (
    <>
      <Suspense fallback={<Skeleton1 />}>
        <Data1 /> {/* fetch("/api/data1") */}
      </Suspense>
      <Suspense fallback={<Skeleton2 />}>
        <Data2 /> {/* fetch("/api/data2") in parallelo */}
      </Suspense>
    </>
  );
}
```

**❌ DON'T: Fetch Waterfall Sequenziali**

```tsx
// ❌ Cattivo: attende data1 prima di iniziare data2
async function Page() {
  const data1 = await fetch("/api/data1");
  const data2 = await fetch("/api/data2"); // Attende data1
  return <div>...</div>;
}
```

## Data Access Layer (DAL) - Best Practices

Il **Data Access Layer (DAL)** è un pattern architetturale fondamentale per applicazioni Next.js sicure e manutenibili. È una libreria interna che controlla come e quando i dati vengono recuperati e cosa viene passato al contesto di rendering.

### Perché Usare un DAL?

Next.js raccomanda tre approcci per il data fetching, a seconda delle dimensioni del progetto:

1. **HTTP APIs**: Per applicazioni esistenti e grandi organizzazioni
2. **Data Access Layer (DAL)**: ✅ **Raccomandato per nuovi progetti**
3. **Component-Level Data Access**: Solo per prototipi e apprendimento

**Vantaggi del DAL:**
- 🔒 **Sicurezza Centralizzata**: Tutti i controlli di autenticazione/autorizzazione in un unico posto
- 🎯 **Superficie di Audit Ridotta**: Più facile fare security audit
- 🔄 **Codice Riutilizzabile**: Funzioni di data fetching condivise
- 🧪 **Testabilità**: Facile mockare le funzioni DAL nei test
- 📦 **Separazione delle Responsabilità**: UI, logica business e dati separati
- ⚡ **Performance**: Condivisione di cache in-memory tra parti della request

### Struttura del Progetto con DAL

```
my-nextjs-app/
├── src/
│   ├── app/              # App Router (UI)
│   ├── lib/
│   │   ├── dal/          # 🔐 Data Access Layer
│   │   │   ├── index.ts  # Funzioni principali (verifySession, getUser)
│   │   │   ├── users.ts  # User-related data access
│   │   │   ├── posts.ts  # Posts-related data access
│   │   │   └── products.ts # Products-related data access
│   │   ├── db/           # Database config (Prisma, Drizzle, ecc.)
│   │   │   └── client.ts
│   │   └── dto/          # Data Transfer Objects
│   │       └── user.dto.ts
│   └── types/            # TypeScript types
```

### Implementazione del DAL

#### 1. Funzioni Core di Autenticazione

```ts
// lib/dal/index.ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decrypt } from '@/lib/session'; // Funzione per validare JWT/session

/**
 * Verifica la sessione utente
 * Cached per evitare multiple verifiche nella stessa request
 */
export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session-token')?.value;

  if (!sessionToken) {
    return null;
  }

  try {
    // Verifica il token con il tuo auth provider
    const session = await decrypt(sessionToken);
    
    if (!session || !session.userId) {
      return null;
    }

    return session;
  } catch (error) {
    console.error('Invalid session:', error);
    return null;
  }
});

/**
 * Ottiene i dati utente corrente
 * Restituisce solo i campi sicuri (DTO pattern)
 */
export const getUser = cache(async () => {
  const session = await verifySession();

  if (!session) {
    return null;
  }

  try {
    // Fetch solo i campi necessari (DTO)
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        // ❌ NON includere: password, tokens, private data
      },
    });

    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
});

/**
 * Wrapper per route protette
 * Redirect automatico se non autenticato
 */
export async function requireAuth() {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }
  
  return session;
}

/**
 * Wrapper per route admin
 */
export async function requireAdmin() {
  const user = await getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  if (user.role !== 'ADMIN') {
    redirect('/dashboard'); // O 403 page
  }
  
  return user;
}
```

**Perché `cache()`?**
La funzione `cache` di React permette di cachare il risultato di una funzione per la durata di una request, evitando chiamate multiple al database per gli stessi dati. Ad esempio, se chiami `getUser()` in 10 componenti diversi nella stessa request, il database viene interrogato una sola volta.

#### 2. Funzioni di Data Fetching per Entità Specifiche

```ts
// lib/dal/posts.ts
import { cache } from 'react';
import { db } from '@/lib/db/client';
import { verifySession } from './index';
import { PostDTO } from '@/lib/dto/post.dto';

/**
 * Ottiene tutti i post pubblici
 * Cached e può essere incluso nello static shell con "use cache"
 */
export const getPublicPosts = cache(async (): Promise<PostDTO[]> => {
  try {
    const posts = await db.post.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        excerpt: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            // ❌ NON includere email o dati sensibili
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return posts;
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return [];
  }
});

/**
 * Ottiene un singolo post con controllo di autorizzazione
 */
export const getPost = cache(async (postId: string) => {
  const session = await verifySession();

  try {
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!post) {
      return null;
    }

    // Se il post non è pubblicato, solo l'autore può vederlo
    if (!post.published && post.authorId !== session?.userId) {
      return null;
    }

    return post;
  } catch (error) {
    console.error('Failed to fetch post:', error);
    return null;
  }
});

/**
 * Ottiene i post dell'utente corrente
 */
export const getUserPosts = cache(async () => {
  const session = await verifySession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  try {
    const posts = await db.post.findMany({
      where: { authorId: session.userId },
      orderBy: { createdAt: 'desc' },
    });

    return posts;
  } catch (error) {
    console.error('Failed to fetch user posts:', error);
    throw error;
  }
});
```

#### 3. Data Transfer Objects (DTOs)

I DTOs controllano l'esposizione dei dati: non restituire mai oggetti dati completi ai client, esponi solo ciò che è necessario.

```ts
// lib/dto/user.dto.ts

/**
 * DTO per utente pubblico (visibile a tutti)
 */
export interface PublicUserDTO {
  id: string;
  name: string;
  avatar?: string;
}

/**
 * DTO per profilo utente (visibile solo all'utente stesso)
 */
export interface UserProfileDTO extends PublicUserDTO {
  email: string;
  createdAt: Date;
  role: 'USER' | 'ADMIN';
}

/**
 * DTO per lista utenti admin
 */
export interface AdminUserDTO extends UserProfileDTO {
  lastLogin?: Date;
  isActive: boolean;
}

// ❌ MAI restituire:
// - password (anche se hashata)
// - tokens
// - API keys
// - dati di pagamento completi
// - informazioni sensibili
```

```ts
// lib/dto/post.dto.ts

export interface PostDTO {
  id: string;
  title: string;
  excerpt: string;
  createdAt: Date;
  author: PublicUserDTO;
}

export interface PostDetailDTO extends PostDTO {
  content: string;
  tags: string[];
  viewCount: number;
}
```

### Uso del DAL nei Componenti

#### Server Components

```tsx
// app/blog/page.tsx
import { getPublicPosts } from '@/lib/dal/posts';
import { cacheLife } from 'next/cache';

export default async function BlogPage() {
  "use cache"; // 🆕 Cache l'intera pagina
  cacheLife('hours');
  
  // Il DAL gestisce tutto: fetch, autorizzazione, DTO
  const posts = await getPublicPosts();

  return (
    <div>
      <h1>Blog</h1>
      <ul>
        {posts.map(post => (
          <li key={post.id}>
            <h2>{post.title}</h2>
            <p>{post.excerpt}</p>
            <span>by {post.author.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### Con Autorizzazione

```tsx
// app/dashboard/page.tsx
import { requireAuth } from '@/lib/dal';
import { getUserPosts } from '@/lib/dal/posts';
import { Suspense } from 'react';

export default async function DashboardPage() {
  // Controllo autorizzazione - redirect se non autenticato
  await requireAuth();

  return (
    <div>
      <h1>My Dashboard</h1>
      <Suspense fallback={<PostsSkeleton />}>
        <UserPosts />
      </Suspense>
    </div>
  );
}

async function UserPosts() {
  // L'autorizzazione è già verificata da requireAuth()
  // ma getUserPosts() fa un ulteriore controllo interno
  const posts = await getUserPosts();

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

#### Route Admin

```tsx
// app/admin/users/page.tsx
import { requireAdmin } from '@/lib/dal';
import { getAllUsers } from '@/lib/dal/users';

export default async function AdminUsersPage() {
  // Solo admin possono accedere
  const admin = await requireAdmin();

  const users = await getAllUsers();

  return (
    <div>
      <h1>User Management</h1>
      <p>Logged in as: {admin.name} (Admin)</p>
      <UserTable users={users} />
    </div>
  );
}
```

### DAL con Server Actions

```ts
// lib/dal/posts.ts (continuazione)

/**
 * Crea un nuovo post
 * Usata da Server Actions
 */
export async function createPost(data: {
  title: string;
  content: string;
  published: boolean;
}) {
  const session = await verifySession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  try {
    const post = await db.post.create({
      data: {
        ...data,
        authorId: session.userId,
      },
    });

    return post;
  } catch (error) {
    console.error('Failed to create post:', error);
    throw new Error('Failed to create post');
  }
}

/**
 * Aggiorna un post esistente
 */
export async function updatePost(
  postId: string,
  data: Partial<{ title: string; content: string; published: boolean }>
) {
  const session = await verifySession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  try {
    // Verifica che l'utente sia il proprietario
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== session.userId) {
      throw new Error('Forbidden: You can only edit your own posts');
    }

    const updatedPost = await db.post.update({
      where: { id: postId },
      data,
    });

    return updatedPost;
  } catch (error) {
    console.error('Failed to update post:', error);
    throw error;
  }
}
```

```tsx
// app/actions/posts.ts
"use server";

import { z } from 'zod';
import { updateTag } from 'next/cache';
import { createPost, updatePost } from '@/lib/dal/posts';

const postSchema = z.object({
  title: z.string().min(3).max(100),
  content: z.string().min(10),
  published: z.boolean(),
});

export async function createPostAction(formData: FormData) {
  // 1. Validazione input
  const rawData = {
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published') === 'true',
  };

  const validatedData = postSchema.parse(rawData);

  try {
    // 2. Il DAL gestisce autorizzazione e creazione
    const post = await createPost(validatedData);

    // 3. Invalida cache per aggiornamento immediato
    updateTag('posts');

    return { success: true, post };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function updatePostAction(postId: string, formData: FormData) {
  const rawData = {
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    published: formData.get('published') === 'true',
  };

  const validatedData = postSchema.partial().parse(rawData);

  try {
    const post = await updatePost(postId, validatedData);
    updateTag(`post-${postId}`);
    updateTag('posts');

    return { success: true, post };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
```

### Pattern Avanzati

#### 1. Role-Based Access Control (RBAC)

```ts
// lib/dal/rbac.ts
import { verifySession, getUser } from './index';

export type Permission = 
  | 'posts:read'
  | 'posts:write'
  | 'posts:delete'
  | 'users:read'
  | 'users:write'
  | 'users:delete';

const rolePermissions: Record<string, Permission[]> = {
  USER: ['posts:read', 'posts:write'],
  EDITOR: ['posts:read', 'posts:write', 'posts:delete'],
  ADMIN: [
    'posts:read', 'posts:write', 'posts:delete',
    'users:read', 'users:write', 'users:delete',
  ],
};

export async function hasPermission(permission: Permission): Promise<boolean> {
  const user = await getUser();
  
  if (!user) return false;
  
  const permissions = rolePermissions[user.role] || [];
  return permissions.includes(permission);
}

export async function requirePermission(permission: Permission) {
  const allowed = await hasPermission(permission);
  
  if (!allowed) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

// Uso
export async function deletePost(postId: string) {
  await requirePermission('posts:delete');
  
  // ... logica di cancellazione
}
```

#### 2. Owner-Based Access Control

```ts
// lib/dal/authorization.ts
import { verifySession } from './index';

export async function requireOwnership(
  resourceType: 'post' | 'comment' | 'profile',
  resourceId: string
) {
  const session = await verifySession();
  
  if (!session) {
    throw new Error('Unauthorized');
  }

  let ownerId: string | null = null;

  switch (resourceType) {
    case 'post':
      const post = await db.post.findUnique({
        where: { id: resourceId },
        select: { authorId: true },
      });
      ownerId = post?.authorId || null;
      break;
    
    case 'comment':
      const comment = await db.comment.findUnique({
        where: { id: resourceId },
        select: { userId: true },
      });
      ownerId = comment?.userId || null;
      break;
    
    case 'profile':
      ownerId = resourceId; // Profile ID è lo user ID
      break;
  }

  if (ownerId !== session.userId) {
    throw new Error('Forbidden: You do not own this resource');
  }
}
```

#### 3. DAL con Cache Tagging

```ts
// lib/dal/products.ts
import { cache } from 'react';
import { cacheTag, cacheLife } from 'next/cache';

export async function getProducts() {
  "use cache";
  cacheTag('products');
  cacheLife('hours');

  const products = await db.product.findMany({
    where: { active: true },
  });

  return products;
}

export async function getProduct(id: string) {
  "use cache";
  cacheTag(`product-${id}`, 'products');
  cacheLife('hours');

  const product = await db.product.findUnique({
    where: { id },
  });

  return product;
}

// Nelle Server Actions
export async function updateProductAction(id: string, data: any) {
  "use server";
  
  await updateProduct(id, data);
  
  // Invalida cache specifica e generale
  updateTag(`product-${id}`);
  updateTag('products');
}
```

### Security Checklist per DAL

Un audit di sicurezza dovrebbe concentrarsi principalmente sul Data Access Layer, dove è più facile individuare problemi di sicurezza grazie alla superficie ridotta.

**✅ Checklist:**

- [ ] **Autenticazione**: Ogni funzione DAL verifica `verifySession()`?
- [ ] **Autorizzazione**: Verifichi ownership/permissions prima delle operazioni?
- [ ] **DTO Pattern**: Restituisci solo campi sicuri, mai password/tokens?
- [ ] **Input Validation**: Validi tutti gli input (usa Zod o simili)?
- [ ] **Error Handling**: Gli errori non espongono dettagli interni?
- [ ] **Env Variables**: Le API keys sono accessibili solo dal DAL?
- [ ] **SQL Injection**: Usi ORM/query builder (Prisma, Drizzle)?
- [ ] **Rate Limiting**: Implementato per operazioni sensibili?
- [ ] **Logging**: Loggi accessi e modifiche senza esporre dati sensibili?
- [ ] **Cache Invalidation**: Invalidi correttamente la cache dopo mutazioni?

### Vantaggi con Next.js 16

Con Cache Components e il nuovo modello di caching:

**1. Caching Esplicito nel DAL**
```ts
export async function getCachedData() {
  "use cache";
  cacheLife('hours');
  cacheTag('data');
  
  // Autorizzazione E caching
  await requireAuth();
  return await db.query('...');
}
```

**2. Separazione tra Cached e Dynamic**
```ts
// Cached - incluso nello static shell
export async function getStaticContent() {
  "use cache";
  return await db.staticContent.findMany();
}

// Dynamic - sempre fresco
export async function getUserNotifications(userId: string) {
  // NO "use cache" - sempre real-time
  await requireAuth();
  return await db.notifications.findMany({ where: { userId } });
}
```

**3. updateTag per UX Immediata**
```ts
export async function updateUserProfile(data: any) {
  const session = await verifySession();
  await db.user.update({ where: { id: session.userId }, data });
  
  // 🆕 L'utente vede immediatamente le modifiche
  updateTag(`user-${session.userId}`);
}
```

### updateTag() - Read-Your-Writes Semantics

updateTag() è una nuova API esclusiva per Server Actions che fornisce semantica read-your-writes, invalidando e aggiornando immediatamente i dati in cache all'interno della stessa richiesta.

```tsx
// app/actions.ts
"use server";

import { updateTag } from 'next/cache';

export async function updateUserProfile(userId: string, profile: Profile) {
  await db.users.update(userId, profile);
  
  // 🆕 Invalida e aggiorna immediatamente - l'utente vede subito le modifiche
  updateTag(`user-${userId}`);
}
```

**Quando usare:**
- ✅ Forms e azioni interattive dove l'utente si aspetta di vedere immediatamente i cambiamenti
- ✅ User settings, profile updates
- ✅ Qualsiasi scenario "read-your-writes"

### revalidateTag() - Stale-While-Revalidate

revalidateTag() ora richiede un profilo cacheLife come secondo argomento per abilitare il comportamento stale-while-revalidate (SWR).

```tsx
// app/actions.ts
"use server";

import { revalidateTag } from 'next/cache';

export async function refreshBlogPosts() {
  // ✅ Usa un profilo cacheLife predefinito (raccomandato 'max')
  revalidateTag('blog-posts', 'max');
  
  // Altri profili disponibili
  revalidateTag('news-feed', 'hours');
  revalidateTag('analytics', 'days');
  
  // Oppure usa un oggetto inline personalizzato
  revalidateTag('custom', {
    revalidate: 3600,
    staleWhileRevalidate: 86400
  });
}
```

**Quando usare:**
- ✅ Contenuti statici che possono tollerare eventual consistency
- ✅ Blog posts, news feeds
- ✅ Contenuti che non richiedono aggiornamenti immediati

### refresh() - Aggiorna il Router Client

refresh() permette di aggiornare il router client dall'interno di una Server Action.

```tsx
// app/actions.ts
"use server";

import { refresh } from 'next/cache';

export async function markNotificationAsRead(notificationId: string) {
  await db.notifications.markAsRead(notificationId);
  
  // 🆕 Aggiorna il conteggio notifiche nell'header
  refresh();
}
```

### cacheLife e cacheTag (Stabili)

```tsx
// 🆕 Non serve più il prefisso "unstable_"
import { cacheLife, cacheTag } from 'next/cache';

// Prima: unstable_cacheLife
// Ora: cacheLife (stabile)
```

## Server Actions

Le Server Actions permettono di eseguire codice *esclusivamente* sul server, in risposta a interazioni dell'utente (es. sottomissione di form).

*   **`"use server";`:** Direttiva *obbligatoria* all'inizio di una funzione (o di un file) per trasformarla in una Server Action.
*   **Chiamata Diretta da Client Components:**  Puoi chiamare le Server Actions *direttamente* dai Client Components (senza creare Route Handlers API).
*   **Gestione Form:** Ideali per la gestione dei form (validazione, sottomissione, ecc.).
* **Progressive Enhancement**: Funzionano anche se Javascript è disabilitato.

**Esempio: `app/add-product/page.tsx`**

```tsx
// app/add-product/page.tsx
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Server Action
async function addProduct(formData: FormData) {
  "use server";

  const schema = z.object({
    name: z.string().min(3),
    price: z.coerce.number().positive(),
  });

  const rawData = Object.fromEntries(formData);
    
  try {
    const validatedData = schema.parse(rawData);

    // ... invia i dati al database o a un'API ...
    const response = await fetch('YOUR_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedData),
    });

    if (!response.ok) {
      throw new Error('Failed to add product');
    }

    revalidatePath('/products'); // Invalida la cache dopo l'aggiunta

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation Error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}

export default function AddProductPage() {
  return (
    <form action={addProduct}>
      <input type="text" name="name" placeholder="Product Name" required />
      <input type="number" name="price" placeholder="Price" required />
      <button type="submit">Add Product</button>
    </form>
  );
}
```

**Esempio con updateTag (Next.js 16):**

```tsx
// app/actions.ts
"use server";

import { updateTag } from 'next/cache';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(3),
  price: z.coerce.number().positive(),
});

export async function addProduct(formData: FormData) {
  const rawData = Object.fromEntries(formData);
  const validatedData = productSchema.parse(rawData);

  const newProduct = await db.products.create(validatedData);
  
  // 🆕 Usa updateTag per aggiornamento immediato
  updateTag('products');
  
  return { success: true, product: newProduct };
}
```

*   **`action={addProduct}`:**  L'attributo `action` del form è impostato *direttamente* sulla Server Action.
* **Validazione (Zod):**  Usa Zod (o una libreria simile) per validare i dati del form *prima* di inviarli al server.
* **`revalidatePath`:** Invalida la cache per la route `/products` dopo aver aggiunto un prodotto.
* **🆕 `updateTag`:** Nuova API per aggiornamento immediato con semantica read-your-writes.

## 🆕 React 19.2 e React Compiler

Next.js 16 supporta React 19.2 e include il React Compiler stabile.

### React Compiler (Stabile)

Il React Compiler ottimizza automaticamente i componenti applicando memoization, eliminando la necessità di usare manualmente `useMemo`, `useCallback` e `React.memo`.

**Abilitare il React Compiler:**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    reactCompiler: true, // Abilita il React Compiler
  }
}

module.exports = nextConfig
```

**Vantaggi:**
- 🚀 Memoization automatica
- 📉 Meno re-render non necessari
- 🧹 Codice più pulito (meno hook di ottimizzazione manuali)

**Esempio - Prima e Dopo:**

```tsx
// ❌ Prima (Next.js 15) - Ottimizzazione manuale
"use client";

import { useMemo, useCallback } from 'react';

function TodoList({ todos, filter }) {
  const filteredTodos = useMemo(() => {
    return todos.filter(todo => todo.status === filter);
  }, [todos, filter]);

  const handleToggle = useCallback((id) => {
    // ... logica toggle
  }, []);

  return (
    <ul>
      {filteredTodos.map(todo => (
        <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
      ))}
    </ul>
  );
}

// ✅ Dopo (Next.js 16 con React Compiler) - Memoization automatica
"use client";

function TodoList({ todos, filter }) {
  // Il compiler ottimizza automaticamente
  const filteredTodos = todos.filter(todo => todo.status === filter);

  const handleToggle = (id) => {
    // ... logica toggle
  };

  return (
    <ul>
      {filteredTodos.map(todo => (
        <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
      ))}
    </ul>
  );
}
```

### Nuove API di React 19.2

**1. View Transitions API:**

```tsx
"use client";

import { useTransition } from 'react';

function Navigation() {
  const [isPending, startTransition] = useTransition();

  const navigate = (path: string) => {
    startTransition(() => {
      // La navigazione avviene con una transizione smooth
      window.location.href = path;
    });
  };

  return (
    <nav>
      <button onClick={() => navigate('/about')}>
        About {isPending && '...'}
      </button>
    </nav>
  );
}
```

**2. useEffectEvent() (Sperimentale):**

```tsx
"use client";

import { useState, useEffectEvent } from 'react';

function ChatRoom({ roomId }) {
  const [message, setMessage] = useState('');

  // 🆕 useEffectEvent - funzione stabile che non causa re-trigger
  const onConnected = useEffectEvent(() => {
    console.log('Connected to', roomId);
    // Può leggere il valore corrente di message senza causare re-trigger
    console.log('Current message:', message);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', onConnected);
    return () => connection.disconnect();
  }, [roomId]); // Solo roomId come dipendenza, non onConnected

  return <input value={message} onChange={e => setMessage(e.target.value)} />;
}
```

**3. <Activity/> Component:**

```tsx
"use client";

import { Activity } from 'react';

function LoadingState() {
  return (
    <Activity>
      <div>Loading data...</div>
      {/* Mostra automaticamente un loader durante le transizioni */}
    </Activity>
  );
}
```

## Autenticazione (con Clerk)

Clerk è un servizio di autenticazione e gestione utenti che semplifica l'integrazione dell'autenticazione in Next.js.

**Passaggi:**

1.  **Account Clerk:** Crea un account su [clerk.com](https://clerk.com/).
2.  **Nuova Applicazione:** Crea una nuova applicazione Clerk.
3.  **Installazione:**

    ```bash
    npm install @clerk/nextjs
    ```

4.  **`.env.local`:**

    ```
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...
    ```

5.  **🆕 `proxy.ts` (o `middleware.ts` deprecato):**

    ```ts
    // proxy.ts
    import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

    const protectedRoutes = ["/dashboard", "/profile"]; // Esempio
    const isProtectedRoute = createRouteMatcher(protectedRoutes);

    export function proxy(auth, req) {
      if (isProtectedRoute(req)) {
        auth.protect(); // Redirige a /sign-in se non autenticato
      }
    }

    // Oppure usa clerkMiddleware direttamente
    export default clerkMiddleware((auth, req) => {
      if (isProtectedRoute(req)) {
        auth.protect();
      }
    });

    export const config = {
      matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
    };
    ```

6.  **`ClerkProvider` (`app/layout.tsx`):**

    ```tsx
    // app/layout.tsx
    import { ClerkProvider } from '@clerk/nextjs';

    export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
        <ClerkProvider>
          <html lang="en">
            <body>{children}</body>
          </html>
        </ClerkProvider>
      );
    }
    ```

7.  **Componenti Clerk (UI):**

    ```tsx
    // components/AuthButtons.tsx (Client Component)
    "use client";

    import { SignInButton, SignUpButton, UserButton, SignedIn, SignedOut } from '@clerk/nextjs';

    export default function AuthButtons() {
      return (
        <>
          <SignedOut>
            <SignInButton mode="modal" />
            <SignUpButton mode="modal" />
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </>
      );
    }
    ```

8.  **Accesso ai Dati Utente:**

    *   **Server Components/Route Handlers:** `auth()` e `currentUser()` (da `@clerk/nextjs/server`).

        ```tsx
        // app/my-page/page.tsx (Server Component)
        import { auth, currentUser } from '@clerk/nextjs/server';

        export default async function MyPage() {
          const { userId } = await auth();
          const user = await currentUser();

          if (!userId) {
            return <div>Not authenticated</div>;
          }

          return <div>User ID: {userId}, Name: {user?.firstName}</div>;
        }
        ```

    *   **Client Components:** `useUser()` e `useAuth()` (da `@clerk/nextjs`).

        ```tsx
        // components/UserProfile.tsx (Client Component)

        "use client";

        import { useUser, useAuth } from "@clerk/nextjs";

        export default function UserProfile() {
          const { isLoaded, isSignedIn, user } = useUser();
          const { isLoaded: isAuthLoaded, userId } = useAuth();

          if (!isAuthLoaded || !userId) {
            return null;
          }

          if (!isSignedIn) {
            return <div>Not signed in</div>;
          }

          return (
            <div>
              <p>User ID: {userId}</p>
              <p>Name: {user.firstName} {user.lastName}</p>
              {/* ... altre informazioni sull'utente ... */}
            </div>
          );
        }
        ```

**Clerk semplifica notevolmente l'implementazione di autenticazione, registrazione, gestione utenti e protezione delle route.**

## 🆕 Migrazione da Next.js 15 a 16

### Breaking Changes Principali

1. **Async `params` e `searchParams`:**
   ```tsx
   // ❌ Next.js 15
   function Page({ params, searchParams }) {
     const { id } = params; // Sincrono
   }

   // ✅ Next.js 16
   async function Page({ params, searchParams }) {
     const { id } = await params; // Asincrono
     const query = await searchParams; // Asincrono
   }
   ```

2. **Node.js 18 non più supportato:**
   - Aggiorna a Node.js 20.9.0 o superiore

3. **Middleware → Proxy:**
   - Rinomina `middleware.ts` in `proxy.ts` (opzionale ma raccomandato)

4. **Caching di default cambiato:**
   - Prima: fetch() cachava per default
   - Ora: tutto è dinamico per default, usa `"use cache"` per opt-in

### Guida di Migrazione Step-by-Step

**1. Aggiorna Next.js:**

```bash
npm install next@latest react@latest react-dom@latest
```

**2. Aggiorna params e searchParams:**

```bash
# Genera type helpers
npx next typegen

# Esegui il codemod automatico
npx @next/codemod@latest next-async-request-api .
```

**3. Rinomina middleware (opzionale):**

```bash
mv src/middleware.ts src/proxy.ts
```

**4. Revedi la strategia di caching:**

- Identifica le pagine che dovrebbero essere cachate
- Aggiungi `"use cache"` dove appropriato
- Testa il comportamento dell'app

**5. Abilita Turbopack (già predefinito):**

```bash
npm run dev  # Turbopack è già attivo
npm run build  # Build di produzione con Turbopack
```

**6. (Opzionale) Abilita React Compiler:**

```js
// next.config.js
module.exports = {
  experimental: {
    reactCompiler: true,
  }
}
```

## Best Practices per Next.js 16

### 1. Caching Strategico

```tsx
// ✅ Cache pagine statiche
"use cache";

export default async function BlogPost({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  return <Article post={post} />;
}

// ✅ Cache funzioni specifiche
async function getPopularPosts() {
  "use cache";
  return await db.posts.findMany({ orderBy: { views: 'desc' } });
}

// ✅ Dati dinamici senza cache
async function getUserNotifications(userId: string) {
  // NO "use cache" - sempre fresco
  return await db.notifications.findMany({ where: { userId } });
}
```

### 2. Usa updateTag per UX Immediata

```tsx
// ✅ Per form e azioni dove l'utente si aspetta feedback immediato
"use server";

import { updateTag } from 'next/cache';

export async function updateProfile(formData: FormData) {
  await db.update(/* ... */);
  updateTag('user-profile'); // L'utente vede subito le modifiche
}

// ✅ Usa revalidateTag per contenuti che possono essere stale
export async function publishBlogPost(postData: Post) {
  await db.posts.create(postData);
  revalidateTag('blog-posts', 'max'); // Eventual consistency OK
}
```

### 3. Sfrutta il React Compiler

```tsx
// ✅ Scrivi codice pulito, lascia che il compiler ottimizzi
"use client";

function ProductList({ products, filters }) {
  // Nessun useMemo necessario
  const filtered = products.filter(p => 
    filters.categories.includes(p.category)
  );

  // Nessun useCallback necessario
  const handleClick = (id) => {
    console.log('Clicked', id);
  };

  return filtered.map(p => (
    <Product key={p.id} product={p} onClick={handleClick} />
  ));
}
```

### 4. Ottimizza il Routing

```tsx
// ✅ Sfrutta il layout deduplication
// app/products/layout.tsx
export default function ProductsLayout({ children }) {
  // Questo layout viene scaricato una sola volta
  // anche se hai 100 link a diverse pagine prodotto
  return (
    <div>
      <ProductsSidebar />
      {children}
    </div>
  );
}
```

### 5. Type Safety con Type Helpers

```tsx
// ✅ Usa i type helpers generati
import type { PageProps } from '@/types/page';

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const { sort } = await props.searchParams;
  
  // TypeScript sa esattamente quali params e searchParams esistono
  return <BlogPost slug={slug} sort={sort} />;
}
```

## Risorse Aggiuntive

- 📚 [Documentazione Ufficiale Next.js 16](https://nextjs.org/docs)
- 🚀 [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- 🎓 [Guida alla Migrazione](https://nextjs.org/docs/app/building-your-application/upgrading)
- 💬 [Discord Community](https://nextjs.org/discord)
- 🐙 [GitHub Repository](https://github.com/vercel/next.js)

## Riepilogo delle Novità Chiave

| Feature | Descrizione | Impatto |
|---------|------------|---------|
| 🚀 **Turbopack Stabile** | Bundler predefinito | 2-5x più veloce |
| 🎯 **Cache Components** | Caching esplicito con `"use cache"` | Più controllo e chiarezza |
| 🔄 **updateTag()** | Read-your-writes semantics | UX migliore per form |
| ⚠️ **Async params** | `params` e `searchParams` asincroni | Breaking change |
| 🧠 **React Compiler** | Memoization automatica | Meno boilerplate |
| 🔌 **proxy.js** | Sostituisce middleware.ts | Naming più chiaro |
| 🌐 **Routing Migliorato** | Layout deduplication | Meno dati scaricati |

---

**Nota**: Questa guida copre le funzionalità principali di Next.js 16. Per approfondimenti su argomenti specifici, consulta la [documentazione ufficiale](https://nextjs.org/docs).