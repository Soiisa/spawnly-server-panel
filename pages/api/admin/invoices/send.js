// pages/api/admin/invoices/send.js
import formidable from 'formidable-serverless';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = req.headers.authorization?.split(' ')[1];
  
  // Verify Admin
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return res.status(403).json({ error: 'Unauthorized' });

  const form = new formidable.IncomingForm();
  
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Failed to parse form' });

    const file = files.file;
    const transactionId = fields.transaction_id;
    const userEmail = fields.user_email;

    if (!file || !transactionId || !userEmail) {
      return res.status(400).json({ error: 'Missing file, transaction_id, or email' });
    }

    try {
      // 1. Setup Nodemailer Transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_PORT == 465, // true for 465, false for 587
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // 2. Read the Email HTML Template
      const templatePath = path.join(process.cwd(), 'public', 'emails', 'invoice.html');
      const htmlTemplate = fs.readFileSync(templatePath, 'utf8');

      // 3. Send Email with Attachment
      await transporter.sendMail({
        from: `"Spawnly Billing" <${process.env.SMTP_FROM_EMAIL}>`,
        to: userEmail,
        subject: 'Sua Fatura / Your Invoice - Spawnly',
        html: htmlTemplate,
        attachments: [
          {
            filename: file.name || 'Fatura_Spawnly.pdf',
            path: file.path,
            contentType: file.type || 'application/pdf'
          }
        ]
      });

      // 4. Update the database to mark as invoiced
      await supabase
        .from('credit_transactions')
        .update({ invoiced: true })
        .eq('id', transactionId);

      res.status(200).json({ success: true });
    } catch (e) {
      console.error("Email Error:", e);
      res.status(500).json({ error: e.message });
    }
  });
}