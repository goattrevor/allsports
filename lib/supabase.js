import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// .env.local에 키가 없거나 값이 잘못되면 null — UI에서 설정 안내를 표시함
// (빌드 시점에 값이 이상해도 빌드가 죽지 않도록 try/catch로 감쌈)
let client = null
try {
  if (url && anonKey) client = createClient(url, anonKey)
} catch {
  client = null
}
export const supabase = client
