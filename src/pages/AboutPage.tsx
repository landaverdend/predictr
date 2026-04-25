import { useLang } from '../context/LangContext'

const content = {
  en: {
    title: 'about predictr',
    subtitle: 'non-custodial prediction markets on Bitcoin and Nostr',

    sections: [
      {
        heading: 'What is predictr?',
        body: `predictr is a peer-to-peer prediction market. No server, no custody, no accounts. Two parties bet on a binary outcome (YES or NO), lock Bitcoin into an on-chain script, and an oracle settles it. Your money never touches a third party.`,
      },
      {
        heading: 'How it works',
        body: `An oracle opens a market by publishing two SHA-256 hashes, one for YES and one for NO. A maker picks a side and posts an offer over Nostr. A taker accepts it, and together they fund a Taproot contract on-chain with both stakes locked in.\n\nWhen the event resolves, the oracle reveals the preimage for the winning side. The winner presents that preimage along with their signature to claim the full pot.`,
      },
      {
        heading: 'The CLTV refund',
        body: `Every contract has a time-locked exit. Once the resolution block passes and a safety delay clears, either party can pull their own funds out without help from anyone. No oracle signature, no counterparty cooperation needed.\n\nWorst case: you wait. Your sats cannot be permanently stuck.`,
      },
      {
        heading: '⚠ Do not trust the oracle',
        body: `The oracle cannot steal funds. The script only pays out to whoever holds the correct preimage, and the oracle commits to both hashes upfront before any money moves.\n\nWhat the oracle can do is go silent. If they never publish a preimage, both parties sit and wait until the CLTV refund opens. Only bet in markets run by oracles you actually trust, or run your own.`,
        warning: true,
      },
      {
        heading: 'Non-custodial',
        body: `Keys are generated in your browser and encrypted locally with AES-256-GCM behind a PIN. They never leave your device. Nothing here has custody of anything.`,
      },
      {
        heading: 'No backend',
        body: `Contract state, wallet keys, and messages all live in IndexedDB in your browser. Markets are posted and found over Nostr. Transactions go out through an Electrum server you configure. There is no predictr server.`,
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
        body: `predictr es un mercado de predicción entre pares. Sin servidor, sin custodia, sin cuentas. Dos partes apuestan sobre un resultado binario (SÍ o NO), bloquean Bitcoin en un script on-chain y un oráculo lo resuelve. Tu dinero nunca pasa por un tercero.`,
      },
      {
        heading: 'Cómo funciona',
        body: `Un oráculo abre un mercado publicando dos hashes SHA-256, uno para SÍ y otro para NO. Un creador elige un lado y publica una oferta en Nostr. Un tomador la acepta y juntos financian un contrato Taproot on-chain con ambas apuestas bloqueadas.\n\nCuando el evento se resuelve, el oráculo revela la preimagen del lado ganador. El ganador presenta esa preimagen junto con su firma para reclamar el bote completo.`,
      },
      {
        heading: 'El reembolso CLTV',
        body: `Cada contrato tiene una salida con bloqueo de tiempo. Una vez que pasa el bloque de resolución y un retraso de seguridad, cualquiera de las partes puede retirar sus propios fondos sin ayuda de nadie. Sin firma del oráculo, sin cooperación de la contraparte.\n\nEn el peor caso: esperas. Tus sats no pueden quedarse bloqueados para siempre.`,
      },
      {
        heading: '⚠ No confíes en el oráculo',
        body: `El oráculo no puede robar fondos. El script solo paga a quien tenga la preimagen correcta, y el oráculo se compromete con ambos hashes desde el principio antes de que se mueva dinero.\n\nLo que sí puede hacer el oráculo es desaparecer. Si nunca publica una preimagen, ambas partes esperan hasta que se abra el reembolso CLTV. Solo apuesta en mercados de oráculos en los que realmente confíes, o corre el tuyo propio.`,
        warning: true,
      },
      {
        heading: 'No custodial',
        body: `Las claves se generan en tu navegador y se cifran localmente con AES-256-GCM detrás de un PIN. Nunca salen de tu dispositivo. Nada aquí tiene custodia de nada.`,
      },
      {
        heading: 'Sin backend',
        body: `El estado de los contratos, las claves de billetera y los mensajes viven en IndexedDB en tu navegador. Los mercados se publican y encuentran en Nostr. Las transacciones salen a través de un servidor Electrum que tú configuras. No hay ningún servidor de predictr.`,
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
        <p className="text-ink/25 text-xs mt-2">
          inspired by{' '}
          <a
            href="https://github.com/supertestnet/aggeus_market"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-ink/50 transition-colors"
          >
            aggeus_market
          </a>
          {' '}by supertestnet
        </p>
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

      {/* GitHub link */}
      <a
        href="https://github.com/landaverdend/predictr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink/30 hover:text-ink/70 transition-colors w-fit pb-2"
        aria-label="predictr on GitHub"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
        </svg>
      </a>
    </main>
  )
}
