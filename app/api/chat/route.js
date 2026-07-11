// 초안: 인메모리 채팅 저장소 (서버 재시작 시 초기화됨)
// 실서비스 전환 시 Redis/DB + WebSocket(Pusher, Supabase Realtime 등)으로 교체 권장.
// globalThis에 저장해 dev 핫리로드에도 유지되도록 함.

const MAX_MESSAGES = 200

function getStore() {
  if (!globalThis.__chatStore) {
    globalThis.__chatStore = { messages: [], nextId: 1 }
  }
  return globalThis.__chatStore
}

// GET /api/chat?since=<id> — since 이후의 새 메시지만 반환 (폴링용)
export async function GET(request) {
  const store = getStore()
  const since = Number(new URL(request.url).searchParams.get('since') || 0)
  const messages = since > 0
    ? store.messages.filter(m => m.id > since)
    : store.messages.slice(-50) // 최초 접속 시 최근 50개
  return Response.json({ messages, lastId: store.nextId - 1 })
}

// POST /api/chat — { nickname, text }
export async function POST(request) {
  const store = getStore()
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 })
  }

  const nickname = String(body.nickname || '').trim().slice(0, 20)
  const text = String(body.text || '').trim().slice(0, 300)
  if (!nickname || !text) {
    return Response.json({ error: 'nickname and text required' }, { status: 400 })
  }

  const message = { id: store.nextId++, nickname, text, ts: Date.now() }
  store.messages.push(message)
  if (store.messages.length > MAX_MESSAGES) {
    store.messages = store.messages.slice(-MAX_MESSAGES)
  }
  return Response.json({ message })
}
