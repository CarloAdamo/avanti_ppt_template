
// Din SharePoint-länk till mallbiblioteket/filen
const SHAREPOINT_URL = "https://influenceab.sharepoint.com/:p:/s/Avanti/IQCaPE-5y5OpToXS8HwjGZ82ARfWpXm0eo_9dHBDeGKgkRU?e=FOJMjA";

let INDEX = { slides: [] }; // laddas från slides_index.json

async function loadIndex() {
    try {
        const resp = await fetch("slides_index.json");
        INDEX = await resp.json();
        render(INDEX.slides);
    } catch (e) {
        document.getElementById('results').textContent = "Kunde inte ladda index.";
    }
}

function render(items) {
    const q = (document.getElementById('q').value || "").toLowerCase();
    const filtered = items.filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.summary || '').toLowerCase().includes(q) ||
        (s.tags || []).some(t => (t || '').toLowerCase().includes(q))
    );
    const html = filtered.map(s => `
    <div class="card">
      <div class="title">${s.title || '(utan titel)'}</div>
      <div class="meta">${(s.tags || []).join(' • ')}</div>
      <div class="summary">${s.summary || ''}</div>
      <div class="actions">
        <button onclick="openLibrary()">Öppna källa</button>
        <!-- Nästa steg: visa thumbnail och Infoga vald slide automatiskt -->
      </div>
    </div>
  `).join('');
    document.getElementById('results').innerHTML = html || "Inga träffar.";
}

function openLibrary() { window.open(SHAREPOINT_URL, "_blank"); }

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('q').addEventListener('input', () => render(INDEX.slides));
    Office.onReady(loadIndex);
});
