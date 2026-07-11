// 초안: 인메모리 회원가입/로그인 (서버 재시작 시 초기화됨)
// 실서비스 전환 시 DB + 세션/JWT(NextAuth 등)로 교체 권장.
import { createHash, randomBytes } from 'crypto'

function getStore() {
  if (!globalThis.__authStore) {
    globalThis.__authStore = { users: {} } // { [username]: { salt, hash } }
  }
  return globalThis.__authStore
}

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password).digest('hex')
}

// POST /api/auth — { action: 'register' | 'login', username, password }
export async function POST(request) {
  const store = getStore()
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const action = body.action
  const username = String(body.username || '').trim().slice(0, 20)
  const password = String(body.password || '')

  if (!username || !password) {
    return Response.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9가-힣_]{2,20}$/.test(username)) {
    return Response.json({ error: '아이디는 2~20자의 한글/영문/숫자만 가능합니다' }, { status: 400 })
  }
  if (password.length < 4) {
    return Response.json({ error: '비밀번호는 4자 이상이어야 합니다' }, { status: 400 })
  }

  if (action === 'register') {
    if (store.users[username]) {
      return Response.json({ error: '이미 존재하는 아이디입니다' }, { status: 409 })
    }
    const salt = randomBytes(8).toString('hex')
    store.users[username] = { salt, hash: hashPassword(password, salt) }
    return Response.json({ username })
  }

  if (action === 'login') {
    const user = store.users[username]
    if (!user || user.hash !== hashPassword(password, user.salt)) {
      return Response.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 })
    }
    return Response.json({ username })
  }

  return Response.json({ error: '알 수 없는 요청입니다' }, { status: 400 })
}
