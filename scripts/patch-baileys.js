#!/usr/bin/env node
/**
 * Patch: Baileys Newsletter Media Fix (PR #2434)
 * 
 * Applies the full protocol fix required for newsletter media:
 * 1. Newsletter media endpoint /newsletter/newsletter-* and server_thumb_gen=1
 * 2. `url` set to null/undefined instead of URL
 * 3. mediatype attribute set on plaintext node
 * 4. fileEncSha256 mapped to fileSha256 for unencrypted media
 * 5. Extracts and injects thumbnail data from upload response
 */

const fs = require('fs');
const path = require('path');

const BAILEYS_DIR = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib');
const MESSAGES_JS = path.join(BAILEYS_DIR, 'Utils', 'messages.js');
const MESSAGES_MEDIA_JS = path.join(BAILEYS_DIR, 'Utils', 'messages-media.js');
const MESSAGES_SEND_JS = path.join(BAILEYS_DIR, 'Socket', 'messages-send.js');

let patchCount = 0;

try {
    if (fs.existsSync(MESSAGES_MEDIA_JS)) {
        let content = fs.readFileSync(MESSAGES_MEDIA_JS, 'utf8');
        let patched = false;
        
        // 1. Add extra fields from result
        const directPathRegex = /if\s*\(result\?\.url\s*\|\|\s*result\?\.directPath\)\s*\{/;
        if (!content.includes('thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path') && directPathRegex.test(content)) {
            content = content.replace(
                directPathRegex,
                `if (result?.url || result?.direct_path) {`
            );
            
            const fieldsRegex = /urls\s*=\s*\{\s*mediaUrl:\s*result\.url,\s*directPath:\s*result\.direct_path,/;
            content = content.replace(
                fieldsRegex,
                `urls = {
                        mediaUrl: result.url || result.direct_path,
                        directPath: result.direct_path,
                        thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path,
                        thumbnailSha256: result.thumbnail_info?.thumbnail_sha256,
                        handle: result.handle,`
            );
            patched = true;
        }
        
        // 2. Fix the upload URL if newsletter
        const urlRegex = /const\s+url\s*=\s*\`https:\/\/\$\{hostname\}\$\{MEDIA_PATH_MAP\[mediaType\]\}\/\$\{fileEncSha256B64\}\?auth=\$\{auth\}&token=\$\{fileEncSha256B64\}\`;/;
        if (!content.includes('isNewsletterUrl') && urlRegex.test(content)) {
            const replaceUrl = `const isNewsletterUrl = !!arguments[1].newsletter;
            const newsletterPath = MEDIA_PATH_MAP[mediaType] ? MEDIA_PATH_MAP[mediaType].replace('/mms/', '/newsletter/newsletter-') : '/newsletter/newsletter-document';
            let urlPath = isNewsletterUrl ? newsletterPath : MEDIA_PATH_MAP[mediaType];
            let url = \`https://\${hostname}\${urlPath}/\${fileEncSha256B64}?auth=\${auth}&token=\${fileEncSha256B64}\`;
            if (isNewsletterUrl) {
                url += "&server_thumb_gen=1";
                if (mediaType === 'video' || mediaType === 'gif' || mediaType === 'ptv') {
                    url += '&server_transcode=1';
                }
            }`;
            content = content.replace(urlRegex, replaceUrl);
            patched = true;
        }

        if (patched) {
            fs.writeFileSync(MESSAGES_MEDIA_JS, content, 'utf8');
            console.log('[patch-baileys] ✅ messages-media.js patched');
            patchCount++;
        }
    } else {
        console.warn('[patch-baileys] ⚠️ Target file not found: messages-media.js');
    }
} catch(e) {
    console.error('[patch-baileys] ERROR patching messages-media.js:', e.message);
}

try {
    if (fs.existsSync(MESSAGES_JS)) {
        let content = fs.readFileSync(MESSAGES_JS, 'utf8');
        let patched = false;

        if (content.includes('const mediaMsg = {') && content.includes('thumbnailDirectPath: isNewsletter')) {
           // Already patched heavily.
        } else {
            const originalUploadRegex = /const\s*\{\s*mediaUrl,\s*directPath\s*\}\s*=\s*await\s*options\.upload\(filePath,\s*\{/;
            if (!content.includes('thumbnailDirectPath: isNewsletter') && originalUploadRegex.test(content)) {
                // 3. Inject newsletter properties into options.upload
                content = content.replace(
                    originalUploadRegex,
                    `const { mediaUrl, directPath: rawDirectPath, thumbnailDirectPath, thumbnailSha256, handle } = await options.upload(filePath, {
            newsletter: isNewsletter,`
                );
                
                // 4. Inject unlinking and directPath mapping
                content = content.replace(
                    /await\s*fs\.unlink\(filePath\);/,
                    `await fs.unlink(filePath);
        const directPath = (isNewsletter && rawDirectPath && rawDirectPath.includes('/o1/')) ? rawDirectPath.replace('/o1/', '/m1/') : rawDirectPath;`
                );
                
                // 5. Replace message generation
                const objCreationRegex = /const\s*obj\s*=\s*WAProto\.Message\.fromObject\(\{/;
                content = content.replace(
                    objCreationRegex,
                    `const mediaMsg = {
            url: isNewsletter ? undefined : mediaUrl,
            directPath,
            thumbnailDirectPath: isNewsletter ? thumbnailDirectPath : undefined,
            thumbnailSha256: isNewsletter ? thumbnailSha256 : undefined,
            fileSha256,
            fileLength,
            ...uploadData,
            media: undefined,
        };
        if (isNewsletter) {
            delete mediaMsg.mediaKey;
            delete mediaMsg.mediaKeyTimestamp;
        }
        if (isNewsletter && handle) mediaMsg.mediaKeyDomain = handle;
        
        const obj = WAProto.Message.fromObject({`
                );
                
                const msgObjectRegex = /\[\`\$\{\w+\}Message\`\]:\s+MessageTypeProto\[\w+\]\.fromObject\(\{[^\}]+media:\s*undefined\s*\}\)/s;
                content = content.replace(msgObjectRegex, '[`${mediaType}Message`]: MessageTypeProto[mediaType].fromObject(mediaMsg)');
                
                patched = true;
            }
        }

        if (patched) {
            fs.writeFileSync(MESSAGES_JS, content, 'utf8');
            console.log('[patch-baileys] ✅ messages.js patched');
            patchCount++;
        }
    } else {
        console.warn('[patch-baileys] ⚠️ Target file not found: messages.js');
    }
} catch(e) {
    console.error('[patch-baileys] ERROR patching messages.js:', e.message);
}

try {
    if (fs.existsSync(MESSAGES_SEND_JS)) {
        let content = fs.readFileSync(MESSAGES_SEND_JS, 'utf8');
        let patched = false;
        
        const searchSendRegex = /const\s*bytes\s*=\s*encodeNewsletterMessage\(patched\);\s*binaryNodeContent\.push\(\{\s*tag:\s*'plaintext',\s*attrs:\s*\{\},\s*content:\s*bytes\s*\}\);/s;
        
        if (!content.includes('pAttrs.mediatype') && searchSendRegex.test(content)) {
            const replaceSend = `const bytes = encodeNewsletterMessage(patched);
                const pAttrs = {};
                if (mediaType) pAttrs.mediatype = mediaType;
                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: pAttrs,
                    content: bytes
                });`;
            content = content.replace(searchSendRegex, replaceSend);
            fs.writeFileSync(MESSAGES_SEND_JS, content, 'utf8');
            console.log('[patch-baileys] ✅ messages-send.js patched');
            patchCount++;
        }
    } else {
        console.warn('[patch-baileys] ⚠️ Target file not found: messages-send.js');
    }
} catch(e) {
    console.error('[patch-baileys] ERROR patching messages-send.js:', e.message);
}

if (patchCount > 0) {
    console.log(`[patch-baileys] 🎉 \${patchCount} patch(es) applied successfully based on PR #2434.`);
} else {
    console.log(`[patch-baileys] ℹ️ All patches already applied or target files not found.`);
}
