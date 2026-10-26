import { UFS, num, pct, titulo, type Resumo } from '../dados'

export function PorUF({ resumo, uf, onUF }: { resumo: Resumo; uf: string; onUF: (uf: string) => void }) {
  const linhas = Object.keys(UFS).map(sigla => ({ sigla, r: resumo.ufs[sigla] }))
  linhas.sort((a, b) => {
    if (!a.r || !b.r) return a.r ? -1 : b.r ? 1 : a.sigla.localeCompare(b.sigla)
    return b.r.urnas_pos17 / b.r.urnas - a.r.urnas_pos17 / a.r.urnas
  })
  const max = Math.max(...linhas.map(l => (l.r ? l.r.urnas_pos17 / l.r.urnas : 0)), 0.0001)
  return (
    <div className="cartao">
      <div className="cartao-cab">
        <h3>Urnas com voto depois das 17h</h3>
        <p className="sub">Parcela das urnas de cada estado. Clique para filtrar.</p>
      </div>
      <ul className="uf-lista">
        {linhas.map(({ sigla, r }) => (
          <li key={sigla} className={r ? '' : 'pendente'}>
            <button
              aria-pressed={uf === sigla}
              disabled={!r}
              title={r ? `${UFS[sigla]}: ${num(r.urnas_pos17)} de ${num(r.urnas)} urnas · ${num(r.votos_pos17)} votos após 17h` : `${UFS[sigla]}: aguardando dados`}
              onClick={() => onUF(uf === sigla ? '' : sigla)}
            >
              <span className="sigla">{sigla}</span>
              <span className="trilho"><i style={{ width: r ? `${(r.urnas_pos17 / r.urnas / max) * 100}%` : 0 }} /></span>
              <span className="valor num">{r ? pct(r.urnas_pos17, r.urnas) : 'aguardando'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Municipios({ resumo, uf }: { resumo: Resumo; uf: string }) {
  const lista = resumo.municipios.filter(m => !uf || m[0] === uf).slice(0, 12)
  const max = lista[0]?.[5] ?? 1
  return (
    <div className="cartao">
      <div className="cartao-cab">
        <h3>Municípios com mais votos depois das 17h</h3>
        <p className="sub">{uf ? UFS[uf] : 'Todos os estados processados'}</p>
      </div>
      <table className="tabela">
        <thead>
          <tr><th>Município</th><th className="bar" aria-hidden="true"></th><th className="d">Votos</th><th className="d">Urnas</th></tr>
        </thead>
        <tbody>
          {lista.map(([sigla, nome, urnas, urnasPos, , votosPos]) => (
            <tr key={sigla + nome}>
              <td className="muni">{titulo(nome)}<small>{UFS[sigla]}</small></td>
              <td className="bar"><span style={{ width: `${(votosPos / max) * 100}%` }} /></td>
              <td className="d num"><b>{num(votosPos)}</b></td>
              <td className="d num" title={`${num(urnasPos)} de ${num(urnas)} urnas`}>{pct(urnasPos, urnas, 0)}</td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={4} className="sub">Nenhum município com votos após 17h.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
