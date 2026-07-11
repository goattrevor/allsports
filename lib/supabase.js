import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// .env.local에 키가 없으면 null — UI에서 설정 안내를 표시함
export const supabase = url && anonKey ? createClient(url, anonKey) : null
