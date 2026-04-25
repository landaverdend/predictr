import { useLang } from '../context/LangContext'

const content = {
  en: {
    title: 'about predictr',
    subtitle: 'a non-custodial prediction market on Bitcoin and Nostr',

    sections: [
      {
        heading: 'What is predictr?',
        body: `predictr is a peer-to-peer prediction market with no server, no backend, and no custody. Two parties agree on a binary question (YES or NO), lock Bitcoin into a script on-chain, and let an oracle settle the outcome. No company holds your money. No account required. Everything runs in your browser.`,
      },
      {
        heading: 'How it works',
        body: `An oracle publishes a market by committing to two SHA-256 hashes — one representing YES, one representing NO. A maker picks a side and posts an offer over Nostr. A taker accepts, and together they fund a Taproot contract locking both stakes on-chain.\n\nWhen the event resolves, the oracle reveals the preimage for the correct outcome. The winner uses that preimage plus their signature to claim the full pot. The loser's path in the script becomes permanently unspendable.`,
      },
      {
        heading: 'The CLTV refund — you are never locked out',
        body: `Every contract includes a time-locked escape path. After the resolution blockheight passes plus a safety delay, either party can reclaim their own funds unilaterally — no oracle, no counterparty, no cooperation required.\n\nThis means the worst case is waiting. Your sats cannot be permanently trapped.`,
      },
      {
        heading: '⚠ The oracle is a trusted third party',
        body: `The oracle cannot steal your funds — the script only allows spending with the correct preimage, which the oracle must commit to before taking any bets.\n\nHowever, the oracle can grief both parties by refusing to reveal a preimage, delaying settlement until the CLTV refund path opens. Choose oracles you trust, or run your own. Do not participate in markets run by anonymous or unknown oracles.`,
        warning: true,
      },
      {
        heading: 'Non-custodial',
        body: `Your private keys are generated locally in your browser and encrypted at rest with AES-256-GCM using a PIN you choose. They never leave your device. No server, relay, or third party ever has access to them.`,
      },
      {
        heading: 'No backend',
        body: `All contract state, wallet keys, and message history are stored locally in IndexedDB — the database built into your browser. Markets are published and discovered over the Nostr relay network. Bitcoin transactions are broadcast directly to the network via an Electrum server of your choice. There is no predictr server.`,
      },
    ],

    built: 'Built with',
    builtItems: ['Bitcoin Taproot', 'Nostr (NIP-44 encrypted DMs)', '@scure/btc-signer', 'Dexie (IndexedDB)', 'React + Vite'],
  },

  es: {
    title: 'acerca de predictr',
    subtitle: 'un mercado de predicción no custodial sobre Bitcoin y Nostr',

    sections: [
      {
        heading: '¿Qué es predictr?',
        body: `predictr es un mercado de predicción entre pares sin servidor, sin backend y sin custodia. Dos partes acuerdan una pregunta binaria (SÍ o NO), bloquean Bitcoin en un script on-chain y dejan que un oráculo resuelva el resultado. Ninguna empresa guarda tu dinero. No se requiere cuenta. Todo funciona en tu navegador.`,
      },
      {
        heading: 'Cómo funciona',
        body: `Un oráculo publica un mercado comprometiéndose con dos hashes SHA-256 — uno que representa SÍ y otro NO. Un creador elige un lado y publica una oferta en Nostr. Un tomador la acepta, y juntos financian un contrato Taproot bloqueando ambas apuestas en la cadena.\n\nCuando el evento se resuelve, el oráculo revela la preimagen del resultado correcto. El ganador usa esa preimagen junto con su firma para reclamar el bote completo. El camino del perdedor en el script queda permanentemente inutilizable.`,
      },
      {
        heading: 'El reembolso CLTV — nunca quedas bloqueado',
        body: `Cada contrato incluye un camino de escape con bloqueo de tiempo. Después de que pasa el bloque de resolución más un retraso de seguridad, cualquiera de las partes puede recuperar sus propios fondos de forma unilateral — sin oráculo, sin contraparte, sin necesidad de cooperación.\n\nEsto significa que el peor caso es esperar. Tus sats no pueden quedar atrapados permanentemente.`,
      },
      {
        heading: '⚠ El oráculo es un tercero de confianza',
        body: `El oráculo no puede robar tus fondos — el script solo permite gastar con la preimagen correcta, que el oráculo debe comprometerse antes de aceptar apuestas.\n\nSin embargo, el oráculo puede perjudicar a ambas partes negándose a revelar una preimagen, retrasando el acuerdo hasta que se abra el camino de reembolso CLTV. Elige oráculos en los que confíes o gestiona el tuyo propio. No participes en mercados administrados por oráculos anónimos o desconocidos.`,
        warning: true,
      },
      {
        heading: 'No custodial',
        body: `Tus claves privadas se generan localmente en tu navegador y se cifran en reposo con AES-256-GCM usando un PIN que tú eliges. Nunca salen de tu dispositivo. Ningún servidor, relay ni tercero tiene acceso a ellas.`,
      },
      {
        heading: 'Sin backend',
        body: `Todo el estado del contrato, las claves de billetera y el historial de mensajes se almacenan localmente en IndexedDB — la base de datos integrada en tu navegador. Los mercados se publican y descubren a través de la red de relays de Nostr. Las transacciones de Bitcoin se transmiten directamente a la red a través de un servidor Electrum de tu elección. No existe ningún servidor de predictr.`,
      },
    ],

    built: 'Construido con',
    builtItems: ['Bitcoin Taproot', 'Nostr (DMs cifrados NIP-44)', '@scure/btc-signer', 'Dexie (IndexedDB)', 'React + Vite'],
  },
}

export default function AboutPage() {
  const { lang } = useLang()
  const c = content[lang]

  return (
    <main className="flex-1 px-4 sm:px-6 py-10 max-w-2xl mx-auto w-full space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-1">{c.title}</h1>
        <p className="text-ink/40 text-sm">{c.subtitle}</p>
      </div>

      <div className="space-y-8">
        {c.sections.map((s, i) => (
          <section
            key={i}
            className={`rounded-xl border p-5 space-y-2.5 ${
              s.warning
                ? 'border-caution/30 bg-caution/5'
                : 'border-ink/10 bg-ink/[0.02]'
            }`}
          >
            <h2 className={`text-sm font-semibold ${s.warning ? 'text-caution' : 'text-ink/90'}`}>
              {s.heading}
            </h2>
            {s.body.split('\n\n').map((para, j) => (
              <p key={j} className="text-sm text-ink/60 leading-relaxed">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>

      {/* Stack */}
      <section className="border border-ink/10 rounded-xl p-5">
        <h2 className="text-xs text-ink/40 uppercase tracking-wider font-medium mb-3">{c.built}</h2>
        <ul className="space-y-1.5">
          {c.builtItems.map(item => (
            <li key={item} className="flex items-center gap-2 text-sm text-ink/50">
              <span className="w-1 h-1 rounded-full bg-ink/20 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
