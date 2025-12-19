// Supabase config
const SUPABASE_URL = "https://vnjcwffdhywckwnjothu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gEtvIpjdu9mSZSrLJjwjXQ_VIxu5WKH";

// URLs hämtas nu direkt från databasen (file_url, thumb_url)

// Slides laddas från Supabase
let SLIDES = [];

// Filter options (sections grouped by template)
let FILTER_OPTIONS = { template_types: [], sections_by_template: {} };

// Current filter state
let currentFilters = { template_type: '', section_name: '' };

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

// Hämta signerad URL + slide-ID för en slide (privat bucket)
// Returnerar: { url, slideId, slideIndex }
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
    return data; // { url, slideId, slideIndex }
}

// Infoga slide från privat Storage (hämtar signerad URL on-demand)
// Nu använder vi master-filen + sourceSlideIds för att infoga specifik slide
async function insertSlide(slideId) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = "Fetching template...";

    try {
        // Get signed URL + slide-ID (valid for 5 min)
        const { url, slideId: pptSlideId, slideIndex } = await getSignedSlideUrl(slideId);

        const base64 = await fetchAsBase64(url);
        statusEl.textContent = "Inserting slide...";

        await PowerPoint.run(async (context) => {
            // Använd sourceSlideIds för att ENDAST infoga den specifika sliden
            // från master-filen (istället för hela presentationen)
            const options = {
                formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting
            };

            // Om vi har pptSlideId (PowerPoints interna ID), använd det
            if (pptSlideId) {
                options.sourceSlideIds = [pptSlideId];
            }

            context.presentation.insertSlidesFromBase64(base64, options);
            await context.sync();
        });

        statusEl.textContent = "Slide inserted!";
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
    } catch (error) {
        statusEl.textContent = "Error: " + error.message;
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
                <button onclick="insertSlide(${slide.id})">Insert</button>
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
        document.getElementById('status').textContent = "Could not load slides";
    }
}

// Load filter options from Supabase Edge Function
async function loadFilterOptions() {
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-filter-options`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        FILTER_OPTIONS = await response.json();
        console.log("Filter options:", FILTER_OPTIONS);
        populateFilterDropdowns();
    } catch (error) {
        console.error("Error loading filter options:", error);
    }
}

// Populate template dropdown (sections are updated when template changes)
function populateFilterDropdowns() {
    const templateSelect = document.getElementById('filter-template');

    // Clear existing options
    templateSelect.innerHTML = '<option value="">All templates</option>';

    // Add template options
    FILTER_OPTIONS.template_types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        templateSelect.appendChild(option);
    });

    // Initially show no sections (user must select template first)
    updateSectionDropdown('');
}

// Update section dropdown based on selected template
function updateSectionDropdown(selectedTemplate) {
    const sectionSelect = document.getElementById('filter-section');

    // Clear current section selection
    currentFilters.section_name = '';

    if (!selectedTemplate) {
        // No template selected - disable section dropdown
        sectionSelect.innerHTML = '<option value="">Select template first</option>';
        sectionSelect.disabled = true;
        return;
    }

    // Get sections for selected template
    const sections = FILTER_OPTIONS.sections_by_template[selectedTemplate] || [];

    sectionSelect.innerHTML = '<option value="">All sections</option>';
    sections.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        sectionSelect.appendChild(option);
    });
    sectionSelect.disabled = false;
}

// Semantic search via Supabase Edge Function (with filters)
async function semanticSearch(query, filters = {}) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-slides`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query,
            template_type: filters.template_type || null,
            section_name: filters.section_name || null
        })
    });
    return response.json();
}

// Search slides with filters
let searchTimeout = null;
async function searchSlides(query) {
    const hasFilters = currentFilters.template_type || currentFilters.section_name;

    if (!query.trim() && !hasFilters) {
        renderSlides(SLIDES);
        document.getElementById('status').textContent = "";
        return;
    }

    // Show loading
    document.getElementById('status').textContent = "Searching...";

    try {
        // If no search query but has filters, use a generic query
        const searchQuery = query.trim() || "slide";
        const results = await semanticSearch(searchQuery, currentFilters);
        renderSlides(results);
        document.getElementById('status').textContent = `${results.length} results`;
    } catch (error) {
        console.error("Search error:", error);
        document.getElementById('status').textContent = "Search error";
    }
}

async function init() {
    document.getElementById('status').textContent = "Loading...";

    // Load slides and filter options in parallel
    await Promise.all([loadSlides(), loadFilterOptions()]);
    document.getElementById('status').textContent = "Ready!";

    // Search input with debounce (waits 500ms after last keypress)
    document.getElementById('search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchSlides(e.target.value);
        }, 500);
    });

    // Filter change handlers
    document.getElementById('filter-template').addEventListener('change', (e) => {
        currentFilters.template_type = e.target.value;
        // Update section dropdown to show only sections for this template
        updateSectionDropdown(e.target.value);
        searchSlides(document.getElementById('search').value);
    });

    document.getElementById('filter-section').addEventListener('change', (e) => {
        currentFilters.section_name = e.target.value;
        searchSlides(document.getElementById('search').value);
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
