'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import styles from './ChatPanel.module.css'

function timeLabel(ts) {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function displayName(user) {
  return user?.user_metadata?.nickname || user?.email?.split('@')[0] || ''
}

// ---------- 로그인 / 회원가입 (Supabase Auth) ----------
function AuthBox({ user, onLogout }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  if (!supabase) {
    return (
      <div className={styles.authBox}>
        <div className={styles.authError}>
          Supabase 설정이 필요합니다.<br />
          .env.local.example을 참고해 .env.local을 만들어주세요.
        </div>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (pending) return
    setError('')
    setNotice('')
    setPending(true)
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nickname: nickname.trim() || email.split('@')[0] } },
        })
        if (error) throw error
        // 이메일 확인이 켜져 있으면 세션 없이 가입됨
        if (!data.session) setNotice('확인 메일을 보냈습니다. 메일함을 확인해주세요.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      setEmail('')
      setPassword('')
      setNickname('')
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('Invalid login credentials')) setError('이메일 또는 비밀번호가 올바르지 않습니다')
      else if (msg.includes('already registered')) setError('이미 가입된 이메일입니다')
      else if (msg.includes('at least 6 characters')) setError('비밀번호는 6자 이상이어야 합니다')
      else if (msg.includes('valid email') || msg.includes('invalid format')) setError('올바른 이메일 주소를 입력해주세요')
      else if (msg.includes('Email not confirmed')) setError('이메일 확인이 필요합니다. 메일함을 확인해주세요')
      else setError(msg || '요청에 실패했습니다')
    } finally {
      setPending(false)
    }
  }

  if (user) {
    return (
      <div className={styles.authBar}>
        <span className={styles.authUser}>
          <span className={styles.authUserName}>{displayName(user)}</span> 님
        </span>
        <button className={styles.authLink} onClick={onLogout}>로그아웃</button>
      </div>
    )
  }

  return (
    <form className={styles.authBox} onSubmit={submit}>
      <div className={styles.authInputs}>
        <input
          className={styles.authInput}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          required
        />
      </div>
      <div className={styles.authInputs}>
        <input
          className={styles.authInput}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="비밀번호 (6자 이상)"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
        />
        {mode === 'register' && (
          <input
            className={styles.authInput}
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="닉네임"
            maxLength={20}
          />
        )}
      </div>
      <div className={styles.authActions}>
        <button type="submit" className={styles.authSubmit} disabled={pending}>
          {pending ? '...' : mode === 'login' ? '로그인' : '회원가입'}
        </button>
        <button
          type="button"
          className={styles.authLink}
          onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setNotice('') }}>
          {mode === 'login' ? '회원가입' : '로그인으로'}
        </button>
      </div>
      {error && <div className={styles.authError}>{error}</div>}
      {notice && <div className={styles.authNotice}>{notice}</div>}
    </form>
  )
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false) // 모바일/좁은 화면 토글
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [user, setUser] = useState(null) // Supabase user 객체
  const listRef = useRef(null)
  const stickToBottomRef = useRef(true)

  // Supabase 세션 구독 (새로고침해도 로그인 유지)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase?.auth.signOut()
    setUser(null)
  }

  // 최초 로딩: 최근 50개 + 실시간(INSERT) 구독
  useEffect(() => {
    if (!supabase) return

    supabase
      .from('messages')
      .select('*')
      .order('id', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data.reverse())
      })

    const channel = supabase
      .channel('chat-messages')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          setMessages(prev =>
            prev.some(m => m.id === payload.new.id)
              ? prev
              : [...prev, payload.new].slice(-200)
          )
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // 스크롤이 바닥 근처일 때만 자동 스크롤
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const myName = displayName(user)

  const send = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !user || !supabase) return
    setInput('')
    stickToBottomRef.current = true
    const { data, error } = await supabase
      .from('messages')
      .insert({ user_id: user.id, nickname: myName, text })
      .select()
      .single()
    // Realtime보다 빠르게 내 메시지를 즉시 반영 (중복은 구독 쪽에서 걸러짐)
    if (!error && data) {
      setMessages(prev =>
        prev.some(m => m.id === data.id) ? prev : [...prev, data].slice(-200))
    }
  }

  // 로그인 박스 (채팅과 분리된 별도 카드)
  const authCard = (
    <section className={styles.authCard}>
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>{user ? '내 계정' : '로그인'}</span>
        </div>
      </div>
      <AuthBox user={user} onLogout={handleLogout} />
    </section>
  )

  const panel = (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.liveDot} />
          <span className={styles.headerTitle}>실시간 채팅</span>
        </div>
      </div>

      <div className={styles.messageList} ref={listRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className={styles.empty}>아직 메시지가 없습니다.<br />첫 메시지를 남겨보세요!</div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`${styles.message} ${m.user_id === user?.id ? styles.mine : ''}`}>
            <div className={styles.messageMeta}>
              <span className={styles.messageNick}>{m.nickname}</span>
              <span className={styles.messageTime}>{timeLabel(m.created_at)}</span>
            </div>
            <div className={styles.messageText}>{m.text}</div>
          </div>
        ))}
      </div>

      <form className={styles.inputRow} onSubmit={send}>
        <input
          className={styles.textInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={user ? '메시지 입력...' : '로그인 후 채팅할 수 있습니다'}
          maxLength={300}
          disabled={!user}
        />
        <button type="submit" className={styles.sendBtn} disabled={!user || !input.trim()}>전송</button>
      </form>
    </aside>
  )

  return (
    <>
      {/* 넓은 화면: 왼쪽 고정 — 로그인 박스 + 채팅 박스 */}
      <div className={styles.desktopWrap}>
        {authCard}
        {panel}
      </div>

      {/* 좁은 화면: 토글 버튼 + 오버레이 */}
      <button className={styles.fab} onClick={() => setOpen(o => !o)} aria-label="채팅 열기">
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div className={styles.mobileWrap}>
          {authCard}
          {panel}
        </div>
      )}
    </>
  )
}
