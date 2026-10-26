// Formatos gerados por analisar_votos_pos17.py (pasta public/dados).

export type Contagem = { urnas: number; urnas_pos17: number; votos: number; votos_pos17: number }

export type Resumo = {
  data: string
  turno: string
  gerado_em: string
  /** logs lidos na análise; bytes em disco, como o `du` */
  logs?: { arquivos: number; bytes: number }
  total: Contagem
  ufs: Record<string, Contagem>
  exterior: Contagem | null
  /** votos após 17h em faixas de 5 min a partir das 17:00; a última faixa é "20h ou depois" */
  histograma: number[]
  histograma_uf: Record<string, number[]>
  ultimo_voto: { hora: string; uf: string; municipio: string; local: string; secao: number } | null
  /** [uf, município, urnas, urnas com voto após 17h, votos, votos após 17h] */
  municipios: [string, string, number, number, number, number][]
}

/** Votos por faixa de 5 min, esparso: [[índice da faixa, votos], ...] */
export type Faixas = [number, number][]

/** Intervalo de faixas [início, fim), como no histograma. */
export type Intervalo = [number, number]

export const contar = (faixas: Faixas, [a, b]: Intervalo) =>
  faixas.reduce((t, [i, n]) => (i >= a && i < b ? t + n : t), 0)

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
/** Horário do início da faixa i (a última faixa, n-1, junta tudo a partir das 20h). */
export const horaFaixa = (i: number) => hhmm(17 * 60 + i * 5)
export const rotuloIntervalo = ([a, b]: Intervalo, n: number) =>
  b >= n ? (a >= n - 1 ? 'depois das 20h' : `depois das ${horaFaixa(a)}`) : `entre ${horaFaixa(a)} e ${horaFaixa(b)}`

export type Local = {
  id: number
  lat: number
  lon: number
  uf: string
  municipio: string
  local: string
  bairro: string
  zona: number
  urnas: number
  urnas_pos17: number
  votos: number
  votos_pos17: number
  ultimo: string
  /** [seção, votos após 17h, faixas] */
  secoes: [number, number, Faixas][]
  faixas: Faixas
  /** município, local e bairro sem acentos, para a busca */
  busca: string
}

export async function carregarDados(): Promise<{ resumo: Resumo; locais: Local[] }> {
  const base = import.meta.env.BASE_URL + 'dados/'
  const [resumo, brutos] = await Promise.all([
    fetch(base + 'resumo.json').then(r => r.json() as Promise<Resumo>),
    fetch(base + 'locais.json').then(r => r.json() as Promise<{ campos: string[]; linhas: unknown[][] }>),
  ])
  const locais = brutos.linhas.map((linha, id) => {
    const l = Object.fromEntries(brutos.campos.map((c, i) => [c, linha[i]])) as Omit<Local, 'id' | 'busca'>
    return { ...l, id, busca: normalizar(`${l.municipio} ${l.local} ${l.bairro}`) }
  })
  return { resumo, locais }
}

export const UFS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais',
  MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia',
  RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo',
  TO: 'Tocantins',
}

const nf = new Intl.NumberFormat('pt-BR')
export const num = (n: number) => nf.format(n)
export const pct = (a: number, b: number, casas = 1) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: casas, maximumFractionDigits: casas })
    .format(b ? a / b : 0)

/** Faixas de cor/tamanho do mapa, por votos após 17h no local. */
export const FAIXAS: [number, number, string][] = [
  [1, 1, '1'], [2, 4, '2–4'], [5, 9, '5–9'], [10, 19, '10–19'], [20, Infinity, '20+'],
]

export const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
/** "SÃO GABRIEL DA CACHOEIRA" -> "São Gabriel da Cachoeira" */
export const titulo = (s: string) =>
  s.toLowerCase().split(' ').map((p, i) => (i && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')

/** Bytes em GB com uma casa, no formato brasileiro (73,9 GB). */
export const gb = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
