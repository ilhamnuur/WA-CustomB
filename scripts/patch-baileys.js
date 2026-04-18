#!/usr/bin/env node
/**
 * Patch: Baileys Newsletter Media Fix
 * 
 * Fixes two known bugs in @whiskeysockets/baileys for newsletter media:
 * 
 * 1. Upload response `handle` is discarded - newsletter media requires the
 *    handle from the upload response to be included in the message object,
 *    otherwise WhatsApp silently drops the media.
 * 
 * 2. directPath prefix - newsletter media uses /m1/ prefix but upload may
 *    return /o1/, causing media to not render.
 * 
 * Applied automatically via postinstall. Can be removed once Baileys
 * includes the official fix.
 * 
 * Ref: https://github.com/WhiskeySockets/Baileys/issues/2345
 */

const fs = require('fs');
const path = require('path');

const BAILEYS_DIR = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils');
const MESSAGES_JS = path.join(BAILEYS_DIR, 'messages.js');
const MESSAGES_MEDIA_JS = path.join(BAILEYS_DIR, 'messages-media.js');

let patchCount = 0;

// ============================================================
// PATCH 1: Capture `handle` from upload response (messages-media.js)
// ============================================================
try {
    if (fs.existsSync(MESSAGES_MEDIA_JS)) {
        let content = fs.readFileSync(MESSAGES_MEDIA_JS, 'utf8');

        if (content.includes('handle: result.handle')) {
            console.log('[patch-baileys] ✅ Patch 1 (upload handle) already applied.');
        } else {
            const SEARCH_1 = `                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,`;
            const REPLACE_1 = `                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        handle: result.handle,
                        meta_hmac: result.meta_hmac,`;

            if (content.includes(SEARCH_1)) {
                content = content.replace(SEARCH_1, REPLACE_1);
                fs.writeFileSync(MESSAGES_MEDIA_JS, content, 'utf8');
                console.log('[patch-baileys] ✅ Patch 1 (upload handle) applied.');
                patchCount++;
            } else {
                console.log('[patch-baileys] ⚠️ Patch 1 target not found, skipping.');
            }
        }
    }
} catch (err) {
    console.error('[patch-baileys] ❌ Patch 1 failed:', err.message);
}

// ============================================================
// PATCH 2: Fix newsletter media (messages.js)
//   - directPath /o1/ → /m1/
//   - Include handle in newsletter message
// ============================================================
try {
    if (fs.existsSync(MESSAGES_JS)) {
        let content = fs.readFileSync(MESSAGES_JS, 'utf8');

        if (content.includes('rawDirectPath') && content.includes('mediaKeyDomain')) {
            console.log('[patch-baileys] ✅ Patch 2 (newsletter media) already applied.');
        } else {
            const SEARCH_2 = `        const { mediaUrl, directPath } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs
        });
        await fs.unlink(filePath);
        const obj = WAProto.Message.fromObject({
            // todo: add more support here
            [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject({
                url: mediaUrl,
                directPath,
                fileSha256,
                fileLength,
                ...uploadData,
                media: undefined
            })
        });`;

            const REPLACE_2 = `        const { mediaUrl, directPath: rawDirectPath, handle } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs
        });
        await fs.unlink(filePath);
        // Fix: Newsletter media requires /m1/ prefix instead of /o1/
        const directPath = rawDirectPath && rawDirectPath.includes('/o1/')
            ? rawDirectPath.replace('/o1/', '/m1/')
            : rawDirectPath;
        const mediaMsg = {
            url: mediaUrl,
            directPath,
            fileSha256,
            fileLength,
            ...uploadData,
            media: undefined
        };
        // Newsletter media requires the handle from the upload response
        if (handle) {
            mediaMsg.mediaKeyDomain = handle;
        }
        const obj = WAProto.Message.fromObject({
            // todo: add more support here
            [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject(mediaMsg)
        });`;

            if (content.includes(SEARCH_2)) {
                content = content.replace(SEARCH_2, REPLACE_2);
                fs.writeFileSync(MESSAGES_JS, content, 'utf8');
                console.log('[patch-baileys] ✅ Patch 2 (newsletter media) applied.');
                patchCount++;
            } else {
                console.log('[patch-baileys] ⚠️ Patch 2 target not found, skipping.');
            }
        }
    }
} catch (err) {
    console.error('[patch-baileys] ❌ Patch 2 failed:', err.message);
}

if (patchCount > 0) {
    console.log(`[patch-baileys] 🎉 ${patchCount} patch(es) applied successfully.`);
} else {
    console.log('[patch-baileys] All patches already applied or not needed.');
}
