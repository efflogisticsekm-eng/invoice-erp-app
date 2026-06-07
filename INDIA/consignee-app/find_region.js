import pg from 'pg';
const { Client } = pg;

const projectRef = "ktxhjnhghgzcyokbcsoe";
const user = `postgres.${projectRef}`;
const password = "wrong_password_on_purpose";

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'eu-west-2',
  'sa-east-1'
];

async function run() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const client = new Client({
      host,
      port: 5432,
      user,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 2000
    });

    try {
      await client.connect();
      console.log(`CONNECTED to ${region} (unexpected!)`);
      await client.end();
    } catch (err) {
      console.log(`${region}: ${err.message}`);
      try { await client.end(); } catch (e) {}
    }
  }
}

run();
