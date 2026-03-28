# CookieGuard RO — Raport Tehnic Detaliat

## Cuprins

1. [Ce este CookieGuard RO](#1-ce-este-cookieguard-ro)
2. [Cum funcționează un Cookie Consent Manager — Under the Hood](#2-cum-funcționează-un-cookie-consent-manager--under-the-hood)
3. [Arhitectura CookieGuard RO](#3-arhitectura-cookieguard-ro)
4. [Componenta 1: Cookie Scanner Engine](#4-componenta-1-cookie-scanner-engine)
5. [Componenta 2: Consent Banner Widget (JavaScript)](#5-componenta-2-consent-banner-widget-javascript)
6. [Componenta 3: Mecanismul de Blocare a Cookie-urilor](#6-componenta-3-mecanismul-de-blocare-a-cookie-urilor)
7. [Componenta 4: Backend API & Infrastructură](#7-componenta-4-backend-api--infrastructură)
8. [Componenta 5: Dashboard Administrare](#8-componenta-5-dashboard-administrare)
9. [Componenta 6: Consent Log & Proof of Consent](#9-componenta-6-consent-log--proof-of-consent)
10. [Componenta 7: Generator Politică Cookies](#10-componenta-7-generator-politică-cookies)
11. [Componenta 8: Autentificare & Sistem de Plată](#11-componenta-8-autentificare--sistem-de-plată)
12. [Componenta 9: Landing Page & Branding](#12-componenta-9-landing-page--branding)
13. [Google Consent Mode v2 — Integrare Nativă](#13-google-consent-mode-v2--integrare-nativă)
14. [Cadrul Legal — GDPR, ePrivacy, Legea 506/2004, ANSPDCP](#14-cadrul-legal--gdpr-eprivacy-legea-5062004-anspdcp)
15. [Cum funcționează competitorii — Cookiebot, OneTrust, CookieYes](#15-cum-funcționează-competitorii--cookiebot-onetrust-cookieyes)
16. [Diferențiatoare CookieGuard RO pentru piața din România](#16-diferențiatoare-cookieguard-ro-pentru-piața-din-românia)
17. [Starea curentă a proiectului — Board Takt](#17-starea-curentă-a-proiectului--board-takt)
18. [Ordinea de implementare recomandată](#18-ordinea-de-implementare-recomandată)
19. [Stack tehnic propus](#19-stack-tehnic-propus)
20. [Riscuri și mitigări](#20-riscuri-și-mitigări)

---

## 1. Ce este CookieGuard RO

CookieGuard RO este o platformă SaaS de gestionare a consimțământului pentru cookie-uri (Cookie Consent Management Platform — CMP), construită specific pentru piața din România. Similar cu Cookiebot, OneTrust sau CookieYes, platforma permite oricărui site web să fie conform cu GDPR, Directiva ePrivacy și legislația românească (Legea 506/2004).

### Ce oferă concret:
- **Scanare automată** a oricărui site web pentru detectarea tuturor cookie-urilor și tehnologiilor de tracking
- **Banner de consimțământ** (widget JavaScript) pe care vizitatorii îl văd și prin care acceptă/refuză categorii de cookie-uri
- **Blocare automată** a script-urilor non-esențiale până la obținerea consimțământului
- **Jurnal de consimțăminte** (proof of consent) pentru demonstrarea conformității GDPR
- **Generator automat** de pagină "Politică Cookies" în limba română
- **Dashboard** pentru administrarea site-urilor, vizualizarea rezultatelor și configurarea banner-ului
- **Sistem de plată** cu planuri adaptate pieței românești (facturare în RON)

---

## 2. Cum funcționează un Cookie Consent Manager — Under the Hood

### Fluxul complet, pas cu pas

```
┌─────────────────────────────────────────────────────────────────┐
│                        FAZA 1: SCANARE                          │
│                                                                 │
│  Proprietarul site-ului adaugă URL-ul în dashboard              │
│         │                                                       │
│         ▼                                                       │
│  Scanner-ul (browser headless) vizitează site-ul                │
│         │                                                       │
│         ▼                                                       │
│  Interceptează TOATE cookie-urile, localStorage,                │
│  sessionStorage, tracking pixels, fingerprinting                │
│         │                                                       │
│         ▼                                                       │
│  Categorizează automat fiecare cookie:                          │
│  Necesare | Funcționale | Analytics | Marketing                 │
│         │                                                       │
│         ▼                                                       │
│  Generează inventarul complet + politica cookies                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FAZA 2: CONFIGURARE                           │
│                                                                 │
│  Proprietarul configurează banner-ul din dashboard:             │
│  - Culori, text, poziție (bottom/top/modal)                     │
│  - Categorii de consimțământ                                    │
│  - Limba (română, engleză, etc.)                                │
│  - Buton "Acceptă tot" / "Refuză tot" / "Personalizează"       │
│         │                                                       │
│         ▼                                                       │
│  Primește un snippet de cod <script> de integrat pe site        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               FAZA 3: FUNCȚIONARE PE SITE                       │
│                                                                 │
│  Vizitator accesează site-ul                                    │
│         │                                                       │
│         ▼                                                       │
│  Script-ul CookieGuard se încarcă SINCRON (primul!)             │
│         │                                                       │
│         ├── Citește cookie-ul de consimțământ existent           │
│         │   (dacă vizitatorul a fost aici înainte)               │
│         │                                                       │
│         ├── Instalează hook-uri de blocare                       │
│         │   (MutationObserver, Proxy pe createElement)           │
│         │                                                       │
│         ├── Blochează TOATE script-urile non-esențiale           │
│         │   (analytics, marketing) până la consimțământ          │
│         │                                                       │
│         └── Afișează banner-ul dacă nu există consimțământ      │
│                    │                                             │
│                    ▼                                             │
│         Vizitatorul alege:                                       │
│         [Acceptă tot] [Refuză tot] [Personalizează]             │
│                    │                                             │
│                    ▼                                             │
│         ├── Salvează alegerea în cookie first-party              │
│         ├── Activează script-urile din categoriile acceptate     │
│         ├── Trimite semnale Google Consent Mode v2               │
│         ├── Trimite proof of consent la server                   │
│         └── Emite evenimente DOM pentru codul site-ului          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Arhitectura CookieGuard RO

```
┌────────────────────────────────────────────────────────────────────┐
│                     CookieGuard RO — Cloud                         │
│                                                                    │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Scanner  │  │ Cookie DB  │  │Config API │  │Consent Logger │  │
│  │(Playwright│  │(bază date  │  │(setări    │  │(jurnal        │  │
│  │ headless)│  │ cookies    │  │ banner)   │  │ consimțăminte)│  │
│  │          │  │ cunoscute) │  │           │  │               │  │
│  └────┬─────┘  └─────┬──────┘  └─────┬─────┘  └───────┬───────┘  │
│       │              │               │                 │          │
│  ┌────┴──────────────┴───────────────┴─────────────────┴───────┐  │
│  │                    PostgreSQL Database                        │  │
│  │  users | sites | scans | cookies | consents | policies       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Bun + Hono API                            │  │
│  │  /api/scan    /api/config   /api/consent   /api/dashboard     │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │                                  │
│  ┌──────────────────────────────┴───────────────────────────────┐  │
│  │                        CDN Edge                               │  │
│  │         cookieguard-widget.min.js  (~12KB gzipped)            │  │
│  │         + config cache per site                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Browser Vizitator                             │
│                                                                    │
│  <script src="https://cdn.cookieguard.ro/w.js"                     │
│          data-site-id="abc123"></script>                            │
│                                                                    │
│  → Încarcă widget → Blochează scripturi → Afișează banner          │
│  → Colectează consimțământ → Activează scripturi acceptate         │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Componenta 1: Cookie Scanner Engine

### Ce face
Crawler-ul scanează un site web complet și detectează TOATE tehnologiile de tracking utilizate.

### Cum funcționează tehnic

#### Pasul 1: Crawling cu browser headless

Scanner-ul folosește **Playwright cu Chromium** într-un profil curat (fără cookie-uri preexistente):

```
1. Primește URL-ul de start (ex: https://exemplu.ro)
2. Deschide pagina într-un browser headless
3. Urmărește link-urile interne (breadth-first, limită ~500 pagini)
4. Pe fiecare pagină, instrumentează browser-ul pentru interceptare
```

#### Pasul 2: Interceptare cookie-uri

Browser-ul headless este instrumentat prin Chrome DevTools Protocol (CDP):

- **Cookie-uri HTTP**: Interceptează header-ele `Set-Cookie` din răspunsurile serverului
- **Cookie-uri JavaScript**: Monitorizează scrierile `document.cookie` prin injectarea unui wrapper înainte de execuția oricărui script al paginii
- **Atribute capturate per cookie**: `name`, `value`, `domain`, `path`, `expires/max-age`, `secure`, `httpOnly`, `sameSite`

#### Pasul 3: Interceptare localStorage / sessionStorage

Se injectează un wrapper peste `Storage.prototype.setItem` prin `Page.evaluateOnNewDocument()` — aceasta rulează înainte de orice script al paginii:

```javascript
// Conceptual — injectat în pagină înainte de orice alt script
const origSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
  // Loghează: ce cheie, ce valoare, care script a scris-o
  window.__cookieguard_storage_log.push({
    type: this === localStorage ? 'localStorage' : 'sessionStorage',
    key, value,
    stack: new Error().stack  // pentru a identifica scriptul sursă
  });
  return origSetItem.call(this, key, value);
};
```

#### Pasul 4: Detectare tracking pixels

Monitorizează TOATE request-urile de rețea prin `Page.on('request')`:
- Identifică tracking pixels prin pattern matching pe URL-uri cunoscute (facebook.com/tr, google-analytics.com/collect, doubleclick.net)
- Detectează imagini 1x1 pixel sau răspunsuri fără conținut

#### Pasul 5: Detectare fingerprinting

Monitorizează apeluri la API-uri specifice fingerprinting-ului:
- `canvas.toDataURL()` — canvas fingerprinting
- `AudioContext` — audio fingerprinting
- `navigator.plugins` — browser fingerprinting
- `WebGL renderer` — GPU fingerprinting
- Biblioteci cunoscute (FingerprintJS) sunt identificate prin hash de script sau URL

#### Pasul 6: Categorizare automată

Fiecare cookie detectat este clasificat automat:

| Categorie | Exemple | Criteriu |
|-----------|---------|----------|
| **Necesare** | `PHPSESSID`, `__stripe_mid`, `csrf_token` | Session cookies, securitate, plăți |
| **Funcționale** | `lang`, `locale`, `dark_mode` | Preferințe utilizator, UI state |
| **Analytics** | `_ga`, `_gid`, `_hjid`, `_hj*` | Statistici, heatmaps, A/B testing |
| **Marketing** | `_fbp`, `fr`, `_gcl_*`, `IDE` | Publicitate, retargeting, conversii |

**Mecanismul de clasificare (în ordine de prioritate):**

1. **Baza de date de cookie-uri cunoscute** — O bază de date cu ~5.000+ cookie-uri mapate: `cookie_name + domain → categorie + furnizor + descriere + durată`
2. **Pattern matching pe nume**: `_ga*` → Analytics, `_fb*` → Marketing, `PHPSESSID` → Necesare
3. **Analiza domeniului**: Cookie-uri third-party de la domenii de advertising → Marketing
4. **Analiza scriptului sursă**: Dacă URL-ul scriptului care a setat cookie-ul e de la Google Analytics → Statistics
5. **Euristici pe durată**: Cookie de sesiune de la domeniul propriu → probabil Necesar; cookie 2 ani de la domeniu terț → probabil Marketing
6. **Analiza valorii**: UUID-uri → probabil tracking; `true/false/en` → probabil funcțional
7. **Revizuire umană**: Cookie-urile neclasificate sunt marcate pentru revizuire în dashboard

#### Output-ul scanării

```json
{
  "siteUrl": "https://exemplu.ro",
  "scanDate": "2026-03-27T14:00:00Z",
  "pagesScanned": 47,
  "cookies": [
    {
      "name": "_ga",
      "domain": ".exemplu.ro",
      "provider": "Google Analytics",
      "category": "analytics",
      "duration": "2 ani",
      "type": "HTTP cookie",
      "firstParty": true,
      "pagesFound": ["/", "/despre", "/contact"],
      "initiator": "https://www.googletagmanager.com/gtag/js",
      "description": "Cookie Google Analytics utilizat pentru a distinge utilizatorii unici"
    }
  ],
  "localStorage": [...],
  "sessionStorage": [...],
  "trackingPixels": [...],
  "fingerprinting": [],
  "summary": {
    "necessary": 3,
    "functional": 1,
    "analytics": 5,
    "marketing": 8,
    "unclassified": 2
  }
}
```

---

## 5. Componenta 2: Consent Banner Widget (JavaScript)

### Ce face
Un script JavaScript ușor (~12KB gzipped) care se integrează pe orice site printr-un singur `<script>` tag. Afișează banner-ul de consimțământ, blochează script-urile non-esențiale și gestionează starea consimțământului.

### Cum se integrează

Proprietarul site-ului adaugă în `<head>`:
```html
<script src="https://cdn.cookieguard.ro/w.js"
        data-site-id="abc123"
        data-blocking-mode="auto"
        type="text/javascript"></script>
```

**Critic: Script-ul se încarcă SINCRON** (fără `async`/`defer`). Aceasta este decizia arhitecturală cea mai importantă — script-ul TREBUIE să se execute înainte de orice alt script de pe pagină pentru a putea bloca cookie-urile non-esențiale.

### Secvența de inițializare

```
Timeline vizitator:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Browser-ul începe parsarea HTML
2. Întâlnește script-ul CookieGuard (sincron) → oprește parsarea
3. Descarcă script-ul (~50ms de la CDN edge)
4. Execută script-ul:
   a. Citește cookie-ul de consimțământ existent (~0.1ms)
   b. Instalează hook-urile de blocare (~1ms)
   c. Dacă nu există consimțământ: fetch config + render banner (~100ms)
5. Parsarea HTML continuă — scripturile sunt blocate/permise
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Impact pe performanță: +50-200ms pe First Contentful Paint
```

### Starea consimțământului

Starea se salvează într-un **cookie first-party** pe domeniul site-ului:

```
Cookie: cookieguard_consent
Value: {
  "stamp": "abc123",
  "necessary": true,
  "functional": false,
  "analytics": true,
  "marketing": false,
  "method": "explicit",
  "action": "custom",
  "version": "2026-03-20-v3",
  "utc": 1711500000000,
  "region": "ro"
}
Max-Age: 365 zile (12 luni)
```

La fiecare vizită ulterioară:
1. Script-ul citește acest cookie
2. Dacă versiunea configurației s-a schimbat (cookies noi detectate la rescanare) → re-afișează banner-ul
3. Dacă versiunea e aceeași → aplică consimțământul salvat fără banner

### UI Banner

Trei variante de afișare, configurabile din dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│ VARIANTA 1: Banner bottom                                   │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Folosim cookie-uri pentru a vă oferi cea mai bună       │ │
│ │ experiență. Alegeți categoriile pe care le acceptați.    │ │
│ │                                                         │ │
│ │ [Acceptă tot]  [Refuză tot]  [Personalizează]          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ VARIANTA 2: Modal central                                   │
│                                                             │
│          ┌───────────────────────────────────┐              │
│          │  Setări Cookie-uri                │              │
│          │                                   │              │
│          │  ☑ Necesare (mereu active)        │              │
│          │  ☐ Funcționale                    │              │
│          │  ☐ Analytics                      │              │
│          │  ☐ Marketing                      │              │
│          │                                   │              │
│          │  [Salvează] [Acceptă tot]         │              │
│          └───────────────────────────────────┘              │
│                                                             │
│ VARIANTA 3: Floating corner                                 │
│                                                             │
│                              ┌──────────────┐              │
│                              │ 🍪 Cookie-uri │              │
│                              │  [Setări]     │              │
│                              └──────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### Izolarea CSS

Banner-ul se renderizează în **Shadow DOM** pentru a preveni conflicte de stiluri:

```javascript
const host = document.createElement('div');
host.id = 'cookieguard-root';
const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `
  <style>/* stiluri complet izolate */</style>
  <div class="cg-banner">...</div>
`;
document.body.appendChild(host);
```

Avantaje:
- CSS-ul site-ului NU afectează banner-ul
- CSS-ul banner-ului NU afectează site-ul
- Nu e nevoie de prefixare manuală a selectorilor

### API JavaScript

Widget-ul expune un API pentru codul site-ului:

```javascript
// Verificare stare consimțământ
CookieGuard.consent.analytics    // true/false
CookieGuard.consent.marketing    // true/false
CookieGuard.consent.functional   // true/false

// Evenimente
window.addEventListener('cookieguard:accept', (e) => {
  console.log('Categorii acceptate:', e.detail.categories);
});
window.addEventListener('cookieguard:reject', (e) => {
  // Utilizatorul a refuzat tot
});
window.addEventListener('cookieguard:change', (e) => {
  // Consimțământul s-a modificat
});

// Deschide manual banner-ul (pentru link "Setări cookies" din footer)
CookieGuard.show();

// Retrage consimțământul programatic
CookieGuard.revokeAll();
```

---

## 6. Componenta 3: Mecanismul de Blocare a Cookie-urilor

Aceasta este **cea mai complexă parte tehnic** a întregului sistem. Scopul: niciun script non-esențial nu trebuie să se execute înainte de consimțământ.

### Abordarea 1: Rescrierea tipului de script (Manual)

Cea mai veche și fiabilă metodă. Proprietarul site-ului modifică manual fiecare script:

```html
<!-- ÎNAINTE: se execută imediat -->
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>

<!-- DUPĂ: inert, nu se execută -->
<script type="text/plain"
        data-cookieguard="analytics"
        src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
```

**De ce funcționează:** Browser-ele execută doar script-urile cu `type="text/javascript"` (sau fără type). Setând `type="text/plain"`, browser-ul tratează conținutul ca date, nu ca cod.

**Activare la consimțământ:**
```javascript
function activateCategory(category) {
  document.querySelectorAll(`script[data-cookieguard="${category}"]`)
    .forEach(blocked => {
      const script = document.createElement('script');
      script.src = blocked.src;
      script.textContent = blocked.textContent;
      // IMPORTANT: trebuie creat element NOU — schimbarea type-ului
      // pe elementul existent NU declanșează execuția
      blocked.parentNode.insertBefore(script, blocked);
      blocked.remove();
    });
}
```

### Abordarea 2: Blocare automată (Modul implicit CookieGuard)

Aceasta este funcționalitatea "magică" — nu necesită modificări manuale din partea proprietarului site-ului.

#### Pas 1: Interceptarea createElement

```javascript
// Script-ul CookieGuard se încarcă primul, sincron
const origCreateElement = document.createElement.bind(document);
document.createElement = function(tagName) {
  const el = origCreateElement(tagName);
  if (tagName.toLowerCase() === 'script') {
    return new Proxy(el, {
      set(target, prop, value) {
        if (prop === 'src') {
          const category = classifyUrl(value);
          if (category && !hasConsent(category)) {
            // Blochează: setează type inert și salvează src-ul original
            target.type = 'text/plain';
            target.dataset.blockedSrc = value;
            target.dataset.consentCategory = category;
            return true;
          }
        }
        target[prop] = value;
        return true;
      }
    });
  }
  return el;
};
```

#### Pas 2: MutationObserver pentru script-uri inline/statice

```javascript
const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.tagName === 'SCRIPT' && node.src) {
        const category = classifyUrl(node.src);
        if (category && !hasConsent(category)) {
          // Blochează: schimbă type-ul înainte ca browser-ul
          // să execute script-ul
          node.type = 'text/plain';
        }
      }
    }
  }
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
```

#### Pas 3: Interceptarea tracking pixels

```javascript
const OrigImage = window.Image;
window.Image = function(...args) {
  const img = new OrigImage(...args);
  const origSrc = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype, 'src'
  );
  Object.defineProperty(img, 'src', {
    set(url) {
      const category = classifyUrl(url);
      if (category && !hasConsent(category)) {
        img.dataset.blockedSrc = url;
        return; // Blochează pixel-ul
      }
      origSrc.set.call(img, url);
    },
    get() { return origSrc.get.call(img); }
  });
  return img;
};
```

#### Pas 4: Interceptarea sendBeacon și fetch

```javascript
// sendBeacon — folosit de analytics pentru pageleave events
const origSendBeacon = navigator.sendBeacon.bind(navigator);
navigator.sendBeacon = function(url, data) {
  if (classifyUrl(url) && !hasConsent(classifyUrl(url))) {
    return false; // Blochează silențios
  }
  return origSendBeacon(url, data);
};

// fetch — folosit de unele trackere moderne
const origFetch = window.fetch.bind(window);
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : input.url;
  const category = classifyUrl(url);
  if (category && !hasConsent(category)) {
    return Promise.resolve(new Response('', { status: 204 }));
  }
  return origFetch(input, init);
};
```

#### Clasificarea URL-urilor

O bază de date integrată în widget mapează domenii la categorii:

```javascript
const domainCategoryMap = {
  'google-analytics.com':    'analytics',
  'googletagmanager.com':    'analytics',
  'doubleclick.net':         'marketing',
  'googlesyndication.com':   'marketing',
  'facebook.net':            'marketing',
  'facebook.com':            'marketing',
  'hotjar.com':              'analytics',
  'clarity.ms':              'analytics',
  'intercom.io':             'functional',
  'crisp.chat':              'functional',
  'tiktok.com':              'marketing',
  'snapchat.com':            'marketing',
  'linkedin.com':            'marketing',
  'twitter.com':             'marketing',
  'pinterest.com':           'marketing',
  // ... sute de intrări
};
```

#### Ștergerea cookie-urilor la retragerea consimțământului

```javascript
function deleteCookiesForCategory(category) {
  const cookiesInCategory = getCookieDeclaration(category);
  cookiesInCategory.forEach(({ name, domain, path }) => {
    // Șterge prin setarea expirării în trecut
    document.cookie = `${name}=;domain=${domain};path=${path};` +
      `expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  });
}
```

---

## 7. Componenta 4: Backend API & Infrastructură

### Stack tehnic

| Tehnologie | Rol |
|-----------|-----|
| **Bun** | Runtime JavaScript (înlocuiește Node.js) |
| **Hono** sau **ElysiaJS** | Framework HTTP (lightweight, edge-ready) |
| **PostgreSQL** | Baza de date principală |
| **Drizzle ORM** | Type-safe ORM pentru TypeScript |
| **Playwright** | Browser headless pentru scanner |

### Schema bazei de date

```sql
-- Utilizatori
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id    TEXT UNIQUE,
  plan         TEXT DEFAULT 'free',  -- free, pro, business
  stripe_customer_id TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Site-uri monitorizate
CREATE TABLE sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  url          TEXT NOT NULL,
  name         TEXT,
  api_key      TEXT UNIQUE NOT NULL,  -- pentru widget
  config       JSONB DEFAULT '{}',    -- configurare banner
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Rezultate scanare
CREATE TABLE scans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID REFERENCES sites(id),
  status       TEXT DEFAULT 'pending',  -- pending, running, done, failed
  pages_scanned INTEGER DEFAULT 0,
  result       JSONB,                   -- inventar complet cookies
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Baza de date cookies cunoscute
CREATE TABLE known_cookies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_pattern TEXT NOT NULL,           -- regex: ^_ga.*$
  domain_pattern TEXT,
  provider     TEXT,                    -- Google Analytics
  category     TEXT NOT NULL,           -- necessary, functional, analytics, marketing
  description_ro TEXT,                  -- descriere în română
  description_en TEXT,
  typical_duration TEXT,                -- "2 ani", "sesiune"
  confidence   REAL DEFAULT 0.9
);

-- Jurnal consimțăminte
CREATE TABLE consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID REFERENCES sites(id),
  visitor_id   TEXT NOT NULL,           -- ID anonim
  ip_hash      TEXT,                    -- IP hashed, nu raw
  choices      JSONB NOT NULL,          -- {necessary:true, analytics:false, ...}
  action       TEXT NOT NULL,           -- acceptAll, rejectAll, custom
  banner_version TEXT,
  cookie_declaration_version TEXT,
  user_agent   TEXT,
  country      TEXT,
  page_url     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Politici cookies generate
CREATE TABLE policies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID REFERENCES sites(id),
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL,
  scan_id      UUID REFERENCES scans(id),
  language     TEXT DEFAULT 'ro',
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Endpoint-uri API principale

```
POST   /api/auth/register        — Înregistrare
POST   /api/auth/login            — Autentificare
POST   /api/auth/google           — OAuth Google
POST   /api/auth/refresh          — Refresh token

GET    /api/sites                  — Lista site-uri utilizator
POST   /api/sites                  — Adaugă site nou
DELETE /api/sites/:id              — Șterge site

POST   /api/scans/:siteId         — Pornește scanare
GET    /api/scans/:siteId          — Rezultate scanare
GET    /api/scans/:siteId/diff     — Diferențe față de scanarea anterioară

GET    /api/config/:apiKey         — Configurare banner (apelat de widget)
PUT    /api/sites/:id/config       — Actualizare configurare banner

POST   /api/consent                — Înregistrare consimțământ (apelat de widget)
GET    /api/consents/:siteId       — Lista consimțăminte
GET    /api/consents/:siteId/export — Export CSV/JSON

GET    /api/policy/:siteId         — Politica cookies generată
GET    /api/policy/:siteId/embed   — Versiune embeddable HTML

GET    /api/stats/:siteId          — Statistici consimțământ
POST   /api/billing/checkout       — Creare sesiune Stripe
POST   /api/billing/webhook        — Webhook Stripe
GET    /api/billing/subscription   — Stare abonament
```

### Rate limiting

```
Widget endpoints (/api/config, /api/consent):
  - 100 req/sec per API key (trafic real de vizitatori)

Dashboard endpoints:
  - 60 req/min per user

Scanner:
  - 1 scan simultan per site
  - Max 500 pagini per scan (plan Free: 100)
```

---

## 8. Componenta 5: Dashboard Administrare

### Pagini principale

```
┌────────────────────────────────────────────────────────────────┐
│  CookieGuard RO — Dashboard                                    │
│                                                                │
│  ┌──────────┐  ┌──────────────────────────────────────────┐   │
│  │ Sidebar  │  │ Main Content                              │   │
│  │          │  │                                            │   │
│  │ Dashboard│  │  Site-urile mele                           │   │
│  │ Site-uri │  │  ┌─────────────────────────────────────┐  │   │
│  │ Scanare  │  │  │ exemplu.ro           [Scanează]     │  │   │
│  │ Banner   │  │  │ Ultima scanare: 27 mar 2026         │  │   │
│  │ Consent  │  │  │ Cookies: 17 (3N / 1F / 5A / 8M)    │  │   │
│  │ Politica │  │  │ Consent rate: 73%                   │  │   │
│  │ Setări   │  │  └─────────────────────────────────────┘  │   │
│  │ Billing  │  │  ┌─────────────────────────────────────┐  │   │
│  │          │  │  │ magazin.ro           [Scanează]     │  │   │
│  │          │  │  │ Ultima scanare: 25 mar 2026         │  │   │
│  │          │  │  │ Cookies: 23 (4N / 2F / 7A / 10M)   │  │   │
│  │          │  │  │ Consent rate: 68%                   │  │   │
│  │          │  │  └─────────────────────────────────────┘  │   │
│  │          │  │                                            │   │
│  │          │  │  [+ Adaugă site nou]                      │   │
│  └──────────┘  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Pagina de configurare banner

```
┌──────────────────────────────────────────────────────────────┐
│  Configurare Banner — exemplu.ro                              │
│                                                              │
│  ┌─────────────────────────┐  ┌───────────────────────────┐ │
│  │ Setări                  │  │ Preview Live               │ │
│  │                         │  │                            │ │
│  │ Poziție: [▼ Bottom bar] │  │  ┌──────────────────────┐ │ │
│  │                         │  │  │ Acest site folosește │ │ │
│  │ Culoare primară:        │  │  │ cookie-uri...        │ │ │
│  │ [■ #2563eb]             │  │  │                      │ │ │
│  │                         │  │  │ [Acceptă] [Refuză]   │ │ │
│  │ Text buton accept:      │  │  └──────────────────────┘ │ │
│  │ [Acceptă tot        ]   │  │                            │ │
│  │                         │  │                            │ │
│  │ Text buton refuz:       │  │                            │ │
│  │ [Refuză tot         ]   │  │                            │ │
│  │                         │  │                            │ │
│  │ Limba: [▼ Română]       │  │                            │ │
│  │                         │  │                            │ │
│  │ Logo personalizat:      │  │                            │ │
│  │ [Upload]                │  │                            │ │
│  │                         │  │                            │ │
│  │ [Salvează configurarea] │  │                            │ │
│  └─────────────────────────┘  └───────────────────────────┘ │
│                                                              │
│  Codul de integrare:                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ <script src="https://cdn.cookieguard.ro/w.js"       │   │
│  │         data-site-id="abc123"></script>               │   │
│  │                                            [Copiază] │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Stack frontend

| Tehnologie | Rol |
|-----------|-----|
| **React** sau **SolidJS** | UI framework |
| **TailwindCSS** | Styling |
| **React Router** sau echivalent | Navigare SPA |
| **TanStack Query** | Data fetching + caching |

---

## 9. Componenta 6: Consent Log & Proof of Consent

### De ce este necesar

GDPR Articolul 7(1) prevede: *"Atunci când prelucrarea se bazează pe consimțământ, operatorul trebuie să fie în măsură să demonstreze că persoana vizată și-a dat consimțământul."*

Aceasta înseamnă că trebuie stocat un **jurnal complet** al fiecărui consimțământ.

### Ce se stochează per consimțământ

```json
{
  "consentId": "uuid-v4",
  "timestamp": "2026-03-27T14:30:00.000Z",
  "visitorId": "hash-anonim-random",
  "ipHash": "sha256(ip + salt)",
  "choices": {
    "necessary": true,
    "functional": false,
    "analytics": true,
    "marketing": false
  },
  "action": "custom",
  "bannerVersion": "config-hash-abc123",
  "cookieDeclarationVersion": "scan-2026-03-20",
  "userAgent": "Mozilla/5.0...",
  "country": "RO",
  "language": "ro",
  "pageUrl": "https://exemplu.ro/",
  "gpcSignal": false
}
```

**Important:**
- IP-ul se stochează **hashed**, nu în clar (GDPR minimizare date)
- `visitorId` este un identificator anonim generat aleatoriu, NU legat de identitatea reală
- Toate câmpurile sunt necesare pentru a demonstra conformitatea

### Retenția datelor

- Consimțământul e valid 12 luni (standard de industrie)
- Log-urile se păstrează 3 ani (buffer pentru investigații DPA)
- Auto-cleanup configurabil din dashboard
- Export CSV/JSON pentru audituri

### Dashboard Consent Log

```
┌──────────────────────────────────────────────────────────────┐
│  Jurnal Consimțăminte — exemplu.ro                           │
│                                                              │
│  Filtre: [Toate ▼] [Ultima lună ▼] [Export CSV]            │
│                                                              │
│  ┌────────┬──────────┬──────────┬──────────┬──────────────┐ │
│  │ Data   │ Acțiune  │ Analyt.  │ Market.  │ Funcțional   │ │
│  ├────────┼──────────┼──────────┼──────────┼──────────────┤ │
│  │ 27 mar │ Custom   │ ✓ Da     │ ✗ Nu     │ ✓ Da         │ │
│  │ 27 mar │ Acceptă  │ ✓ Da     │ ✓ Da     │ ✓ Da         │ │
│  │ 26 mar │ Refuză   │ ✗ Nu     │ ✗ Nu     │ ✗ Nu         │ │
│  │ 26 mar │ Custom   │ ✓ Da     │ ✗ Nu     │ ✗ Nu         │ │
│  │ ...    │ ...      │ ...      │ ...      │ ...          │ │
│  └────────┴──────────┴──────────┴──────────┴──────────────┘ │
│                                                              │
│  Sumar: 1,247 consimțăminte luna aceasta                    │
│  Consent rate: 73% accept | 15% custom | 12% refuz         │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Componenta 7: Generator Politică Cookies

### Ce face
Generează automat o pagină "Politică Cookies" completă în limba română, bazată pe rezultatele scanării.

### Template în română

Documentul generat include:

1. **Ce sunt cookie-urile** — explicație pe înțelesul vizitatorului
2. **Ce cookie-uri folosim** — tabel generat automat din scanare:

```
┌────────────────┬──────────────────┬────────────┬──────────┬────────────┐
│ Nume           │ Furnizor         │ Scop       │ Durată   │ Tip        │
├────────────────┼──────────────────┼────────────┼──────────┼────────────┤
│ _ga            │ Google Analytics │ Statistici │ 2 ani    │ HTTP       │
│ _gid           │ Google Analytics │ Statistici │ 24 ore   │ HTTP       │
│ _fbp           │ Facebook         │ Marketing  │ 3 luni   │ HTTP       │
│ PHPSESSID      │ exemplu.ro       │ Necesar    │ Sesiune  │ HTTP       │
│ lang           │ exemplu.ro       │ Funcțional │ 1 an     │ HTTP       │
└────────────────┴──────────────────┴────────────┴──────────┴────────────┘
```

3. **Cum vă puteți gestiona preferințele** — link la re-deschiderea banner-ului
4. **Baza legală** — referințe la GDPR, Legea 506/2004
5. **Contact** — datele operatorului de date
6. **Ultima actualizare** — data ultimei scanări

### Livrare

- **Endpoint public**: `https://api.cookieguard.ro/policy/{siteId}` — HTML complet
- **Embed**: `<iframe>` sau `<div>` cu script de încărcare
- **Auto-update**: Politica se regenerează automat la fiecare rescanare

### Conformitate Legea 506/2004

Template-ul include referințe la:
- Legea nr. 506/2004 privind prelucrarea datelor cu caracter personal și protecția vieții private în sectorul comunicațiilor electronice (modificată prin Legea 235/2015)
- Regulamentul General privind Protecția Datelor (GDPR) - Regulamentul UE 2016/679
- Drepturile vizitatorului conform art. 15-22 GDPR

---

## 11. Componenta 8: Autentificare & Sistem de Plată

### Autentificare

| Metodă | Implementare |
|--------|-------------|
| Email + parolă | bcrypt hash, JWT access + refresh tokens |
| Google OAuth | OAuth 2.0 flow, connect/disconnect din setări |

### Planuri de preț

| | Free | Pro | Business |
|---|---|---|---|
| **Preț** | 0 RON | ~99 RON/lună | ~299 RON/lună |
| **Site-uri** | 1 | 5 | Nelimitat |
| **Pagini scanate** | 100 | 1.000 | 5.000 |
| **Scanare automată** | Nu (manual) | Săptămânal | Zilnic |
| **Consent log** | 30 zile | 12 luni | 3 ani |
| **Banner personalizat** | Basic | Complet | Complet + white-label |
| **Export date** | Nu | CSV | CSV + JSON + API |
| **Google Consent Mode** | Nu | Da | Da |
| **Suport** | Community | Email | Prioritar |

### Integrare Stripe

```
Flux abonament:
1. User alege plan → POST /api/billing/checkout
2. Redirect la Stripe Checkout (hosted page)
3. Stripe procesează plata
4. Webhook POST /api/billing/webhook → actualizare plan în DB
5. Redirect înapoi la dashboard cu plan activ

Evenimente webhook gestionate:
- checkout.session.completed → activare plan
- invoice.payment_succeeded → reînnoire OK
- invoice.payment_failed → notificare + grace period
- customer.subscription.deleted → downgrade la Free
```

### Facturare în RON
- Stripe suportă RON nativ
- Facturi fiscale generate automat prin Stripe Billing
- TVA 19% aplicat conform legislației românești

---

## 12. Componenta 9: Landing Page & Branding

### Structura paginii

```
┌──────────────────────────────────────────────────────────────────┐
│  [Logo CookieGuard]          Funcționalități  Prețuri  Contact  │
│                                                    [Încearcă]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│        Site-ul tău, conform cu legea cookie-urilor               │
│        ─────────────────────────────────────────                 │
│        Soluția completă de gestionare a consimțământului          │
│        pentru cookie-uri. Made in Romania.                        │
│                                                                  │
│        [Începe gratuit]    [Vezi demo]                           │
│                                                                  │
│        ┌───────────────────────────────────────┐                │
│        │  Demo interactiv: banner CookieGuard  │                │
│        │  pe un site fictiv                     │                │
│        └───────────────────────────────────────┘                │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Funcționalități                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Scanare  │  │ Banner   │  │ Consent  │  │ Politica │       │
│  │ automată │  │ GDPR     │  │ proof    │  │ cookies  │       │
│  │          │  │          │  │          │  │ auto     │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Prețuri                                                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │   Free     │  │    Pro     │  │  Business  │               │
│  │   0 RON    │  │  99 RON/l  │  │ 299 RON/l  │               │
│  │  1 site    │  │  5 site-uri│  │  Nelimitat  │               │
│  │ [Începe]   │  │ [Alege]    │  │ [Alege]    │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Footer: Legal | Politica cookies | Contact | Social media      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 13. Google Consent Mode v2 — Integrare Nativă

### Ce este

Google Consent Mode v2 (obligatoriu din martie 2024 pentru EEA) este un protocol de semnalizare între CMP-uri și tag-urile Google (GA4, Google Ads).

### Cele 7 semnale de consimțământ

| Semnal | Ce controlează |
|--------|---------------|
| `ad_storage` | Cookie-uri pentru publicitate (Google Ads, Floodlight) |
| `ad_user_data` | **Nou în v2.** Trimitere date utilizator către Google pentru advertising |
| `ad_personalization` | **Nou în v2.** Publicitate personalizată (remarketing) |
| `analytics_storage` | Cookie-uri pentru analytics (GA4) |
| `functionality_storage` | Cookie-uri funcționale |
| `personalization_storage` | Cookie-uri de personalizare |
| `security_storage` | Cookie-uri de securitate (mereu granted) |

### Cum îl implementează CookieGuard

```javascript
// FAZA 1: Widget-ul setează defaults ÎNAINTE de încărcarea gtag.js
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'functionality_storage': 'denied',
  'personalization_storage': 'denied',
  'security_storage': 'granted',
  'wait_for_update': 500  // ms de așteptare pentru CMP
});

// FAZA 2: După ce vizitatorul alege, widget-ul trimite update
function onConsentChange(choices) {
  gtag('consent', 'update', {
    'ad_storage':          choices.marketing ? 'granted' : 'denied',
    'ad_user_data':        choices.marketing ? 'granted' : 'denied',
    'ad_personalization':  choices.marketing ? 'granted' : 'denied',
    'analytics_storage':   choices.analytics ? 'granted' : 'denied',
    'functionality_storage': choices.functional ? 'granted' : 'denied'
  });
}
```

### Comportament Google la `denied`

- **`analytics_storage: denied`**: GA4 trimite ping-uri dar NU setează cookie-uri `_ga`/`_gid`. Google folosește **behavioral modeling** pentru a completa golurile.
- **`ad_storage: denied`**: Google Ads NU setează cookie-uri de conversie. Se folosește **conversion modeling**.
- **`ad_user_data: denied`**: Nu se trimit date utilizator la Google (Enhanced Conversions dezactivat).

---

## 14. Cadrul Legal — GDPR, ePrivacy, Legea 506/2004, ANSPDCP

### Stratificarea legală în România

România este supusă a trei straturi legislative care se suprapun:

| Lege | Ce reglementează |
|------|-----------------|
| **GDPR** (Reg. UE 2016/679) | Protecția datelor cu caracter personal — direct aplicabil |
| **Directiva ePrivacy** (2002/58/CE, modificată 2009/136/CE) | Confidențialitatea comunicațiilor electronice — transpusă în: |
| **Legea 506/2004** (modificată prin Legea 235/2015) | Implementarea românească a Directivei ePrivacy |

### Cerințe tehnice obligatorii

#### 1. Consimțământ prealabil pentru cookie-uri non-esențiale
**Legea 506/2004, Art. 4 (modificat):** Stocarea de informații sau accesarea informațiilor stocate în echipamentul terminal al utilizatorului necesită **consimțământ prealabil**, cu excepția:
- Cookie-urilor strict necesare pentru furnizarea serviciului cerut explicit
- Cookie-urilor folosite doar pentru transmiterea unei comunicări

#### 2. Consimțământul trebuie să fie:
- **Liber** — fără cookie walls (nu poți bloca accesul la site dacă refuză — EDPB Opinia 5/2020)
- **Specific** — per categorie cel puțin, ideal per scop
- **Informat** — descriere clară a fiecărui cookie, în limba română
- **Acțiune afirmativă** — căsuțele pre-bifate NU sunt valide (CJEU C-673/17 Planet49)

#### 3. Egalitate Accept/Refuz
Butonul "Refuză tot" trebuie să fie la fel de ușor de accesat ca "Acceptă tot". Un banner cu doar "Acceptă tot" și "Personalizează" (unde refuzul e îngropat) **nu este conform**.

#### 4. Retragere ușoară
Un link/icon persistent pe fiecare pagină care permite re-deschiderea dialogului de consimțământ.

#### 5. Reînnoire consimțământ
Consimțământul trebuie solicitat din nou periodic (standard: 12 luni).

### ANSPDCP — Autoritatea de Supraveghere

ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal) este autoritatea de supraveghere din România.

**Amenzi posibile:**
- GDPR: până la 20 milioane EUR sau 4% din cifra de afaceri globală
- Legea 506/2004: amenzi conform legislației românești

**Practici sancționate de ANSPDCP:**
- Setarea cookie-urilor analytics/marketing înainte de consimțământ
- Dark patterns în banner-ul de consimțământ
- Informare inadecvată în politica cookies

---

## 15. Cum funcționează competitorii — Cookiebot, OneTrust, CookieYes

### Cookiebot (Cybot A/S — Danemarca)

| Aspect | Detalii |
|--------|---------|
| **Script** | `consent.cookiebot.com/uc.js` — ~45-60KB gzipped |
| **CDN** | Cloudflare |
| **Blocare** | `data-blockingmode="auto"` — MutationObserver + Proxy |
| **Cookie consimțământ** | `CookieConsent` — format propriu |
| **Baza de date cookies** | ~20.000+ cookies clasificate |
| **Scanner** | Chromium headless, max 5.000 pagini |
| **Consent Mode** | Da, nativ |
| **Preț** | Free (1 domeniu, <100 pagini), Premium de la 9€/lună |

### OneTrust (Atlanta, SUA)

| Aspect | Detalii |
|--------|---------|
| **Script** | `cdn.cookielaw.org/otSDKStub.js` — ~25KB stub + SDK separat |
| **CDN** | Akamai |
| **Blocare** | Auto-blocking + manual categorization |
| **Cookie consimțământ** | `OptanonConsent` — groups=C0001:1,C0002:0,... |
| **Baza de date cookies** | Cookiepedia — milioane de clasificări |
| **Scanner** | Proprietar, enterprise-grade |
| **IAB TCF** | Da, v2.2 complet |
| **Preț** | Enterprise — de la sute de EUR/lună |

### CookieYes (UK/India)

| Aspect | Detalii |
|--------|---------|
| **Script** | `cdn-cookieyes.com` — ~30KB gzipped |
| **Blocare** | Auto-blocking + script rewriting |
| **Preț** | Free (100 pagini), de la 10$/lună |
| **Punct forte** | Simplu de configurat, preț accesibil |

### Ce le lipsește pe piața din România

- **Limba română** — suportată de Cookiebot și CookieYes, dar cu traduceri generice/automate
- **Facturare în RON** — niciuna nu oferă facturare nativă în RON
- **Referințe legale românești** — politicile generate nu menționează Legea 506/2004 sau ANSPDCP
- **Suport local** — niciuna nu are suport în limba română
- **Prețuri adaptate** — prețurile sunt pentru piața vestică, nu pentru puterea de cumpărare din România

---

## 16. Diferențiatoare CookieGuard RO pentru piața din România

### 1. Făcut pentru România
- UI complet în limba română (nu traducere automată)
- Politica cookies generată cu referințe la Legea 506/2004 și ANSPDCP
- Suport în limba română

### 2. Preț adaptat pieței locale
- Free tier generos (1 site, 100 pagini)
- Prețuri în RON, facturare conform legislației românești
- Planuri competitive comparativ cu soluțiile internaționale

### 3. Conformitate locală out-of-the-box
- Template-uri de politică cookies conforme cu legislația românească
- Checklist ANSPDCP automat
- Suport Google Consent Mode v2 (obligatoriu pentru Google Ads în EEA)

### 4. Simplitate
- Un singur script tag de integrat
- Scanare automată — nu necesită cunoștințe tehnice
- Dashboard intuitiv

### 5. Public țintă
- Agenții web din România care gestionează zeci/sute de site-uri
- Magazine online (WooCommerce, Shopify) din România
- Companii românești care trebuie să fie conforme GDPR
- Bloggeri și site-uri de conținut

---

## 17. Starea curentă a proiectului — Board Takt

### Board: CookieGuard RO

| Coloană | Carduri | Status |
|---------|---------|--------|
| **Ideas** | 10 | Funcționalități post-MVP |
| **Planned** | 8 | MVP — pregătite pentru implementare |
| **In Progress** | 0 | Nimic încă |
| **Shipped** | 0 | Nimic încă |

### Carduri MVP (Planned) — cu checklist-uri

#### 1. Backend API & infra [Must Have] [MVP]
- [ ] Setup proiect Bun + Hono/ElysiaJS
- [ ] Configurare PostgreSQL + Drizzle ORM
- [ ] Schema DB: users, sites, scans, consents, policies
- [ ] Middleware auth (JWT)
- [ ] Rate limiting + CORS
- [ ] Deploy setup (Docker + VPS)
- [ ] Health check endpoint + logging

#### 2. Autentificare & sistem de plată [Must Have] [MVP]
- [ ] Register/login cu email + parolă (bcrypt)
- [ ] OAuth Google
- [ ] JWT refresh token flow
- [ ] Stripe integration: checkout session
- [ ] Planuri: Free / Pro / Business
- [ ] Webhook Stripe pentru subscription lifecycle
- [ ] Pagină billing în dashboard

#### 3. Cookie scanner engine [Must Have] [MVP]
- [ ] Puppeteer/Playwright crawler setup
- [ ] Detectare cookies (first-party, third-party)
- [ ] Detectare localStorage/sessionStorage
- [ ] Categorizare automată (necesare, funcționale, analytics, marketing)
- [ ] Bază de date cookies cunoscute (fingerprint DB)
- [ ] Output JSON structurat per scan
- [ ] Queue system pentru scanări async

#### 4. Consent banner widget (JS) [Must Have] [MVP]
- [ ] Widget vanilla JS, no dependencies
- [ ] Config loader (fetch din API)
- [ ] UI: banner bottom/top, modal, floating
- [ ] Consent per categorie (granular)
- [ ] Persistare alegeri (cookies first-party)
- [ ] Callback API (onAccept, onReject, onChange)
- [ ] Build pipeline: <15KB gzipped
- [ ] CDN delivery script tag

#### 5. Dashboard administrare [Must Have] [MVP]
- [ ] Layout: sidebar nav + main content
- [ ] Pagină: listă site-uri + add site
- [ ] Pagină: rezultate scan per site
- [ ] Pagină: configurare banner (preview live)
- [ ] Pagină: statistici consimțământ
- [ ] Pagină: setări cont
- [ ] Responsive design

#### 6. Consent log & proof of consent [Must Have] [MVP]
- [ ] Schema DB: consent_records
- [ ] Endpoint colectare consimțământ din widget
- [ ] Stocare: timestamp, IP anonim, alegeri, versiune politică
- [ ] Dashboard: vizualizare log-uri cu filtrare
- [ ] Export CSV/JSON
- [ ] Retenție configurabilă + auto-cleanup

#### 7. Generator politică cookies [Must Have] [MVP]
- [ ] Template politică cookies în română
- [ ] Populare automată din rezultate scan
- [ ] Generare HTML embeddable
- [ ] Endpoint public /policy/{siteId}
- [ ] Auto-update la rescanare
- [ ] Conformitate Legea 506/2004 + GDPR

#### 8. Landing page & branding [Must Have] [MVP]
- [ ] Design system: culori, fonturi, componente
- [ ] Hero section cu value proposition
- [ ] Features showcase
- [ ] Pricing page (3 planuri)
- [ ] Demo interactiv cookie banner
- [ ] Footer: legal, contact, social
- [ ] SEO meta tags + sitemap
- [ ] Pagină Despre noi / Contact

### Carduri Post-MVP (Ideas)

**Should Have:**
1. Rescanare automată programată
2. Suport multilingv banner (RO, EN, HU, DE)
3. Integrare Google Tag Manager
4. Google Consent Mode v2
5. Verificare conformitate ANSPDCP

**Nice to Have:**
6. Plugin WordPress
7. A/B testing consent rates
8. Analytics avansate consimțământ
9. API publică pentru integrări
10. White-label pentru agenții

---

## 18. Ordinea de implementare recomandată

```
Săptămâna 1-2: Backend API & infra
    └── Fundația pe care stau toate celelalte componente
         │
Săptămâna 2-3: Autentificare & sistem de plată
    └── Necesar pentru dashboard, protecție API
         │
Săptămâna 3-5: Cookie scanner engine
    └── Core business logic, nucleul produsului
         │
Săptămâna 5-7: Consent banner widget (JS)
    └── Produsul livrat clienților finali (vizitatorii site-urilor)
         │
Săptămâna 7-8: Consent log & proof of consent
    └── Depinde de widget (primește date) + backend (stochează)
         │
Săptămâna 8-9: Generator politică cookies
    └── Depinde de scanner (folosește rezultatele)
         │
Săptămâna 9-11: Dashboard administrare
    └── Integrează totul — necesită toate componentele funcționale
         │
Săptămâna 11-12: Landing page & branding
    └── Ultimul — când produsul e funcțional și poate fi demonstrat
```

---

## 19. Stack tehnic propus

| Layer | Tehnologie | De ce |
|-------|-----------|-------|
| **Runtime** | Bun | Rapid, TypeScript nativ, loader .env built-in |
| **API Framework** | Hono sau ElysiaJS | Lightweight, edge-ready, tip-uri TypeScript |
| **Database** | PostgreSQL | Robust, JSONB support, production-ready |
| **ORM** | Drizzle | Type-safe, lightweight, migrații SQL |
| **Scanner** | Playwright | Multi-browser, API modern, mai stabil ca Puppeteer |
| **Widget** | Vanilla JS + TypeScript | Zero dependencies, <15KB, maxim performance |
| **Dashboard** | React + TailwindCSS | Ecosistem matur, componente reutilizabile |
| **Plăți** | Stripe | Suport RON, Checkout hosted, webhooks |
| **CDN** | Cloudflare R2 + CDN | Latență mică, cache eficient, preț bun |
| **Hosting** | VPS (Hetzner) sau Fly.io | Cost-eficient pentru piața românească |
| **Queue** | BullMQ + Redis | Job queue pentru scanări async |
| **Auth** | JWT (access + refresh) | Simplu, stateless, scalabil |
| **CI/CD** | GitHub Actions | Gratuit pentru proiecte open-source/private |
| **Monitoring** | Grafana + Prometheus | Open-source, self-hosted |

---

## 20. Riscuri și mitigări

| Risc | Impact | Mitigare |
|------|--------|---------|
| **Blocare automată imprecisă** — script-uri importante blocate greșit | Mare — site-ul clientului se strică | Cookie DB comprehensivă + whitelist manual + mod fallback |
| **Performanță widget** — script sincron încetinește site-ul | Mediu — SEO impact | CDN edge, preconnect, caching agresiv, target <50ms |
| **Scanare incorectă** — cookies neclasificate sau lipsă | Mediu — conformitate compromisă | Human review layer, notificări pentru cookies necunoscute |
| **Schimbări legislative** — noi cerințe ANSPDCP/ePrivacy Regulation | Mare — product invalidat | Monitorizare activă legislație, template-uri actualizabile |
| **Concurență** — Cookiebot adaugă suport RO nativ | Mediu — pierdere avantaj diferențiator | Focus pe preț local + suport + comunitate |
| **Scalabilitate scanner** — Playwright consumă mult RAM | Mediu — costuri infra | Queue cu concurrency limit, container pool, scan throttling |
| **Rate abuse** — widget endpoint DDoS | Mare — downtime | Rate limiting, Cloudflare protection, cache consent config |
| **GDPR breach** — scurgere date consimțăminte | Critic — amenzi + reputație | Encryption at rest, IP hashing, audit logs, penetration testing |
