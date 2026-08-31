import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ktxhjnhghgzcyokbcsoe.supabase.co';
const anonKey = 'sb_publishable_5CrNpGooLCzL8aNPO-iaPA_8YlxZFMX';
const serviceKey = 'sb_secret_pVTO1a3fvJsmrIIm4nL3Rw_-7Yy1FPn';

const customFetch = (url, options) => {
  const newOptions = { ...options };
  newOptions.headers = new Headers(options.headers);
  
  // Replace Anon key with Service Role key
  if (newOptions.headers.has('apikey')) {
    newOptions.headers.set('apikey', serviceKey);
  }
  if (newOptions.headers.has('Authorization')) {
    newOptions.headers.set('Authorization', `Bearer ${serviceKey}`);
  }
  
  return fetch(url, newOptions);
};

const supabase = createClient(supabaseUrl, anonKey, {
  global: { fetch: customFetch }
});

async function test() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
