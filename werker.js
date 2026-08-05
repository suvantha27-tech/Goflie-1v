// worker.js - Cloudflare Worker (JavaScript)
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // === AUTH ===
            if (path === '/auth' && method === 'POST') {
                const { username } = await request.json();
                if (!username) return jsonResponse({ error: 'Username required' }, 400, corsHeaders);
                
                // Check if user exists in D1
                let user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
                if (!user) {
                    // Create new user
                    const result = await env.DB.prepare('INSERT INTO users (username) VALUES (?)').bind(username).run();
                    user = { id: result.meta.last_row_id, username };
                }
                return jsonResponse({ success: true, user }, 200, corsHeaders);
            }

            // === LIST FILES ===
            if (path === '/files' && method === 'GET') {
                const username = url.searchParams.get('username');
                if (!username) return jsonResponse({ error: 'Username required' }, 400, corsHeaders);
                
                const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (!user) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                
                const files = await env.DB.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC').bind(user.id).all();
                return jsonResponse(files.results, 200, corsHeaders);
            }

            // === UPLOAD ===
            if (path === '/upload' && method === 'POST') {
                const formData = await request.formData();
                const file = formData.get('file');
                const username = formData.get('username');
                
                if (!file || !username) return jsonResponse({ error: 'Missing file or username' }, 400, corsHeaders);
                
                const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (!user) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                
                const key = ${Date.now()}_${file.name};
                // Upload to R2
                await env.R2_BUCKET.put(key, file.stream(), {
                    httpMetadata: { contentType: file.type }
                });
                
                // Save metadata to D1
                await env.DB.prepare(
                    'INSERT INTO files (user_id, name, key, size, mime_type) VALUES (?, ?, ?, ?, ?)'
                ).bind(user.id, file.name, key, file.size, file.type).run();
                
                return jsonResponse({ success: true, key }, 200, corsHeaders);
            }

            // === DOWNLOAD ===
            if (path.startsWith('/download/') && method === 'GET') {
                const id = path.split('/')[2];
                const username = url.searchParams.get('username');
                if (!username) return jsonResponse({ error: 'Username required' }, 400, corsHeaders);
                
                const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (!user) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                
                const file = await env.DB.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').bind(id, user.id).first();
              if (!file) return jsonResponse({ error: 'File not found' }, 404, corsHeaders);
                
                const object = await env.R2_BUCKET.get(file.key);
                if (!object) return jsonResponse({ error: 'File not found in storage' }, 404, corsHeaders);
                
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('Content-Disposition', `attachment; filename="${file.name}"`);
                return new Response(object.body, { headers });
            }

            // === DELETE ===
            if (path.startsWith('/delete/') && method === 'DELETE') {
                const id = path.split('/')[2];
                const username = url.searchParams.get('username');
                if (!username) return jsonResponse({ error: 'Username required' }, 400, corsHeaders);
                
                const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
                if (!user) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);
                
                const file = await env.DB.prepare('SELECT key FROM files WHERE id = ? AND user_id = ?').bind(id, user.id).first();
                if (!file) return jsonResponse({ error: 'File not found' }, 404, corsHeaders);
                
                await env.R2_BUCKET.delete(file.key);
                await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
                
                return jsonResponse({ success: true }, 200, corsHeaders);
            }

            return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);
        } catch (e) {
            return jsonResponse({ error: e.message }, 500, corsHeaders);
        }
    }
};

function jsonResponse(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}
              
