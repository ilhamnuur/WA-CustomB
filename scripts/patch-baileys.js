#!/usr/bin/env node
/**
 * Patch: Baileys Newsletter Media directPath Fix
 * 
 * Fixes a known bug in @whiskeysockets/baileys where newsletter media uploads
 * receive a directPath with /o1/ prefix instead of /m1/. This causes media to
 * be uploaded successfully (API returns 200) but never appear in the newsletter
 * because WhatsApp can't load the file from the wrong CDN path.
 * 
 * This patch is applied automatically via postinstall.
 * Can be removed once Baileys is updated to a version that includes the fix.
 * 
 * Ref: https://github.com/WhiskeySockets/Baileys/issues/2345
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_JS = path.join(
    __dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils', 'messages.js'
);

const SEARCH = `const { mediaUrl, directPath } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs
        });
        await fs.unlink(filePath);
        const obj = WAProto.Message.fromObject({`;

const REPLACE = `const { mediaUrl, directPath: rawDirectPath } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs
        });
        await fs.unlink(filePath);
        // Fix: Newsletter media requires /m1/ prefix instead of /o1/
        const directPath = rawDirectPath && rawDirectPath.includes('/o1/')
            ? rawDirectPath.replace('/o1/', '/m1/')
            : rawDirectPath;
        const obj = WAProto.Message.fromObject({`;

try {
    if (!fs.existsSync(MESSAGES_JS)) {
        console.log('[patch-baileys] Baileys not found, skipping patch.');
        process.exit(0);
    }

    let content = fs.readFileSync(MESSAGES_JS, 'utf8');

    if (content.includes('rawDirectPath')) {
        console.log('[patch-baileys] ✅ Patch already applied.');
        process.exit(0);
    }

    if (!content.includes(SEARCH)) {
        console.log('[patch-baileys] ⚠️ Target code not found (Baileys may have been updated). Skipping patch.');
        process.exit(0);
    }

    content = content.replace(SEARCH, REPLACE);
    fs.writeFileSync(MESSAGES_JS, content, 'utf8');
    console.log('[patch-baileys] ✅ Newsletter media directPath patch applied successfully.');
} catch (err) {
    console.error('[patch-baileys] ❌ Failed to apply patch:', err.message);
    process.exit(1);
}
