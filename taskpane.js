// Base URL för templates på GitHub Pages
const BASE_URL = "https://carloadamo.github.io/avanti_ppt_template/templates/";

// Våra test-slides (senare ersätts detta med data från Supabase)
const SLIDES = [
    { id: 1, name: "Slide 1", file: "slide_1.pptx" },
    { id: 2, name: "Slide 2", file: "slide_2.pptx" },
    { id: 3, name: "Slide 3", file: "slide_3.pptx" },
    { id: 4, name: "Slide 4", file: "slide_4.pptx" },
    { id: 5, name: "Slide 5", file: "slide_5.pptx" },
];

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

// Infoga slide från en .pptx-fil
async function insertSlide(fileName) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = "Hämtar template...";

    try {
        const base64 = await fetchAsBase64(BASE_URL + fileName);
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
function renderSlides() {
    const container = document.getElementById('slides');
    container.innerHTML = SLIDES.map(slide => `
        <div class="card">
            <div class="title">${slide.name}</div>
            <button onclick="insertSlide('${slide.file}')">Infoga</button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    Office.onReady(() => {
        document.getElementById('status').textContent = "Redo!";
        renderSlides();
    });
});
