# Avanti PPT Template Add-in

## Projektöversikt

PowerPoint-tillägg som låter användare söka bland företagets slide-templates och infoga dem direkt i sin presentation.

## Nuvarande status

**Fungerande:**
- Tillägg laddas i PowerPoint (Web/Desktop)
- Visar slides med thumbnails från Supabase Storage
- Klick på "Infoga" lägger till sliden i presentationen
- Frontend hosted på GitHub Pages
- Semantisk sökning via embeddings (pgvector)
- Supabase-integration för metadata, filer och embeddings

**Nästa steg:**
- Bygga pipeline-repo för att processa 3000+ slides automatiskt

## Arkitektur

```
┌─────────────────────────────────────────────────────┐
│  PowerPoint                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Task Pane (Add-in)                           │  │
│  │  - Sökfält (semantisk sökning)                │  │
│  │  - Thumbnails                                 │  │
│  │  - "Infoga"-knappar                           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Pages (frontend)                            │
│  - taskpane.html/js/css                             │
│  - manifest.xml                                     │
│  - assets/icons                                     │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  Supabase                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │  Database (PostgreSQL + pgvector)             │  │
│  │  - slides: metadata, tags, embeddings         │  │
│  │  - search_slides(): RPC för sökning           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Storage                                      │  │
│  │  - slides bucket: .pptx-filer                 │  │
│  │  - thumbnails bucket: .png-filer              │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Edge Functions                               │  │
│  │  - search-slides: konverterar query→embedding │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Databasschema (slides)

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | integer | Primary key |
| name | text | Slide-titel |
| description | text | Beskrivning |
| tags | text[] | Söktaggar |
| file | text | Filnamn (legacy) |
| file_url | text | Full URL till .pptx i Storage |
| thumb | text | Thumbnail-filnamn (legacy) |
| thumb_url | text | Full URL till thumbnail i Storage |
| embedding | vector(1536) | OpenAI embedding |
| source_file | text | Ursprunglig master-fil |
| source_slide_index | integer | Slide-nummer i källfilen |
| created_at | timestamptz | Skapad |

## Filstruktur

```
/
├── manifest.xml          # Office Add-in manifest
├── taskpane.html         # UI för sidopanelen
├── taskpane.js           # Logik för sökning och infogning
├── taskpane.css          # (styles i HTML)
├── assets/               # Ikoner för tillägget
│   ├── icon-16.png
│   ├── icon-32.png
│   └── icon-80.png
├── supabase/
│   └── functions/
│       └── search-slides/  # Edge Function
├── generate_embeddings.js  # Script för att generera embeddings
├── migrate_to_storage.js   # Engångsscript för migration
└── templates/              # (legacy - filer nu i Supabase Storage)
    └── thumbnails/
```

## Teknisk stack

- **Frontend:** Vanilla JS, Office.js API
- **Hosting:** GitHub Pages (endast frontend)
- **Databas:** Supabase PostgreSQL + pgvector
- **Fillagring:** Supabase Storage
- **Sökning:** OpenAI text-embedding-3-small (1536 dim)
- **Edge Functions:** Deno (Supabase)

## Viktiga API:er

### Infoga slide från .pptx-fil
```javascript
async function insertSlide(fileUrl) {
    const base64 = await fetchAsBase64(fileUrl);
    await PowerPoint.run(async (context) => {
        context.presentation.insertSlidesFromBase64(base64, {
            formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting
        });
        await context.sync();
    });
}
```

### Hämta slides från Supabase
```javascript
const response = await fetch(`${SUPABASE_URL}/rest/v1/slides?select=*`, {
    headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
});
```

### Semantisk sökning
```javascript
const response = await fetch(`${SUPABASE_URL}/functions/v1/search-slides`, {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
});
```

## URLs

- **GitHub Pages:** https://carloadamo.github.io/avanti_ppt_template/
- **Repo:** https://github.com/CarloAdamo/avanti_ppt_template
- **Supabase:** https://vnjcwffdhywckwnjothu.supabase.co

## Deployment

1. Gör ändringar lokalt
2. `git add -A && git commit -m "beskrivning" && git push`
3. Vänta 30-60 sek på GitHub Pages
4. Testa i inkognito-fönster (undvik cache-problem)

## Relaterade repos

- **avanti-slide-pipeline** (planerat): Automatisk processning av slides
  - Extrahera slides från stora .pptx-filer
  - Generera thumbnails
  - LLM-metadata via GPT-4 Vision
  - Ladda upp till Supabase Storage
  - Generera embeddings

## Framtida förbättringar

- [x] Semantisk sökning med embeddings
- [x] Supabase-integration
- [x] Supabase Storage för filer
- [ ] Metadata-pipeline för 3000+ slides (separat repo)
- [ ] Pagination för stora datamängder
- [ ] Förhandsvisning i större format
- [ ] Kategorifilter
