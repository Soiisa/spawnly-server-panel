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
  console.log("--- STARTING INVOICE SEND API ---");

  if (req.method !== 'POST') {
    console.log("❌ Method not allowed");
    return res.status(405).end();
  }

  console.log("1. Initializing Supabase Admin Client...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = req.headers.authorization?.split(' ')[1];
  
  try {
      console.log("2. Verifying Admin Token...");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
          console.error("❌ Auth Error:", authError);
          return res.status(401).json({ error: 'Invalid token' });
      }
      
      const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (profileError || !profile?.is_admin) {
          console.error("❌ Profile Error/Not Admin:", profileError);
          return res.status(403).json({ error: 'Unauthorized' });
      }
      console.log("✅ Admin Verified. User ID:", user.id);
  } catch (err) {
      console.error("❌ Unexpected error during auth check:", err);
      return res.status(500).json({ error: "Auth check failed" });
  }

  return new Promise((resolve, reject) => {
    console.log("3. Initializing Formidable parsing...");
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("❌ Form Parse Error:", err);
        res.status(500).json({ error: 'Failed to parse form' });
        return resolve();
      }

      console.log("✅ Form Parsed Successfully.");
      const file = files.file;
      const transactionId = fields.transaction_id;
      const userEmail = fields.user_email;

      console.log("4. Extracted Fields:", { 
          transactionId, 
          userEmail, 
          fileName: file?.name, 
          fileSize: file?.size 
      });

      if (!file || !transactionId || !userEmail) {
        console.error("❌ Missing required fields!");
        res.status(400).json({ error: 'Missing file, transaction_id, or email' });
        return resolve();
      }

      try {
        console.log("5. Setting up Nodemailer Transporter...");
        console.log(`SMTP Config: Host=${process.env.SMTP_HOST}, Port=${process.env.SMTP_PORT}, User=${process.env.SMTP_USER}`);
        
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: parseInt(process.env.SMTP_PORT, 10) === 465, 
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          connectionTimeout: 10000, 
          greetingTimeout: 10000,
        });

        console.log("6. Verifying SMTP Connection...");
        try {
            await transporter.verify();
            console.log("✅ SMTP Connection Verified successfully!");
        } catch (smtpErr) {
            console.error("❌ SMTP Connection Verification Failed:", smtpErr);
            res.status(500).json({ error: 'SMTP Connection failed: ' + smtpErr.message });
            return resolve();
        }

        console.log("7. Reading HTML Template...");
        const templatePath = path.join(process.cwd(), 'public', 'emails', 'invoice.html');
        console.log("   Template Path:", templatePath);
        const htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        console.log("✅ HTML Template read successfully.");

        console.log(`8. Sending Email to: ${userEmail}...`);
        
        // Ensure we extract the domain correctly if they change the from email
        const senderDomain = process.env.SMTP_FROM_EMAIL ? process.env.SMTP_FROM_EMAIL.split('@')[1] : 'spawnly.net';

        const info = await transporter.sendMail({
          from: `"Spawnly Billing" <${process.env.SMTP_FROM_EMAIL}>`,
          to: userEmail,
          replyTo: `no-reply@${senderDomain}`, // <--- THIS FORCES REPLIES TO GO TO NO-REPLY
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
        console.log("✅ Email Sent successfully! Message ID:", info.messageId);

        console.log(`9. Updating Supabase transaction ID: ${transactionId}...`);
        const { error: dbError } = await supabase
          .from('credit_transactions')
          .update({ invoiced: true })
          .eq('id', transactionId);

        if (dbError) {
            console.error("❌ Supabase Update Error:", dbError);
            throw dbError; 
        }
        console.log("✅ Supabase Updated successfully.");

        console.log("--- INVOICE SEND API COMPLETED SUCCESSFULLY ---");
        res.status(200).json({ success: true });
        resolve();
      } catch (e) {
        console.error("❌ Unexpected Error in Email/DB Block:", e);
        res.status(500).json({ error: e.message || 'Unknown error occurred' });
        resolve();
      }
    });
  });
}