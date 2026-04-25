#!/usr/bin/env node
/**
 * find-electrum-ws
 *
 * Crawls the Electrum peer network (via TCP/SSL server.peers.subscribe) and
 * probes each discovered node for WebSocket support.
 *
 * Usage:
 *   node scripts/find-electrum-ws.mjs [--timeout 5000] [--concurrency 20]
 *
 * Output: a list of ws:// and wss:// URLs that responded successfully.
 *
 * Notes:
 *   - Seed servers are well-known public Electrum nodes; the script works for
 *     mainnet, testnet, and regtest alike — pass your own seeds for non-mainnet
 *     networks since there are no public peer lists for regtest.
 *   - WebSocket ports probed: 50003 (ws), 50004 (wss)
 *   - TCP ports probed for peer discovery: 50001 (plain), 50002 (SSL)
 */

import net from 'net'
import tls from 'tls'
import { WebSocket } from 'ws'

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : def
}

const TIMEOUT_MS   = parseInt(getArg('--timeout', '5000'), 10)
const CONCURRENCY  = parseInt(getArg('--concurrency', '20'), 10)
const EXTRA_SEEDS  = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--timeout' && args[i - 1] !== '--concurrency')

const USE_TESTNET = args.includes('--testnet')
const USE_SIGNET  = args.includes('--signet')

// Well-known mainnet seed servers.
const MAINNET_SEEDS = [
  'electrum.blockstream.info:50001',
  'electrum.blockstream.info:50002',
  'electrum1.bluewallet.io:50001',
  'electrum2.bluewallet.io:50001',
  'electrum3.bluewallet.io:50001',
  'hodlister.co:50002',
  'electrum.jochen-hoenicke.de:50005',
  'ecdsa.net:50002',
  'e.keff.org:50001',
  'electrum.emzy.de:50001',
  'electrum.petrkr.net:50002',
  'fortress.qtornado.com:50001',
  'VPS.hsmiths.com:50001',
]

// Known signet Electrum servers (~300k blocks).
const SIGNET_SEEDS = [
  'signet.bitcoin.ninja:50001',
  'signet.bitcoin.ninja:50002',
  'electrum.signet.bravewallet.io:50001',
  'btc.signet.klever.io:50001',
  'signetapi.lightning.engineering:50001',
  '45.33.96.47:50001',
]

// Known testnet4 / testnet3 Electrum servers.
// Testnet has no reliable crawlable peer network so these are direct seeds.
const TESTNET_SEEDS = [
  'electrum.blockstream.info:60001',   // Blockstream testnet TCP
  'electrum.blockstream.info:60002',   // Blockstream testnet SSL
  'testnet.aranguren.org:51001',       // TCP
  'testnet.aranguren.org:51002',       // SSL
  'testnet.hsmiths.com:53011',         // SSL
  'tn.not.fyi:55001',                  // TCP
  'tn.not.fyi:55002',                  // SSL
  'electrum.qtornado.com:51001',       // TCP testnet
  'testnet.qtornado.com:51001',        // TCP testnet (alt)
]

const DEFAULT_SEEDS = USE_SIGNET ? SIGNET_SEEDS : USE_TESTNET ? TESTNET_SEEDS : MAINNET_SEEDS
const seeds = [...new Set([...DEFAULT_SEEDS, ...EXTRA_SEEDS])]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSeed(seed) {
  const lastColon = seed.lastIndexOf(':')
  const host = seed.slice(0, lastColon)
  const port = parseInt(seed.slice(lastColon + 1), 10)
  return { host, port }
}

/** Send one JSON-RPC call over a raw TCP/TLS socket, return parsed response. */
function rpcCall(socket, method, params = []) {
  return new Promise((resolve, reject) => {
    let buf = ''
    const id = Math.floor(Math.random() * 1e9)
    const msg = JSON.stringify({ id, method, params }) + '\n'

    socket.on('data', chunk => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if (obj.id === id) resolve(obj.result ?? obj.error)
        } catch { /* ignore partial frames */ }
      }
    })
    socket.on('error', reject)
    socket.write(msg)
  })
}

/** Connect to host:port via plain TCP, run server.peers.subscribe, return peers. */
function fetchPeersTCP(host, port) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.destroy(); resolve([]) }, TIMEOUT_MS)
    const socket = net.connect({ host, port }, async () => {
      try {
        // handshake first
        await rpcCall(socket, 'server.version', ['find-electrum-ws/1.0', '1.4'])
        const peers = await rpcCall(socket, 'server.peers.subscribe', [])
        clearTimeout(timer)
        socket.destroy()
        resolve(Array.isArray(peers) ? peers : [])
      } catch {
        clearTimeout(timer)
        socket.destroy()
        resolve([])
      }
    })
    socket.on('error', () => { clearTimeout(timer); resolve([]) })
  })
}

/** Connect to host:port via TLS (SSL), run server.peers.subscribe, return peers. */
function fetchPeersTLS(host, port) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.destroy(); resolve([]) }, TIMEOUT_MS)
    const socket = tls.connect({ host, port, rejectUnauthorized: false }, async () => {
      try {
        await rpcCall(socket, 'server.version', ['find-electrum-ws/1.0', '1.4'])
        const peers = await rpcCall(socket, 'server.peers.subscribe', [])
        clearTimeout(timer)
        socket.destroy()
        resolve(Array.isArray(peers) ? peers : [])
      } catch {
        clearTimeout(timer)
        socket.destroy()
        resolve([])
      }
    })
    socket.on('error', () => { clearTimeout(timer); resolve([]) })
  })
}

/**
 * Parse a peer entry from server.peers.subscribe.
 * Each entry is: [ip_or_onion, hostname, ["v1.4", "s50002", "t50001", "w50003", ...]]
 * Returns { host, tcpPort, sslPort, wsPort, wssPort } or null if unparseable.
 */
function parsePeer(entry) {
  if (!Array.isArray(entry) || entry.length < 3) return null
  const [, hostname, features] = entry
  if (!hostname || typeof hostname !== 'string') return null

  let tcpPort = null, sslPort = null, wsPort = null, wssPort = null

  for (const f of features) {
    if (typeof f !== 'string') continue
    if (f.startsWith('t')) tcpPort = parseInt(f.slice(1), 10) || 50001
    if (f.startsWith('s')) sslPort = parseInt(f.slice(1), 10) || 50002
    if (f.startsWith('w')) wsPort  = parseInt(f.slice(1), 10) || 50003
    if (f.startsWith('W')) wssPort = parseInt(f.slice(1), 10) || 50004
  }

  return { host: hostname, tcpPort, sslPort, wsPort, wssPort }
}

/** Attempt a WebSocket connection; resolves with the URL if it works, else null. */
function probeWS(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { try { ws.terminate() } catch {} resolve(null) }, TIMEOUT_MS)
    let ws
    try {
      ws = new WebSocket(url, { rejectUnauthorized: false })
    } catch {
      clearTimeout(timer)
      return resolve(null)
    }

    ws.on('open', () => {
      // Send server.version to confirm it's actually Electrum, not just any WS server
      ws.send(JSON.stringify({ id: 1, method: 'server.version', params: ['find-electrum-ws/1.0', '1.4'] }))
    })

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id === 1) {
          clearTimeout(timer)
          ws.terminate()
          resolve(url)
        }
      } catch { /* ignore */ }
    })

    ws.on('error', () => { clearTimeout(timer); resolve(null) })
    ws.on('close', () => { clearTimeout(timer); resolve(null) })
  })
}

/** Run fn over items with at most `limit` concurrent promises. */
async function pMap(items, fn, limit) {
  const results = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

// Known SSL ports across mainnet + testnet — used to pick TLS vs plain TCP
const SSL_PORTS = new Set([50002, 50004, 60002, 51002, 53011, 55002])

/**
 * Fetch the server list from 1209k.com, which independently tracks live
 * Electrum nodes. Returns an array of { host, tcpPort, sslPort } objects.
 */
async function fetch1209k(testnet) {
  const chain = testnet ? 'tbtc' : 'btc'
  const url = `https://1209k.com/bitcoin-eye/ele.php?chain=${chain}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const json = await res.json()
    const servers = json?.servers ?? {}
    return Object.entries(servers).map(([host, ports]) => ({
      host,
      tcpPort: ports.t ? parseInt(ports.t, 10) : null,
      sslPort: ports.s ? parseInt(ports.s, 10) : null,
      wsPort:  ports.w ? parseInt(ports.w, 10) : null,
      wssPort: ports.W ? parseInt(ports.W, 10) : null,
    }))
  } catch {
    return []
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network = USE_SIGNET ? 'signet' : USE_TESTNET ? 'testnet' : 'mainnet'
  console.log(`\n🔍  find-electrum-ws  [${network}]`)
  console.log(`    Seeds: ${seeds.length}  |  Timeout: ${TIMEOUT_MS}ms  |  Concurrency: ${CONCURRENCY}\n`)

  const knownHosts = new Set()
  const candidates = [] // { host, wsPort, wssPort }

  // Signet has no public peer directory — probe seeds directly and crawl their peer lists
  // For mainnet/testnet we also hit 1209k.com
  const use1209k = !USE_SIGNET

  process.stdout.write(use1209k
    ? '  Fetching 1209k.com directory + peer crawl...'
    : '  Crawling seed peers...')

  const peerPromises = seeds.map(seed => {
    const { host, port } = parseSeed(seed)
    return SSL_PORTS.has(port) ? fetchPeersTLS(host, port) : fetchPeersTCP(host, port)
  })

  const allResults = use1209k
    ? await Promise.all([fetch1209k(USE_TESTNET), ...peerPromises])
    : await Promise.all([Promise.resolve([]), ...peerPromises])

  const [directoryEntries, ...peerResults] = allResults

  // Add directory entries first
  for (const p of directoryEntries) {
    if (knownHosts.has(p.host)) continue
    knownHosts.add(p.host)
    candidates.push(p)
  }

  // Add peers discovered from seed crawl
  for (const peers of peerResults) {
    for (const entry of peers) {
      const p = parsePeer(entry)
      if (!p || knownHosts.has(p.host)) continue
      knownHosts.add(p.host)
      candidates.push(p)
    }
  }

  // Always probe the seeds themselves
  for (const seed of seeds) {
    const { host } = parseSeed(seed)
    if (!knownHosts.has(host)) {
      knownHosts.add(host)
      candidates.push({ host, wsPort: null, wssPort: null })
    }
  }

  console.log(` found ${candidates.length} unique hosts\n`)

  // Step 2: build probe list — always try standard ports; if a non-standard
  // port was advertised via feature flags or directory, probe that too.
  const probeSet = new Set()
  for (const { host, wsPort, wssPort } of candidates) {
    probeSet.add(`ws://${host}:50003`)
    probeSet.add(`wss://${host}:50004`)
    if (wsPort  && wsPort  !== 50003) probeSet.add(`ws://${host}:${wsPort}`)
    if (wssPort && wssPort !== 50004) probeSet.add(`wss://${host}:${wssPort}`)
  }
  const probes = [...probeSet]

  // Step 3: probe in parallel
  const total = probes.length
  let done = 0

  process.stdout.write(`  Probing ${total} endpoints`)

  const results = await pMap(probes, async url => {
    const result = await probeWS(url)
    done++
    if (done % 10 === 0 || done === total) {
      process.stdout.write(`\r  Probing ${total} endpoints — ${done}/${total} done`)
    }
    return result
  }, CONCURRENCY)

  console.log('\n')

  // Step 4: report
  const found = results.filter(Boolean)

  if (found.length === 0) {
    console.log('  ❌  No WebSocket-capable Electrum nodes found.')
    console.log('      Try increasing --timeout or adding seed servers as positional args.\n')
    process.exit(1)
  }

  console.log(`  ✅  ${found.length} WebSocket-capable Electrum node(s) found:\n`)
  for (const url of found) {
    console.log(`      ${url}`)
  }
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
