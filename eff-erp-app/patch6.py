import re
with open("src/Scanner.jsx", "r") as f:
    content = f.read()

target = """      const adminSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        adminKey
      );"""

replacement = """      const customFetch = (url, options) => {
        const newOptions = { ...options };
        newOptions.headers = new Headers(options.headers);
        if (newOptions.headers.has('apikey')) {
          newOptions.headers.set('apikey', adminKey);
        }
        if (newOptions.headers.has('Authorization')) {
          newOptions.headers.set('Authorization', `Bearer ${adminKey}`);
        }
        return fetch(url, newOptions);
      };
      
      const adminSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { global: { fetch: customFetch } }
      );"""

content = content.replace(target, replacement)

with open("src/Scanner.jsx", "w") as f:
    f.write(content)
