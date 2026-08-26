import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'supabase-admin-proxy',
        configureServer(server) {
          server.middlewares.use('/api/insert_expense', async (req, res) => {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);
                const supabase = createClient(
                  env.VITE_SUPABASE_URL || 'https://ktxhjnhghgzcyokbcsoe.supabase.co',
                  env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
                );

                // Ensure user profile exists (avoid FK violation)
                const profileData = {
                  id: data.user_id,
                  full_name: data.user_email || 'User',
                  role: data.user_role || 'User',
                  branch: data.user_branch || null
                };
                await supabase.from('profiles').upsert(profileData, { onConflict: 'id', ignoreDuplicates: true });

                // Remove helper fields before insert
                delete data.user_email;
                delete data.user_role;
                delete data.user_branch;

                const { error } = await supabase.from('expense_requests').insert(data);
                
                res.setHeader('Content-Type', 'application/json');
                if (error) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: error.message }));
                } else {
                  res.end(JSON.stringify({ success: true }));
                }
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          });
        }
      }
    ],
    server: {
      proxy: {
        '/azure-api': {
          target: env.VITE_AZURE_ENDPOINT,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/azure-api/, '')
        }
      }
    }
  };
});
