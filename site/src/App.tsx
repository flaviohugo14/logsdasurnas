import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { carregarDados, normalizar, num, pct, rotuloIntervalo, titulo, UFS, type Intervalo, type Local, type Resumo } from './dados'
import { Histograma } from './components/Histograma'
import { LinhaDoTempo } from './components/LinhaDoTempo'
import { Municipios, PorUF } from './components/Rankings'

const REPO = 'https://github.com/flaviohugo14/logsdasurnas'

// O MapLibre é a maior dependência; carrega em paralelo com os dados, sem travar a abertura.
const Mapa = lazy(() => import('./components/Mapa').then(m => ({ default: m.Mapa })))

type Tema = 'claro' | 'escuro' | null

function useTema() {
  const [tema, setTema] = useState<Tema>(() => {
    try { return (localStorage.getItem('tema') as Tema) ?? null } catch { return null }
  })
  const [sistemaEscuro, setSistemaEscuro] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const f = () => setSistemaEscuro(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  const escuro = tema ? tema === 'escuro' : sistemaEscuro
  useEffect(() => {
    if (tema) document.documentElement.dataset.theme = tema === 'escuro' ? 'dark' : 'light'
    else delete document.documentElement.dataset.theme
    try { if (tema) localStorage.setItem('tema', tema); else localStorage.removeItem('tema') } catch { /* sem storage */ }
  }, [tema])
  return { escuro, alternar: () => setTema(escuro ? 'claro' : 'escuro') }
}

/** Número que sobe até o valor final quando aparece. */
function Contador({ valor, formato = num }: { valor: number; formato?: (n: number) => string }) {
  const [atual, setAtual] = useState(0)
  const [reduzir] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (reduzir) return
    let raf = 0
    const ini = performance.now()
    const passo = (t: number) => {
      const p = Math.min(1, (t - ini) / 1100)
      setAtual(valor * (1 - Math.pow(1 - p, 4)))
      if (p < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor, reduzir])
  return <>{formato(reduzir ? valor : Math.round(atual))}</>
}

export default function App() {
  const { escuro, alternar } = useTema()
  const [dados, setDados] = useState<{ resumo: Resumo; locais: Local[] } | null>(null)
  const [erro, setErro] = useState(false)
  const [uf, setUF] = useState('')
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState<Local | null>(null)
  // Faixas de 5 min selecionadas na linha do tempo; [0, total de faixas] = todo o período.
  const [intervalo, setIntervalo] = useState<Intervalo>([0, 0])
  // O mapa recalcula ~dezenas de milhares de pontos; o slider não espera por ele.
  const intervaloMapa = useDeferredValue(intervalo)

  useEffect(() => {
    carregarDados().then(d => { setDados(d); setIntervalo([0, d.resumo.histograma.length]) }, () => setErro(true))
  }, [])

  const busca = useMemo(() => normalizar(termo.trim()), [termo])
  const ufsComDados = useMemo(() => Object.keys(dados?.resumo.ufs ?? {}).sort(), [dados])

  if (erro) return <div className="carregando">Não deu para carregar os dados. Tente recarregar a página.</div>
  if (!dados) return <div className="carregando">Carregando…</div>

  const { resumo, locais } = dados
  const t = resumo.total
  const parcial = ufsComDados.length < 27
  const escolhido = uf ? resumo.ufs[uf] : t
  const hist = uf ? resumo.histograma_uf[uf] ?? resumo.histograma.map(() => 0) : resumo.histograma

  const nFaixas = hist.length
  const cheio = intervalo[0] === 0 && intervalo[1] >= nFaixas
  const noIntervalo = hist.slice(intervalo[0], intervalo[1]).reduce((a, b) => a + b, 0)

  const mudarUF = (novo: string) => { setUF(novo); setSelecionado(null) }

  return (
    <>
      <header className="topo">
        <div className="wrap">
          <a className="marca" href="#">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="var(--text)" />
              <circle cx="16" cy="16" r="9" fill="none" stroke="var(--bg)" strokeWidth="2.4" />
              <path d="M16 10.5V16l4 2.5" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Depois das 17h
          </a>
          <nav aria-label="Seções">
            <a href="#onde">Onde</a>
            <a href="#quando">Quando</a>
            <a href="#estados">Estados</a>
            <a href="#metodo">Como calculamos</a>
          </nav>
          <button className="icone-btn" onClick={alternar} aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}>
            {escuro ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>
            )}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <span className="selo"><span className="ponto" />Eleições 2026 · 2º turno · {resumo.data}</span>
            <h1><em className="num"><Contador valor={t.votos_pos17} /></em> votos depois das 17h</h1>
            <p className="lead">
              A votação fecha às 17h de Brasília, mas quem já está na fila ainda pode votar.
              Lemos o log de {num(t.urnas)} urnas, contamos os votos que entraram depois desse horário
              e marcamos no mapa a escola onde cada um aconteceu.
            </p>
            <div className="stats">
              <div className="stat"><b className="num"><Contador valor={t.urnas_pos17} /></b><span>urnas com ao menos um voto após 17h ({pct(t.urnas_pos17, t.urnas)})</span></div>
              <div className="stat"><b className="num">{pct(t.votos_pos17, t.votos, 2)}</b><span>de todos os {num(t.votos)} votos registrados</span></div>
              <div className="stat"><b className="num">{resumo.ultimo_voto?.hora.slice(0, 5) ?? '—'}</b><span>último voto do país{resumo.ultimo_voto && <>, em {titulo(resumo.ultimo_voto.municipio)} ({resumo.ultimo_voto.uf})</>}</span></div>
              <div className="stat"><b className="num">{ufsComDados.length}<span style={{ display: 'inline', fontSize: '0.55em', color: 'var(--muted)', margin: 0 }}> / 27</span></b><span>{parcial ? `estados processados até agora · atualizado em ${resumo.gerado_em}` : `estados · atualizado em ${resumo.gerado_em}`}</span></div>
            </div>
          </div>
        </section>

        <section className="secao" id="onde">
          <div className="wrap">
            <div className="cab">
              <div>
                <div className="rotulo">Onde</div>
                <h2>Cada círculo é um local de votação</h2>
                <p>Quanto maior e mais escuro o círculo, mais votos entraram ali depois das 17h. Arraste na linha do tempo embaixo do mapa para ver só um horário. Clique num local para ver as seções.</p>
              </div>
              <div className="controles">
                <label className="campo">
                  <span className="sr">UF</span>
                  <select value={uf} onChange={e => mudarUF(e.target.value)} aria-label="Filtrar por estado">
                    <option value="">Todo o Brasil</option>
                    {ufsComDados.map(s => <option key={s} value={s}>{UFS[s]}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input type="search" value={termo} onChange={e => { setTermo(e.target.value); setSelecionado(null) }} placeholder="Buscar município ou escola" aria-label="Buscar local" />
                </label>
              </div>
            </div>
            <div className="cartao mapa-cartao">
              <Suspense fallback={<div className="mapa-caixa" />}>
                <Mapa locais={locais} uf={uf} busca={busca} intervalo={intervaloMapa} faixas={nFaixas} escuro={escuro}
                  selecionado={selecionado} onSelecionar={setSelecionado} />
              </Suspense>
              <LinhaDoTempo valores={hist} intervalo={intervalo} onIntervalo={setIntervalo} />
            </div>
            <p className="nota-mapa">
              {uf && cheio ? <>{UFS[uf]}: <b className="num">{num(escolhido.votos_pos17)}</b> votos após 17h em <b className="num">{num(escolhido.urnas_pos17)}</b> urnas. </> : null}
              {!cheio ? <>{uf ? UFS[uf] : 'Brasil'}: <b className="num">{num(noIntervalo)}</b> votos {rotuloIntervalo(intervalo, nFaixas)}. </> : null}
              Locais sem voto depois das 17h não aparecem, e os votos do exterior ficam fora do mapa.
            </p>
          </div>
        </section>

        <section className="secao" id="quando">
          <div className="wrap">
            <div className="cab">
              <div>
                <div className="rotulo">Quando</div>
                <h2>A fila acaba em poucos minutos</h2>
                <p>Votos depois das 17h de Brasília, em faixas de 5 minutos. Convertemos o horário de cada urna para o fuso de Brasília.</p>
              </div>
              {uf && <button className="chip" onClick={() => mudarUF('')}>{UFS[uf]} ✕</button>}
            </div>
            <Histograma valores={hist} titulo={uf ? UFS[uf] : 'todo o país'} intervalo={cheio ? null : intervalo} />
          </div>
        </section>

        <section className="secao" id="estados">
          <div className="wrap">
            <div className="cab">
              <div>
                <div className="rotulo">Estados e municípios</div>
                <h2>Onde mais gente votou depois das 17h</h2>
              </div>
            </div>
            <div className="duas">
              <PorUF resumo={resumo} uf={uf} onUF={mudarUF} />
              <Municipios resumo={resumo} uf={uf} />
            </div>
          </div>
        </section>

        <section className="secao" id="metodo">
          <div className="wrap">
            <div className="cab">
              <div>
                <div className="rotulo">Como calculamos</div>
                <h2>Contamos linha por linha</h2>
                <p>Os logs são públicos no site de resultados do TSE. O código que baixa e conta os votos está <a href={REPO}>no GitHub</a>, e você pode refazer tudo no seu computador.</p>
              </div>
              <a className="baixar" href={import.meta.env.BASE_URL + 'dados/urnas_pos17.csv'} download>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                Baixar CSV das urnas
              </a>
            </div>
            <div className="passos">
              <article className="cartao passo">
                <div className="n">01</div>
                <h3>Um voto é uma linha do log</h3>
                <p>A urna anota no log tudo o que acontece com ela. Cada vez que um eleitor termina de votar, ela grava esta linha:</p>
                <code className="codigo">25/10/2026 14:57:32  INFO  VOTA  <mark>O voto do eleitor foi computado</mark></code>
              </article>
              <article className="cartao passo">
                <div className="n">02</div>
                <h3>O horário é o local</h3>
                <p>O log não diz o fuso. A votação abre às 8h de Brasília no país todo, então olhamos a hora em que as urnas de cada município abriram: 6h no Acre, 7h em Manaus, 9h em Noronha.</p>
              </article>
              <article className="cartao passo">
                <div className="n">03</div>
                <h3>Urnas trocadas contam inteiras</h3>
                <p>Quando uma urna quebra e entra a de contingência, o log da original vem dentro do arquivo da nova. Lemos os dois e jogamos fora as linhas repetidas.</p>
              </article>
              <article className="cartao passo">
                <div className="n">04</div>
                <h3>O que fica de fora</h3>
                <p>Seções que votaram em cédula de papel não têm log de voto. No exterior vale o horário local, por isso esses votos não entram no mapa. E votar depois das 17h é legal para quem já estava na fila.</p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="rodape">
        <div className="wrap">
          <span>Dados: logs das urnas e cadastro de locais de votação do TSE. Código: <a href={REPO}>flaviohugo14/logsdasurnas</a></span>
          <span>Mapa: © OpenStreetMap, OpenFreeMap</span>
        </div>
      </footer>
    </>
  )
}
