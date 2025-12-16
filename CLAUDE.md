# Avanti PPT Template Add-in

## Projektöversikt

PowerPoint-tillägg som låter användare söka bland företagets slide-templates och infoga dem direkt i sin presentation.

## Nuvarande status

**Fungerande:**
- Tillägg laddas i PowerPoint (Web/Desktop)
- Visar lista med 5 test-slides med thumbnails
- Klick på "Infoga" lägger till sliden i presentationen
- Hosted på GitHub Pages

**Nästa steg:**
- Sökfunktion (enkel textsökning → semantisk sökning)
- Supabase-integration för metadata och embeddings
- Skala upp till 3000+ slides

## Arkitektur

```
┌─────────────────────────────────────────────────────┐
│  PowerPoint                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Task Pane (Add-in)                           │  │
│  │  - Sökfält                                    │  │
│  │  - Thumbnails                                 │  │
│  │  - "Infoga"-knappar                           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Pages                                       │
│  - taskpane.html/js                                 │
│  - templates/*.pptx (en slide per fil)             │
│  - thumbnails/*.png                                 │
└─────────────────────────────────────────────────────┘
            │
            ▼ (planerat)
┌─────────────────────────────────────────────────────┐
│  Supabase                                           │
│  - Slide-metadata (titel, beskrivning, taggar)     │
│  - Embeddings för semantisk sökning (pgvector)     │
│  - Storage för thumbnails och .pptx-filer          │
└─────────────────────────────────────────────────────┘
```

## Filstruktur

```
/
├── manifest.xml          # Office Add-in manifest
├── taskpane.html         # UI för sidopanelen
├── taskpane.js           # Logik för sökning och infogning
├── taskpane.css          # (oanvänd - styles i HTML)
├── slides_index.json     # (oanvänd - ersätts av Supabase)
├── templates/            # .pptx-filer (en slide per fil)
│   ├── slide_1.pptx
│   └── ...
├── thumbnails/           # PNG-förhandsvisningar
│   ├── slide_1.png
│   └── ...
└── assets/               # Ikoner för tillägget
    ├── icon-16.png
    ├── icon-32.png
    └── icon-80.png
```

## Teknisk stack

- **Frontend:** Vanilla JS, Office.js API
- **Hosting:** GitHub Pages
- **Slide-infogning:** `PowerPoint.insertSlidesFromBase64()`
- **Databas (planerad):** Supabase (PostgreSQL + pgvector)

## Viktiga API:er

### Infoga slide från .pptx-fil
```javascript
await PowerPoint.run(async (context) => {
    context.presentation.insertSlidesFromBase64(base64String, {
        formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting
    });
    await context.sync();
});
```

### Infoga specifik slide (sourceSlideIds)
```javascript
context.presentation.insertSlidesFromBase64(base64String, {
    sourceSlideIds: ["257#3396654126"],  // Slide-ID från källfilen
    formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting
});
```

## URLs

- **GitHub Pages:** https://carloadamo.github.io/avanti_ppt_template/
- **Repo:** https://github.com/CarloAdamo/avanti_ppt_template

## Deployment

1. Gör ändringar lokalt
2. `git add -A && git commit -m "beskrivning" && git push`
3. Vänta 30-60 sek på GitHub Pages
4. Testa i inkognito-fönster (undvik cache-problem)

## Framtida förbättringar

- [ ] Semantisk sökning med embeddings
- [ ] Supabase-integration
- [ ] Metadata-pipeline för 3000+ slides (LLM-genererad)
- [ ] Infoga specifik slide från master-presentation (sourceSlideIds)
- [ ] Förhandsvisning i större format
- [ ] Kategorifilter
