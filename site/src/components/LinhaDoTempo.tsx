import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import { horaFaixa, num, rotuloIntervalo, type Intervalo } from '../dados'

const ALT = 64
const POLEGAR = 18 // largura da alça do slider; o gráfico recua metade dela de cada lado para alinhar

type Props = {
  valores: number[]
  intervalo: Intervalo
  onIntervalo: Dispatch<SetStateAction<Intervalo>>
}

/** Mini-histograma com seleção de intervalo (arrastando no gráfico ou pelas alças), ligado ao mapa. */
export function LinhaDoTempo({ valores, intervalo, onIntervalo }: Props) {
  const n = valores.length
  const [a, b] = intervalo
  const cheio = a === 0 && b === n
  const caixa = useRef<HTMLDivElement>(null)
  const [L, setL] = useState(600)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setL(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(caixa.current!)
    return () => ro.disconnect()
  }, [])
  const P = L - POLEGAR
  const x = (i: number) => POLEGAR / 2 + (i / n) * P
  const w = P / n

  // As primeiras faixas (a fila logo após 17h) são muito maiores que as demais; a escala segue
  // a cauda a partir de 17h10 e as barras cortadas ganham uma marca de quebra.
  const cauda = Math.max(0, ...valores.slice(2))
  const topo = cauda ? cauda * 1.15 : Math.max(1, ...valores)
  const altura = (v: number) => (Math.min(v, topo) / topo) * (ALT - 4)
  const noIntervalo = valores.slice(a, b).reduce((s, v) => s + v, 0)

  // Arrastar no gráfico seleciona um intervalo.
  const inicioArraste = useRef<number | null>(null)
  const faixaEm = (e: PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left - POLEGAR / 2) / P) * n)))
  }
  const aoPressionar = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const i = faixaEm(e)
    inicioArraste.current = i
    setTocando(false)
    onIntervalo([i, i + 1])
  }
  const aoMover = (e: PointerEvent<SVGSVGElement>) => {
    if (inicioArraste.current === null) return
    const i = faixaEm(e), s = inicioArraste.current
    onIntervalo([Math.min(s, i), Math.max(s, i) + 1])
  }
  const aoSoltar = () => { inicioArraste.current = null }

  // Reprodução: desliza a janela atual de 5 em 5 minutos até 20h.
  const [tocando, setTocando] = useState(false)
  const atual = useRef(intervalo)
  useEffect(() => { atual.current = intervalo }, [intervalo])
  useEffect(() => {
    if (!tocando) return
    const t = setInterval(() => {
      const [ia, ib] = atual.current
      if (ib >= n) setTocando(false)
      else onIntervalo([ia + 1, ib + 1])
    }, 650)
    return () => clearInterval(t)
  }, [tocando, n, onIntervalo])
  const tocar = () => {
    if (tocando) { setTocando(false); return }
    if (cheio || b >= n) onIntervalo([0, cheio ? 6 : b - a])
    setTocando(true)
  }

  const mudarInicio = (v: number) => { setTocando(false); onIntervalo(([, fim]) => [Math.min(v, fim - 1), fim]) }
  const mudarFim = (v: number) => { setTocando(false); onIntervalo(([ini]) => [ini, Math.max(v, ini + 1)]) }

  return (
    <div className="tempo">
      <div className="tempo-topo">
        <div className="tempo-info" aria-live="polite">
          <span className="tempo-rot">Horário dos votos</span>
          <span className="tempo-valor">
            <b>{cheio ? 'Todo o período' : capitalizar(rotuloIntervalo(intervalo, n))}</b>
            <span className="num"> · {num(noIntervalo)} {noIntervalo === 1 ? 'voto' : 'votos'}</span>
          </span>
        </div>
        <div className="tempo-acoes">
          <button className="chip chip-icone" onClick={tocar} aria-pressed={tocando} aria-label={tocando ? 'Pausar' : 'Reproduzir ao longo do tempo'}>
            {tocando ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3" height="10" rx="1" /><rect x="8" y="2" width="3" height="10" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M4 2.5v9a.6.6 0 0 0 .9.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5a.6.6 0 0 0-.9.5z" /></svg>
            )}
            <span>{tocando ? 'Pausar' : 'Reproduzir'}</span>
          </button>
          <button className="chip" onClick={() => { setTocando(false); onIntervalo([0, n]) }} disabled={cheio}>Todo o período</button>
        </div>
      </div>

      <div ref={caixa} className="tempo-grafico">
        <svg width={L} height={ALT} onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar} role="img" aria-label="Votos após 17h por faixa de 5 minutos; arraste para escolher um intervalo">
          {!cheio && <rect className="tempo-faixa" x={x(a)} y={0} width={x(b) - x(a)} height={ALT} rx={6} />}
          {valores.map((v, i) => {
            if (!v) return null
            const h = Math.max(2, altura(v))
            return (
              <g key={i}>
                <rect className={`tempo-barra${i >= a && i < b ? '' : ' fora'}`} x={x(i) + 1} y={ALT - h} width={Math.max(1, w - 2)} height={h} rx={Math.min(2, w / 4)} />
                {v > topo && <line className="tempo-quebra" x1={x(i)} x2={x(i + 1)} y1={8} y2={4} />}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="tempo-slider" style={{ ['--polegar' as string]: `${POLEGAR}px` }}>
        <div className="trilho" />
        <div className="sel" style={{ left: x(a), width: x(b) - x(a) }} />
        <input type="range" min={0} max={n} step={1} value={a} onChange={e => mudarInicio(+e.target.value)}
          aria-label="Início do intervalo" aria-valuetext={horaFaixa(a)} />
        <input type="range" min={0} max={n} step={1} value={b} onChange={e => mudarFim(+e.target.value)}
          aria-label="Fim do intervalo" aria-valuetext={b >= n ? 'fim' : horaFaixa(b)} />
      </div>

      <div className="tempo-eixo" aria-hidden="true">
        {valores.map((_, i) => i % (L < 520 ? 12 : 6) === 0 && i < n - 1 && (
          <span key={i} style={{ left: x(i) }}>{`${17 + Math.floor(i / 12)}h${i % 12 ? '30' : ''}`}</span>
        ))}
        <span style={{ left: x(n), transform: 'translateX(-100%)' }}>20h+</span>
      </div>
    </div>
  )
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
