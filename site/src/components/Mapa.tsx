import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MLMap, NavigationControl, LngLatBounds, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { FAIXAS, UFS, contar, num, pct, rotuloIntervalo, type Intervalo, type Local } from '../dados'

// O MapLibre 6 roda o processamento de tiles num worker separado; o Vite empacota e informa a URL.
setWorkerUrl(workerUrl)

type Filtro = Parameters<MLMap['setFilter']>[1]

const ESTILO = {
  claro: 'https://tiles.openfreemap.org/styles/positron',
  escuro: 'https://tiles.openfreemap.org/styles/dark',
}
const BRASIL = new LngLatBounds([-74, -33.8], [-34.7, 5.3])

const cssVar = (nome: string) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
/** Raio em px por votos no intervalo; usado no mapa (zoom ~5) e na legenda. */
const raioBase = (v: number) => 3 + 2.4 * Math.sqrt(v)

/** Só entram os locais com voto no intervalo; `v` é a contagem dentro dele. */
function geojson(locais: Local[], intervalo: Intervalo) {
  const features = []
  for (const l of locais) {
    const v = contar(l.faixas, intervalo)
    if (!v) continue
    features.push({
      type: 'Feature' as const,
      id: l.id,
      geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
      properties: { id: l.id, uf: l.uf, v },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

function adicionarCamadas(mapa: MLMap, dados: ReturnType<typeof geojson>) {
  const cor = (i: number) => cssVar(`--seq-${i}`)
  mapa.addSource('locais', { type: 'geojson', data: dados })
  const raio = (fator: number) => ['*', fator, ['+', 3, ['*', 2.4, ['sqrt', ['get', 'v']]]]]
  mapa.addLayer({
    id: 'locais',
    type: 'circle',
    source: 'locais',
    layout: { 'circle-sort-key': ['get', 'v'] },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, raio(0.7), 6, raio(1), 12, raio(1.8)] as never,
      'circle-color': ['step', ['get', 'v'], cor(1), 2, cor(2), 5, cor(3), 10, cor(4), 20, cor(5)],
      'circle-opacity': 0.92,
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'hover'], false], cssVar('--text'), cssVar('--surface')],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 1],
    },
  })
  mapa.addLayer({
    id: 'selecionado',
    type: 'circle',
    source: 'locais',
    filter: ['==', ['get', 'id'], -1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, raio(0.7), 6, raio(1), 12, raio(1.8)] as never,
      'circle-color': 'transparent',
      'circle-stroke-color': cssVar('--text'),
      'circle-stroke-width': 2.5,
    },
  })
}

type Props = {
  locais: Local[]
  uf: string
  busca: string
  intervalo: Intervalo
  /** total de faixas do histograma, para o rótulo do intervalo */
  faixas: number
  escuro: boolean
  selecionado: Local | null
  onSelecionar: (l: Local | null) => void
}

export function Mapa({ locais, uf, busca, intervalo, faixas, escuro, selecionado, onSelecionar }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<MLMap | null>(null)
  const [pronto, setPronto] = useState(0) // muda a cada estilo carregado
  const [dica, setDica] = useState<{ x: number; y: number; local: Local } | null>(null)
  const porId = useMemo(() => new Map(locais.map(l => [l.id, l])), [locais])
  const callbacks = useRef({ onSelecionar, porId })
  callbacks.current = { onSelecionar, porId }

  const visiveis = useMemo(() => locais.filter(l => (!uf || l.uf === uf) && (!busca || l.busca.includes(busca))), [locais, uf, busca])

  // Cria o mapa uma vez.
  useEffect(() => {
    const mapa = new MLMap({
      container: caixa.current!,
      style: escuro ? ESTILO.escuro : ESTILO.claro,
      bounds: BRASIL,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapa.touchZoomRotate.disableRotation()
    mapa.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapaRef.current = mapa

    let hover: number | null = null
    const limparHover = () => {
      if (hover !== null && mapa.getSource('locais')) mapa.setFeatureState({ source: 'locais', id: hover }, { hover: false })
      hover = null
    }
    mapa.on('mousemove', 'locais', (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const id = f.id as number
      if (id !== hover) {
        limparHover()
        hover = id
        mapa.setFeatureState({ source: 'locais', id }, { hover: true })
      }
      mapa.getCanvas().style.cursor = 'pointer'
      const local = callbacks.current.porId.get(id)
      if (local) setDica({ x: e.point.x, y: e.point.y, local })
    })
    mapa.on('mouseleave', 'locais', () => {
      limparHover()
      mapa.getCanvas().style.cursor = ''
      setDica(null)
    })
    mapa.on('click', e => {
      const f = mapa.queryRenderedFeatures(e.point, { layers: ['locais'] })[0]
      callbacks.current.onSelecionar(f ? callbacks.current.porId.get(f.id as number) ?? null : null)
    })
    mapa.on('style.load', () => setPronto(n => n + 1))
    // O contêiner pode mudar de tamanho enquanto o estilo carrega (Suspense, fontes); reenquadra no fim.
    mapa.once('load', () => mapa.fitBounds(BRASIL, { padding: 20, duration: 0 }))
    return () => {
      mapa.remove()
      mapaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Troca o mapa-base quando o tema muda; as camadas são recriadas no style.load.
  const temaAtual = useRef(escuro)
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || temaAtual.current === escuro) return
    temaAtual.current = escuro
    mapa.setStyle(escuro ? ESTILO.escuro : ESTILO.claro)
  }, [escuro])

  const dadosMapa = useMemo(() => geojson(locais, intervalo), [locais, intervalo])
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !pronto) return
    if (!mapa.getSource('locais')) adicionarCamadas(mapa, dadosMapa)
    else (mapa.getSource('locais') as GeoJSONSource).setData(dadosMapa)
  }, [pronto, dadosMapa])

  // Filtros
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !pronto || !mapa.getLayer('locais')) return
    const filtro: Filtro = busca
      ? ['in', ['get', 'id'], ['literal', visiveis.map(l => l.id)]]
      : uf ? ['==', ['get', 'uf'], uf] : null
    mapa.setFilter('locais', filtro)
  }, [pronto, uf, busca, visiveis])

  // Enquadra a seleção de UF/busca
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    if (!uf && !busca) {
      mapa.fitBounds(BRASIL, { padding: 20, duration: 700 })
      return
    }
    if (!visiveis.length) return
    const b = new LngLatBounds()
    for (const l of visiveis) b.extend([l.lon, l.lat])
    mapa.fitBounds(b, { padding: 60, maxZoom: 13, duration: 700 })
    // só reenquadra quando o filtro muda, não a cada recálculo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, busca])

  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !pronto || !mapa.getLayer('selecionado')) return
    mapa.setFilter('selecionado', ['==', ['get', 'id'], selecionado?.id ?? -1])
    if (selecionado) mapa.easeTo({ center: [selecionado.lon, selecionado.lat], zoom: Math.max(mapa.getZoom(), 12), duration: 600 })
  }, [pronto, selecionado])

  const cheio = intervalo[0] === 0 && intervalo[1] >= faixas
  const quando = cheio ? 'após 17h' : rotuloIntervalo(intervalo, faixas)
  const secoes = (selecionado?.secoes ?? [])
    .map(([s, , f]) => [s, contar(f, intervalo)] as const)
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
  const noLocal = selecionado ? contar(selecionado.faixas, intervalo) : 0
  const totalSec = secoes[0]?.[1] ?? 0

  return (
    <div className="mapa-caixa">
      <div ref={caixa} aria-label={`Mapa dos locais de votação com votos ${quando}`} role="region" />
      <div className="mapa-legenda" aria-label="Legenda">
        <div className="t">Votos {quando} por local</div>
        <div className="itens">
          {FAIXAS.map(([min, , rotulo], i) => {
            const r = raioBase(min)
            return (
              <div className="item" key={rotulo}>
                <i style={{ width: r * 2, height: r * 2, background: `var(--seq-${i + 1})` }} />
                <span className="num">{rotulo}</span>
              </div>
            )
          })}
        </div>
      </div>
      {dica && !selecionado && (
        <div className="dica" style={{ left: dica.x, top: dica.y }}>
          <div className="t">{dica.local.local}</div>
          <div className="s">{dica.local.municipio} – {dica.local.uf} · zona {dica.local.zona}</div>
          <div className="v num">{num(contar(dica.local.faixas, intervalo))} <small>votos {quando}{cheio && <> · último às {dica.local.ultimo}</>}</small></div>
        </div>
      )}
      {selecionado && (
        <aside className="painel" aria-label="Detalhes do local">
          <header>
            <div className="uf">{UFS[selecionado.uf]} · Zona {selecionado.zona}</div>
            <h3>{selecionado.local}</h3>
            <p>{[selecionado.bairro, selecionado.municipio].filter(Boolean).join(' · ')}</p>
            <button className="icone-btn" onClick={() => onSelecionar(null)} aria-label="Fechar">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8" /></svg>
            </button>
          </header>
          <div className="mini">
            <div><b className="num">{num(noLocal)}</b><span>votos {quando}</span></div>
            <div><b className="num">{selecionado.ultimo.slice(0, 5)}</b><span>último voto</span></div>
            <div><b className="num">{pct(noLocal, selecionado.votos)}</b><span>dos votos do local</span></div>
          </div>
          <div className="lista">
            <h4>{secoes.length ? `${secoes.length} de ${selecionado.urnas} seções com voto ${quando}` : `Nenhum voto ${quando} neste local`}</h4>
            {secoes.map(([s, n]) => (
              <div className="linha-secao" key={s}>
                <span>Seção <span className="num">{s}</span></span>
                <span className="barra"><i style={{ width: `${(n / totalSec) * 100}%` }} /></span>
                <span className="n num">{n}</span>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
