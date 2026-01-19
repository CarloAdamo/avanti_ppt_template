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
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
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

// ============================================
// UPLOAD PRESENTATION FUNCTIONALITY (v0.2)
// ============================================

// Modal helpers
function showModal() {
    document.getElementById('upload-modal').classList.add('active');
    document.getElementById('modal-title').textContent = 'Uploading...';
    document.getElementById('modal-text').textContent = 'Preparing presentation...';
    document.getElementById('modal-progress').style.width = '0%';
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-success').style.display = 'none';
    document.getElementById('modal-close').style.display = 'none';
}

function updateModal(title, text, progress) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    if (progress !== undefined) {
        document.getElementById('modal-progress').style.width = `${progress}%`;
    }
}

function showModalError(message) {
    document.getElementById('modal-title').textContent = 'Upload Failed';
    document.getElementById('modal-text').style.display = 'none';
    document.getElementById('modal-error').textContent = message;
    document.getElementById('modal-error').style.display = 'block';
    document.getElementById('modal-close').style.display = 'inline-block';
}

function showModalSuccess(message) {
    document.getElementById('modal-title').textContent = 'Success!';
    document.getElementById('modal-text').style.display = 'none';
    document.getElementById('modal-progress').style.width = '100%';
    document.getElementById('modal-success').textContent = message;
    document.getElementById('modal-success').style.display = 'block';
    document.getElementById('modal-close').style.display = 'inline-block';
}

function closeModal() {
    document.getElementById('upload-modal').classList.remove('active');
    document.getElementById('modal-text').style.display = 'block';
    // Reload slides to show newly added ones
    loadSlides();
    loadFilterOptions();
}

// Get presentation file using Office.js
async function getPresentationAsBase64() {
    return new Promise((resolve, reject) => {
        Office.context.document.getFileAsync(
            Office.FileType.Compressed,
            { sliceSize: 4194304 }, // 4MB chunks
            async (result) => {
                if (result.status !== Office.AsyncResultStatus.Succeeded) {
                    reject(new Error(result.error.message));
                    return;
                }

                const file = result.value;
                const sliceCount = file.sliceCount;
                const slices = [];

                // Read all slices
                for (let i = 0; i < sliceCount; i++) {
                    const sliceResult = await new Promise((res, rej) => {
                        file.getSliceAsync(i, (sliceRes) => {
                            if (sliceRes.status === Office.AsyncResultStatus.Succeeded) {
                                res(sliceRes.value.data);
                            } else {
                                rej(new Error(sliceRes.error.message));
                            }
                        });
                    });
                    slices.push(sliceResult);
                }

                file.closeAsync();

                // Combine slices into single array
                const totalLength = slices.reduce((sum, slice) => sum + slice.length, 0);
                const combined = new Uint8Array(totalLength);
                let offset = 0;
                for (const slice of slices) {
                    combined.set(new Uint8Array(slice), offset);
                    offset += slice.length;
                }

                // Convert to base64
                let binary = '';
                for (let i = 0; i < combined.length; i++) {
                    binary += String.fromCharCode(combined[i]);
                }
                const base64 = btoa(binary);

                resolve({ base64, sizeBytes: combined.length });
            }
        );
    });
}

// Upload presentation to Edge Function
async function uploadToServer(base64, filename) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-presentation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            file_base64: base64,
            filename: filename
        })
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    return data; // { success, job_id, message }
}

// Poll job status
async function pollJobStatus(jobId, onProgress) {
    const pollInterval = 3000; // 3 seconds
    const maxAttempts = 200; // ~10 minutes max

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-job-status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ job_id: jobId })
        });

        const job = await response.json();

        if (job.error && !job.status) {
            throw new Error(job.error);
        }

        // Calculate progress
        const progress = job.total_slides
            ? Math.round((job.processed_slides / job.total_slides) * 100)
            : 0;

        onProgress(job, progress);

        if (job.status === 'completed') {
            return job;
        }

        if (job.status === 'failed') {
            throw new Error(job.error || 'Processing failed');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Processing timed out');
}

// Main upload function
async function uploadPresentation() {
    // Check if Office.js is available
    if (typeof Office === 'undefined' || !Office.context || !Office.context.document) {
        alert('This feature only works inside PowerPoint');
        return;
    }

    showModal();

    try {
        // Step 1: Get presentation file
        updateModal('Reading presentation...', 'This may take a moment for large files', 5);
        const { base64, sizeBytes } = await getPresentationAsBase64();
        const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);

        // Check file size (50MB limit)
        if (sizeBytes > 50 * 1024 * 1024) {
            throw new Error(`File too large (${sizeMB}MB). Maximum is 50MB.`);
        }

        // Step 2: Upload to server
        updateModal('Uploading...', `Sending ${sizeMB}MB to server...`, 15);
        const filename = 'Presentation.pptx'; // Office.js doesn't give us the filename
        const { job_id } = await uploadToServer(base64, filename);

        // Step 3: Poll for completion
        updateModal('Processing...', 'Analyzing slides...', 20);

        await pollJobStatus(job_id, (job, progress) => {
            const adjustedProgress = 20 + (progress * 0.8); // Scale 0-100 to 20-100
            const statusText = job.total_slides
                ? `Processing slide ${job.processed_slides} of ${job.total_slides}...`
                : 'Analyzing slides...';
            updateModal('Processing...', statusText, adjustedProgress);
        });

        // Success!
        showModalSuccess('Your slides have been added to the library!');

    } catch (error) {
        console.error('Upload error:', error);
        showModalError(error.message || 'Upload failed. Please try again.');
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Kolla om Office.js finns
    if (typeof Office !== 'undefined') {
        Office.onReady(init);
    } else {
        // Fallback för test utanför Office
        init();
    }
});
