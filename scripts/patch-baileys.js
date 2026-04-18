#!/usr/bin/env node
/**
 * Patch: Baileys Newsletter Media Fix (Stable Version)
 * 
 * Fixes known bugs in @whiskeysockets/baileys for newsletter media:
 * 1. Captures 'handle' from upload response.
 * 2. Fixes directPath prefix (/o1/ -> /m1/).
 * 
 * This version is simplified to avoid 'Connection Closed' errors.
 */

const fs = require('fs');
const path = require('path');

const BAILEYS_DIR = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils');
const MESSAGES_JS = path.join(BAILEYS_DIR, 'messages.js');
const MESSAGES_MEDIA_JS = path.join(BAILEYS_DIR, 'messages-media.js');

let patchCount = 0;

// PATCH 1: Capture `handle` (messages-media.js)
try {
    if (fs.existsSync(MESSAGES_MEDIA_JS)) {
        let content = fs.readFileSync(MESSAGES_MEDIA_JS, 'utf8');
        if (content.includes('handle: result.handle')) {
            console.log('[patch-baileys] ✅ Patch 1 already applied.');
        } else {
            const search = 'directPath: result.direct_path,';
            const replace = 'directPath: result.direct_path,\n                        handle: result.handle,';
            if (content.includes(search)) {
                content = content.replace(search, replace);
                fs.writeFileSync(MESSAGES_MEDIA_JS, content, 'utf8');
                console.log('[patch-baileys] ✅ Patch 1 applied.');
                patchCount++;
            }
        }
    }
} catch (e) {}

// PATCH 2: fix directPath (messages.js)
try {
    if (fs.existsSync(MESSAGES_JS)) {
        let content = fs.readFileSync(MESSAGES_JS, 'utf8');
        if (content.includes('rawDirectPath')) {
            console.log('[patch-baileys] ✅ Patch 2 already applied.');
        } else {
            const startMarker = 'const { filePath, fileSha256, fileLength } = await getRawMediaUploadData';
            const search = 'const { mediaUrl, directPath } = await options.upload';
            const replace = 'const { mediaUrl, directPath: rawDirectPath, handle } = await options.upload';
            
            if (content.includes(search)) {
                content = content.replace(search, replace);
                content = content.replace(
                    'await fs.unlink(filePath);',
                    'await fs.unlink(filePath);\n        const directPath = rawDirectPath && rawDirectPath.includes("/o1/") ? rawDirectPath.replace("/o1/", "/m1/") : rawDirectPath;'
                );
                fs.writeFileSync(MESSAGES_JS, content, 'utf8');
                console.log('[patch-baileys] ✅ Patch 2 applied.');
                patchCount++;
            }
        }
    }
} catch (e) {}

if (patchCount > 0) console.log(`[patch-baileys] 🎉 ${patchCount} patch(es) applied.`);
