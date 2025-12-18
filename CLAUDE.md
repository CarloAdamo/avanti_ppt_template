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
- **Master-fil approach** - laddar ner master-filen en gång och infogar specifik slide via `sourceSlideIds`

**Pipeline-repo:** `avanti-slide-pipeline` - processar slides automatiskt

## Arkitektur

```
┌─────────────────────────────────────────────────────┐
│  PowerPoint                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Task Pane (Add-in)                           │  │
│  │  - Sökfält (semantisk sökning)                │  │
│  │  - Filter (template_type, section_name)       │  │
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
│  │  - slide_id: PowerPoints interna ID           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Storage                                      │  │
│  │  - slides bucket: master.pptx (PRIVAT)        │  │
│  │  - thumbnails bucket: slide_N.png (PUBLIC)    │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Edge Functions                               │  │
│  │  - search-slides: semantisk sökning           │  │
│  │  - get-slide-url: signed URL + slide_id       │  │
│  │  - get-filter-options: filter-värden          │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Master-fil approach

**Varför:** pptx-automizer kopierar alla resurser till varje extraherad slide, vilket resulterar i enorma filer (86 MB × 189 slides = 16 GB).

**Lösning:** Vi laddar upp master-filen EN gång och använder PowerPoints interna `slide_id` för att infoga specifik slide.

| Approach | Lagring för 189 slides |
|----------|------------------------|
| Individuella slides | ~16 GB |
| Master-fil | ~72 MB |

**Hur det fungerar:**
1. Add-in anropar `get-slide-url` med databas-ID
2. Edge Function returnerar: `{ url, slideId, slideIndex }`
3. Add-in laddar ner master-filen som base64
4. Add-in använder `insertSlidesFromBase64(base64, { sourceSlideIds: [slideId] })`
5. PowerPoint infogar ENDAST den specifika sliden

## Databasschema (slides)

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | integer | Primary key |
| name | text | LLM-genererad titel |
| description | text | LLM-genererad beskrivning |
| tags | text[] | LLM-genererade söktaggar |
| file | text | Storage path till master-fil |
| thumb | text | Storage path till thumbnail |
| thumb_url | text | Public URL till thumbnail |
| embedding | vector(1536) | OpenAI embedding |
| source_file | text | Ursprunglig master-fil (utan extension) |
| source_slide_index | integer | Slide-nummer i källfilen (1-baserat) |
| template_type | text | Template-typ (t.ex. "Proposal") |
| section_name | text | Sektionsnamn (t.ex. "Executive Summary") |
| **slide_id** | text | **PowerPoints interna ID för Office.js** |
| **master_file** | text | **Storage path till master-filen** |
| created_at | timestamptz | Skapad |

## Filstruktur

```
/
├── manifest.xml          # Office Add-in manifest
├── taskpane.html         # UI för sidopanelen
├── taskpane.js           # Logik för sökning och infogning
├── taskpane.css          # Styles
├── assets/               # Ikoner för tillägget
│   ├── icon-16.png
│   ├── icon-32.png
│   └── icon-80.png
├── supabase/
│   └── functions/
│       └── search-slides/  # Edge Function (lokal kopia)
├── generate_embeddings.js  # Legacy script
└── migrate_to_storage.js   # Legacy script
```

## Teknisk stack

- **Frontend:** Vanilla JS, Office.js API
- **Hosting:** GitHub Pages
- **Databas:** Supabase PostgreSQL + pgvector
- **Fillagring:** Supabase Storage (privat för slides, public för thumbnails)
- **Sökning:** OpenAI text-embedding-3-small (1536 dim)
- **Edge Functions:** Deno (Supabase)

## Viktiga API:er

### Infoga slide med sourceSlideIds (ny approach)
```javascript
async function insertSlide(slideId) {
    // Hämta signerad URL + PowerPoint slide-ID
    const { url, slideId: pptSlideId } = await getSignedSlideUrl(slideId);

    const base64 = await fetchAsBase64(url);

    await PowerPoint.run(async (context) => {
        context.presentation.insertSlidesFromBase64(base64, {
            formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting,
            sourceSlideIds: [pptSlideId]  // ENDAST denna slide
        });
        await context.sync();
    });
}
```

### get-slide-url Edge Function
```javascript
// Request
POST /functions/v1/get-slide-url
{ "slideId": 6 }

// Response
{
    "url": "https://...signed-url-to-master.pptx...",
    "slideId": "2147471306",   // PowerPoints interna slide-ID
    "slideIndex": 6            // 1-baserat index (fallback)
}
```

### Semantisk sökning
```javascript
// Request
POST /functions/v1/search-slides
{
    "query": "project timeline",
    "template_type": "Proposal",     // Valfritt filter
    "section_name": "Project Plan",  // Valfritt filter
    "limit": 20
}

// Response
[
    {
        "id": 1,
        "name": "Projektplan med faser",
        "description": "...",
        "tags": ["timeline", "gantt"],
        "template_type": "Proposal",
        "section_name": "Project Plan",
        "thumb_url": "https://...",
        "similarity": 0.85
    }
]
```

### Hämta filter-alternativ
```javascript
// Request
GET /functions/v1/get-filter-options

// Response
{
    "template_types": ["Proposal", "Pitch Deck", ...],
    "section_names": ["Executive Summary", "Project Timeline", ...]
}
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

- **avanti-slide-pipeline**: Automatisk processning av slides
  - Extraherar slides + metadata från stora .pptx-filer
  - Genererar thumbnails via LibreOffice + Poppler
  - LLM-metadata via GPT-4o-mini Vision
  - Laddar upp master-fil till Supabase Storage
  - Genererar embeddings med text-embedding-3-small
  - Extraherar slide-IDs för Office.js

## Framtida förbättringar

- [x] Semantisk sökning med embeddings
- [x] Supabase-integration
- [x] Supabase Storage för filer
- [x] Metadata-pipeline för slides (avanti-slide-pipeline)
- [x] Master-fil approach med sourceSlideIds
- [ ] Pagination för stora datamängder
- [ ] Förhandsvisning i större format
- [ ] Filter-dropdowns för template_type och section_name
- [ ] Caching av master-fil för snabbare infogning
