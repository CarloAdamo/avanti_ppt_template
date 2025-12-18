// Engångsscript för att migrera befintliga slides till Supabase Storage
// Kör med: node migrate_to_storage.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function uploadFile(bucket, filePath, destPath, contentType) {
    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(destPath, fileBuffer, {
            contentType: contentType,
            upsert: true
        });

    if (error) {
        throw new Error(`Upload failed: ${error.message}`);
    }

    // Returnera public URL
    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(destPath);

    return publicUrl;
}

async function updateSlideUrls(id, fileUrl, thumbUrl) {
    const { error } = await supabase
        .from('slides')
        .update({ file_url: fileUrl, thumb_url: thumbUrl })
        .eq('id', id);

    return !error;
}

async function main() {
    const slides = [
        { id: 1, file: 'slide_1.pptx', thumb: 'slide_1.png' },
        { id: 2, file: 'slide_2.pptx', thumb: 'slide_2.png' },
        { id: 3, file: 'slide_3.pptx', thumb: 'slide_3.png' },
        { id: 4, file: 'slide_4.pptx', thumb: 'slide_4.png' },
        { id: 5, file: 'slide_5.pptx', thumb: 'slide_5.png' }
    ];

    console.log('Migrerar slides till Supabase Storage...\n');

    for (const slide of slides) {
        console.log(`Processing slide ${slide.id}: ${slide.file}`);

        try {
            // Ladda upp .pptx
            const pptxPath = path.join(__dirname, 'templates', slide.file);
            const fileUrl = await uploadFile(
                'slides',
                pptxPath,
                slide.file,
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            );
            console.log(`  ✓ Uploaded ${slide.file}`);

            // Ladda upp thumbnail
            const thumbPath = path.join(__dirname, 'thumbnails', slide.thumb);
            const thumbUrl = await uploadFile(
                'thumbnails',
                thumbPath,
                slide.thumb,
                'image/png'
            );
            console.log(`  ✓ Uploaded ${slide.thumb}`);

            // Uppdatera databas
            const success = await updateSlideUrls(slide.id, fileUrl, thumbUrl);
            if (success) {
                console.log(`  ✓ Updated database\n`);
            } else {
                console.log(`  ✗ Failed to update database\n`);
            }
        } catch (error) {
            console.error(`  ✗ Error: ${error.message}\n`);
        }
    }

    console.log('Migration klar!');
}

main().catch(console.error);
