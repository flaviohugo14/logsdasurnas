import type { ReactNode } from 'react'

export const REPO = 'https://github.com/flaviohugo14/logsdasurnas'

const GITHUB = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
)

const REDES: { nome: string; url: string; icone: ReactNode }[] = [
  { nome: 'GitHub', url: REPO, icone: GITHUB },
  {
    nome: 'Instagram',
    url: 'https://www.instagram.com/flaviopangracio',
    icone: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" /></svg>
    ),
  },
  {
    nome: 'LinkedIn',
    url: 'https://www.linkedin.com/in/flaviopangracio/',
    icone: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1V21h-4v-5.1c0-1.22-.02-2.79-1.7-2.79-1.7 0-1.96 1.33-1.96 2.7V21h-4z" /></svg>
    ),
  },
]

/** Botão do GitHub no topo, ao lado do tema. */
export function BotaoGitHub() {
  return (
    <a className="icone-btn" href={REPO} target="_blank" rel="noopener" aria-label="Código no GitHub" title="Código no GitHub">
      {GITHUB}
    </a>
  )
}

/** Botões com rótulo para o rodapé. */
export function Redes() {
  return (
    <ul className="redes" aria-label="Links">
      {REDES.map(r => (
        <li key={r.nome}>
          <a className="chip chip-icone" href={r.url} target="_blank" rel="noopener">{r.icone}<span>{r.nome}</span></a>
        </li>
      ))}
    </ul>
  )
}
