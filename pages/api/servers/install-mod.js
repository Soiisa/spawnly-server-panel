// pages/api/servers/install-mod.js
import AWS from 'aws-sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverId, downloadUrl, filename, folder } = req.body;
  if (!serverId || !downloadUrl || !filename || !folder) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const s3Config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
  };

  const s3 = new AWS.S3(s3Config);

  try {
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      throw new Error(`Failed to download file: ${fileRes.statusText}`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const key = `servers/${serverId}/${folder}/${filename}`;

    await s3.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/java-archive',
    }).promise();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error installing mod/plugin:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to install', detail: err.message });
  }
}