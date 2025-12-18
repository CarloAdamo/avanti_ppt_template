// Supabase config
const SUPABASE_URL = "https://vnjcwffdhywckwnjothu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gEtvIpjdu9mSZSrLJjwjXQ_VIxu5WKH";

// URLs hämtas nu direkt från databasen (file_url, thumb_url)

// Slides laddas från Supabase
let SLIDES = [];

// Hämta en fil och konvertera till base64
async function fetchAsBase64(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Hämta signerad URL för en slide (privat bucket)
async function getSignedSlideUrl(slideId) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-slide-url`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ slideId })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.url;
}

// Infoga slide från privat Storage (hämtar signerad URL on-demand)
async function insertSlide(slideId) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = "Hämtar template...";

    try {
        // Hämta signerad URL (giltig i 5 min)
        const signedUrl = await getSignedSlideUrl(slideId);

        const base64 = await fetchAsBase64(signedUrl);
        statusEl.textContent = "Infogar slide...";

        await PowerPoint.run(async (context) => {
            context.presentation.insertSlidesFromBase64(base64, {
                formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting
            });
            await context.sync();
        });

        statusEl.textContent = "Slide infogad!";
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (error) {
        statusEl.textContent = "Fel: " + error.message;
        console.error("Insert slide error:", error);
    }
}

// Rendera listan med slides
function renderSlides(slides) {
    const container = document.getElementById('slides');
    container.innerHTML = slides.map(slide => `
        <div class="card">
            <img src="${slide.thumb_url}" alt="${slide.name}" class="thumbnail">
            <div class="card-content">
                <div class="title">${slide.name}</div>
                <button onclick="insertSlide(${slide.id})">Infoga</button>
            </div>
        </div>
    `).join('');
}

// Hämta slides från Supabase
async function loadSlides() {
    try {
        console.log("Fetching from Supabase...");
        const response = await fetch(`${SUPABASE_URL}/rest/v1/slides?select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        console.log("Response status:", response.status);
        SLIDES = await response.json();
        console.log("Loaded slides:", SLIDES);
        renderSlides(SLIDES);
    } catch (error) {
        console.error("Error loading slides:", error);
        document.getElementById('status').textContent = "Kunde inte ladda slides";
    }
}

// Semantisk sökning via Supabase Edge Function
async function semanticSearch(query) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-slides`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
    });
    return response.json();
}

// Sök bland slides
let searchTimeout = null;
async function searchSlides(query) {
    if (!query.trim()) {
        renderSlides(SLIDES);
        return;
    }

    // Visa loading
    document.getElementById('status').textContent = "Söker...";

    try {
        const results = await semanticSearch(query);
        renderSlides(results);
        document.getElementById('status').textContent = `${results.length} träffar`;
    } catch (error) {
        console.error("Search error:", error);
        document.getElementById('status').textContent = "Sökfel";
    }
}

async function init() {
    document.getElementById('status').textContent = "Laddar...";
    await loadSlides();
    document.getElementById('status').textContent = "Redo!";

    // Lägg till sökfunktion med debounce (väntar 500ms efter sista knapptryckning)
    document.getElementById('search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchSlides(e.target.value);
        }, 500);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Kolla om Office.js finns
    if (typeof Office !== 'undefined') {
        Office.onReady(init);
    } else {
        // Fallback för test utanför Office
        init();
    }
});
