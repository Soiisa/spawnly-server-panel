import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const deleteS3ServerFolder = async (serverId) => {
  console.log(`[deleteS3ServerFolder] Deleting S3 folder for server: ${serverId}`);
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `servers/${serverId}/`,
    });
    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents?.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
          Quiet: true,
        },
      });
      await s3Client.send(deleteCommand);
      console.log(`[deleteS3ServerFolder] Successfully deleted ${listResponse.Contents.length} objects from S3 for server: ${serverId}`);
    } else {
      console.log(`[deleteS3ServerFolder] No objects found in S3 for server: ${serverId}`);
    }
    return true;
  } catch (err) {
    console.error(`[deleteS3ServerFolder] Failed to delete S3 folder servers/${serverId}:`, err);
    throw new Error(`S3 folder deletion failed: ${err.message}`);
  }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('[API:delete-s3-folder] Received request:', { method: req.method, body: req.body });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { serverId } = req.body || {};
    if (!serverId) {
      console.error('[API:delete-s3-folder] Missing serverId in request body');
      return res.status(400).json({ error: 'Missing serverId' });
    }

    await deleteS3ServerFolder(serverId);
    console.log(`[API:delete-s3-folder] Successfully deleted S3 folder for server ${serverId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[API:delete-s3-folder] Unhandled error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
}