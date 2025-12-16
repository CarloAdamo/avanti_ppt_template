// URL till test-template på GitHub Pages
const TEMPLATE_URL = "https://carloadamo.github.io/avanti_ppt_template/templates/test.pptx";

// Hämta en fil och konvertera till base64
async function fetchAsBase64(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Ta bort "data:application/...;base64," prefixet
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Infoga slide från en .pptx-fil
async function insertSlide() {
    const statusEl = document.getElementById('status');
    statusEl.textContent = "Hämtar template...";

    try {
        const base64 = await fetchAsBase64(TEMPLATE_URL);
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('insertBtn').addEventListener('click', insertSlide);
    Office.onReady(() => {
        document.getElementById('status').textContent = "Redo!";
    });
});
