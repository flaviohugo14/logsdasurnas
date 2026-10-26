import { useEffect, useMemo, useRef, useState } from 'react'
import { num, pct, rotuloIntervalo, type Intervalo } from '../dados'

const A = 280
const M = { t: 24, r: 8, b: 30, l: 44 }

const rotuloFaixa = (i: number, total: number) => {
  if (i === total - 1) return '20h ou depois'
  const ini = 17 * 60 + i * 5
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${hh(ini)}–${hh(ini + 5)}`
}

function escala(max: number) {
  const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000]
    .find(p => max / p <= 4) ?? 100000
  const topo = Math.max(passo, Math.ceil(max / passo) * passo)
  const marcas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo)
  return { topo, marcas }
}

/** `intervalo`: faixas selecionadas na linha do tempo do mapa (null = todo o período). */
export function Histograma({ valores, titulo, intervalo }: { valores: number[]; titulo: string; intervalo: Intervalo | null }) {
  const [ampliar, setAmpliar] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  // Desenha na largura real do cartão para o texto não escalar com o SVG.
  const caixa = useRef<HTMLDivElement>(null)
  const [L, setL] = useState(760)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setL(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(caixa.current!)
    return () => ro.disconnect()
  }, [])
  const total = valores.reduce((a, b) => a + b, 0)
  // Ao ampliar, a escala ignora a primeira faixa (17:00–17:05), que concentra a maior parte dos votos.
  const maxCauda = Math.max(1, ...valores.slice(1))
  const { topo, marcas } = useMemo(() => escala(ampliar ? maxCauda : Math.max(1, ...valores)), [ampliar, maxCauda, valores])
  const n = valores.length
  const w = (L - M.l - M.r) / n
  const y = (v: number) => M.t + (A - M.t - M.b) * (1 - Math.min(v, topo) / topo)
  const ultimaComVoto = valores.reduce((u, v, i) => (v ? i : u), 0)

  return (
    <div className="cartao">
      <div className="grafico-topo">
        <div className="destaque">
          {total ? (
            <><b className="num">{pct(valores[0], total, 0)}</b> dos votos após 17h em {titulo} entraram nos primeiros 5 minutos.</>
          ) : <>Nenhum voto após 17h em {titulo}.</>}
          {intervalo && <> <a className="ver-mapa" href="#onde">No mapa: votos {rotuloIntervalo(intervalo, n)} ↑</a></>}
        </div>
        <button className="chip" aria-pressed={ampliar} onClick={() => setAmpliar(a => !a)}>
          Ampliar depois das 17h05
        </button>
      </div>
      <div className="grafico" ref={caixa} onMouseLeave={() => setHover(null)}>
        <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Votos após 17h em faixas de 5 minutos, ${titulo}`}>
          {intervalo && (
            <rect className="selecao" x={M.l + intervalo[0] * w} y={M.t - 6} width={(intervalo[1] - intervalo[0]) * w} height={A - M.t - M.b + 6} rx={6} />
          )}
          <g className="grade">
            {marcas.map(m => <line key={m} x1={M.l} x2={L - M.r} y1={y(m)} y2={y(m)} />)}
          </g>
          <g className="eixo">
            {marcas.map(m => <text key={m} x={M.l - 8} y={y(m) + 4} textAnchor="end">{num(m)}</text>)}
            {valores.map((_, i) => i % (L < 520 ? 12 : 6) === 0 && i < n - 1 && (
              <text key={i} x={M.l + i * w} y={A - 8} textAnchor="start">
                {`${17 + Math.floor(i / 12)}h${i % 12 ? '30' : ''}`}
              </text>
            ))}
            <text x={M.l + n * w} y={A - 8} textAnchor="end">20h+</text>
          </g>
          {valores.map((v, i) => {
            if (!v) return null
            const yy = y(v)
            const cortada = v > topo
            return (
              <g key={i}>
                <path
                  className={`barra${(hover !== null && hover !== i) || (intervalo && (i < intervalo[0] || i >= intervalo[1])) ? ' apagada' : ''}`}
                  d={barra(M.l + i * w + 1, yy, Math.max(w - 2, 1), A - M.b - yy)}
                />
                {cortada && <line className="quebra" x1={M.l + i * w - 2} x2={M.l + (i + 1) * w + 2} y1={M.t + 10} y2={M.t + 4} />}
              </g>
            )
          })}
          {valores[0] > 0 && (
            <text className="rot num" x={M.l + 1} y={Math.max(y(valores[0]), M.t) - 8}>
              {num(valores[0])} <tspan className="rot-sec">entre 17:00 e 17:05</tspan>
            </text>
          )}
          {ultimaComVoto > 0 && (
            <text className="rot-sec" x={M.l + (ultimaComVoto + 1) * w + 6} y={y(valores[ultimaComVoto]) - 6}>
              último às {rotuloFaixa(ultimaComVoto, n).split('–')[1] ?? '20h+'}
            </text>
          )}
          {valores.map((_, i) => (
            <rect key={i} className="alvo" x={M.l + i * w} y={M.t} width={w} height={A - M.t - M.b}
              onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="tooltip" style={{ left: `${((M.l + (hover + 0.5) * w) / L) * 100}%`, top: `${(y(valores[hover]) / A) * 100}%` }}>
            <div className="num"><b>{num(valores[hover])}</b> votos</div>
            <div className="s">{rotuloFaixa(hover, n)} · {pct(valores[hover], total)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Barra com cantos arredondados só no topo (4px), ancorada na base. */
function barra(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}
