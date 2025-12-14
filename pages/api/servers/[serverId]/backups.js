import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { serverId } = req.query;

  // Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Authorization (Ownership)
  const { data: server } = await supabaseAdmin
    .from('servers')
    .select('id, user_id')
    .eq('id', serverId)
    .single();

  if (!server || server.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: `backups/${serverId}/`,
    });
    const response = await s3Client.send(command);
    
    // Transform and Sort by Date Descending
    const backups = (response.Contents || [])
      .map(file => ({
        key: file.Key,
        name: file.Key.split('/').pop(),
        size: file.Size,
        lastModified: file.LastModified,
      }))
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.status(200).json({ backups });
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ error: 'Failed to fetch backups' });
  }
}