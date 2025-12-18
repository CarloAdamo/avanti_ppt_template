// Script för att generera embeddings för alla slides
// Kör med: node generate_embeddings.js

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getEmbedding(text) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text
        })
    });
    const data = await response.json();
    return data.data[0].embedding;
}

async function getSlides() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/slides?select=*`, {
        headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`
        }
    });
    return response.json();
}

async function updateSlideEmbedding(id, embedding) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/slides?id=eq.${id}`, {
        method: "PATCH",
        headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        body: JSON.stringify({ embedding })
    });
    return response.ok;
}

async function main() {
    console.log("Hämtar slides från Supabase...");
    const slides = await getSlides();
    console.log(`Hittade ${slides.length} slides\n`);

    for (const slide of slides) {
        // Kombinera namn, beskrivning och taggar för bättre embeddings
        const text = `${slide.name}. ${slide.description}. Tags: ${(slide.tags || []).join(", ")}`;

        console.log(`Genererar embedding för: ${slide.name}`);
        const embedding = await getEmbedding(text);

        console.log(`Sparar embedding (${embedding.length} dimensioner)...`);
        const success = await updateSlideEmbedding(slide.id, embedding);

        if (success) {
            console.log(`✓ Klar!\n`);
        } else {
            console.log(`✗ Fel vid sparning\n`);
        }
    }

    console.log("Alla embeddings genererade!");
}

main().catch(console.error);
