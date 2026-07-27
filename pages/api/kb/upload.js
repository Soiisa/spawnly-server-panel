import AWS from 'aws-sdk';
import formidable from 'formidable-serverless';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

// 1. Create a server-side admin client that bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 2. Authorize User
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

  // 3. Fetch profile using the Admin client so RLS doesn't block it
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  
  if (!profile || !profile.is_admin) {
    console.log(`[KB Upload] User ${user.id} denied. is_admin is:`, profile?.is_admin);
    return res.status(403).json({ error: 'Forbidden: You are not an admin' });
  }

  // 4. Parse the uploaded file
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Error parsing form data' });

    const file = files.file; 
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // 5. Configure AWS S3
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'eu-central-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      s3ForcePathStyle: !!process.env.S3_ENDPOINT,
    });

    try {
      const fileContent = fs.readFileSync(file.path);
      const safeFilename = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const s3Key = `kb-assets/${uuidv4()}-${safeFilename}`;

      const params = {
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
        ContentType: file.type,
        ACL: 'public-read', 
      };

      const data = await s3.upload(params).promise();
      const publicUrl = data.Location || `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${s3Key}`;

      return res.status(200).json({ url: publicUrl });
    } catch (uploadError) {
      console.error('[KB Upload Error]', uploadError);
      return res.status(500).json({ error: 'S3 Upload failed', detail: uploadError.message });
    }
  });
}