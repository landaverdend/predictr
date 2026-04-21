import { useEffect, useRef, useState, useCallback } from 'react'
import { SimplePool, type Filter, type NostrEvent } from 'nostr-tools'

// Single pool instance shared across the app
export const pool = new SimplePool()

export type RelayStatus = 'connecting' | 'connected' | 'disconnected'

type Subscription = {
  filters: Filter[]
  onEvent: (event: NostrEvent) => void
  onEose?: () => void
}

export function useRelay(url: string) {
  const ws = useRef<WebSocket | null>(null)
  const subs = useRef<Map<string, Subscription>>(new Map())
  const [status, setStatus] = useState<RelayStatus>('connecting')

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => {
      setStatus('connected')
      // resubscribe after reconnect
      subs.current.forEach((sub, id) => {
        socket.send(JSON.stringify(['REQ', id, ...sub.filters]))
      })
    }

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      const [type] = msg

      if (type === 'EVENT') {
        const [, subId, event] = msg
        console.log('[relay] EVENT sub=%s kind=%d id=%s', subId, event.kind, event.id)
        subs.current.get(subId)?.onEvent(event)
      } else if (type === 'EOSE') {
        const [, subId] = msg
        console.log('[relay] EOSE sub=%s', subId)
        subs.current.get(subId)?.onEose?.()
      } else if (type === 'NOTICE') {
        console.log('[relay] NOTICE', msg[1])
      }
    }

    socket.onclose = () => {
      setStatus('disconnected')
      setTimeout(connect, 3000)
    }

    socket.onerror = () => {
      socket.close()
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      ws.current?.close()
    }
  }, [connect])

  const subscribe = useCallback((id: string, filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void) => {
    subs.current.set(id, { filters, onEvent, onEose })
    console.log('[relay] subscribing', id, JSON.stringify(filters))
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(['REQ', id, ...filters]))
    }
    return () => {
      subs.current.delete(id)
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(['CLOSE', id]))
      }
    }
  }, [])

  const publish = useCallback((event: NostrEvent): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (ws.current?.readyState !== WebSocket.OPEN) {
        return reject(new Error('relay not connected'))
      }
      ws.current.send(JSON.stringify(['EVENT', event]))

      const handler = (e: MessageEvent) => {
        const msg = JSON.parse(e.data)
        if (msg[0] === 'OK' && msg[1] === event.id) {
          ws.current?.removeEventListener('message', handler)
          msg[2] ? resolve() : reject(new Error(msg[3]))
        }
      }
      ws.current.addEventListener('message', handler)
    })
  }, [])

  return { status, subscribe, publish }
}
