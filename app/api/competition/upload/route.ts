import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  const competitionId = String(form.get('competitionId') ?? '');

  if (!(file instanceof File) || !competitionId) {
    return NextResponse.json({ error: 'Missing upload.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is too large. Maximum 8 MB.' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const path = `${competitionId}/${crypto.randomUUID()}.${ext}`;
  const supabase = getSupabaseAdmin();
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('competition-uploads')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from('competition-uploads').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
