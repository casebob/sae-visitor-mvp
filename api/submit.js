import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = {
  api: { bodyParser: false }  // let formidable parse multipart
};

function bad(res, msg, code=400) {
  res.status(code).json({ error: msg });
}

function toISO(dtStr) {
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return bad(res, 'Use POST with multipart/form-data');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = process.env.SUPABASE_BUCKET || 'visitor-uploads';
  const DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || '@student.sae.edu.au';
  const LEAD_H = parseInt(process.env.LEAD_TIME_HOURS || '2', 10);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return bad(res, 'Server not configured (Supabase env missing)', 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }});

  const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 }); // 10MB per file

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const required = ['resident_name','student_number','student_email','visitor_full_name','entry_at'];
    for (const k of required) {
      if (!fields[k] || (Array.isArray(fields[k]) && !fields[k][0])) return bad(res, `Missing ${k}`);
    }

    const email = String(fields['student_email']);
    if (!email.endsWith(DOMAIN)) return bad(res, `Email must end with ${DOMAIN}`);

    const entryISO = toISO(String(fields['entry_at']));
    if (!entryISO) return bad(res, 'Invalid entry_at date');
    const entry = new Date(entryISO);
    const now = new Date();
    if (entry.getTime() < now.getTime() + LEAD_H*60*60*1000) {
      return bad(res, `Entry must be at least ${LEAD_H} hours from now`);
    }
    const exit = new Date(entry.getTime() + 24*60*60*1000); // +24h

    // files
    const photo = files['visitor_photo'];
    const idfront = files['id_front'];
    if (!photo) return bad(res, 'Missing visitor_photo');
    if (!idfront) return bad(res, 'Missing id_front');

    // upsert student
    const { data: student, error: sErr } = await supabase
      .from('students')
      .upsert({
        student_number: String(fields['student_number']),
        resident_name: String(fields['resident_name']),
        email
      }, { onConflict: 'student_number' })
      .select()
      .single();
    if (sErr) return bad(res, sErr.message, 500);

    // insert visitor
    const { data: visitor, error: vErr } = await supabase
      .from('visitors')
      .insert({ full_name: String(fields['visitor_full_name']) })
      .select()
      .single();
    if (vErr) return bad(res, vErr.message, 500);

    // create visit
    const { data: visit, error: visErr } = await supabase
      .from('visits')
      .insert({
        student_id: student.id,
        visitor_id: visitor.id,
        entry_at: entryISO,
        exit_at: exit.toISOString(),
        auto_overnight: true,
        created_ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
      })
      .select()
      .single();
    if (visErr) return bad(res, visErr.message, 500);

    // upload files to storage
    async function uploadOne(file, type, extFallback) {
      const f = Array.isArray(file) ? file[0] : file;
      const b = await fs.readFile(f.filepath);
      const mime = f.mimetype || 'application/octet-stream';
      const ext = (f.originalFilename && f.originalFilename.split('.').pop()) || extFallback;
      const key = `visits/${visit.id}/${type}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, b, {
        contentType: mime,
        upsert: true
      });
      if (upErr) throw upErr;
      await supabase.from('documents').insert({
        visit_id: visit.id, doc_type: type, storage_key: key, mime, size_bytes: f.size || b.length
      });
    }

    await uploadOne(photo, 'visitor_photo', 'jpg');
    await uploadOne(idfront, 'id_front', 'jpg');

    res.status(200).json({
      ok: true,
      visit_id: visit.id,
      exit_at: exit.toISOString()
    });
  } catch (e) {
    console.error(e);
    return bad(res, e.message || 'Server error', 500);
  }
}

