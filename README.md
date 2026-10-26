# Logs das urnas: votos depois das 17h

No 2º turno de 2026 (25/10), a votação fechou às 17h de Brasília, mas quem já estava na fila ainda pôde votar. Este repositório baixa o log de todas as urnas, publicado pelo TSE, e conta quantos votos entraram depois das 17h em cada uma. O resultado vira um site com mapa, linha do tempo e ranking por estado e município.

Site: https://flaviohugo14.github.io/logsdasurnas/

Tudo aqui sai de dados públicos do TSE. Se você seguir os passos abaixo, deve chegar nos mesmos números.

## O que você precisa

- Python 3.10 ou mais novo. Os scripts usam só a biblioteca padrão, então não tem `pip install`.
- Node.js 22 ou mais novo, só para rodar o site.
- Uns 80 GB livres em disco para os logs, mais 1 GB para o cadastro de locais.
- Paciência: o download leva algumas horas. No meu caso ficou em torno de 17 GB por hora.

## Passo a passo

### 1. Clone o repositório

```sh
git clone https://github.com/flaviohugo14/logsdasurnas.git
cd logsdasurnas
```

### 2. Baixe o cadastro de locais de votação

É dele que vêm o nome da escola, o endereço e a latitude/longitude de cada seção.

```sh
mkdir -p dados_tse/locais
curl -L -o dados_tse/locais/locais2026.zip \
  https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip
unzip -o dados_tse/locais/locais2026.zip eleitorado_local_votacao_2026_BRASIL.csv -d dados_tse/locais
```

### 3. Baixe os logs das urnas

```sh
python3 baixar_logs_urnas.py
```

O script lê a lista de seções de cada estado no site de resultados do TSE e baixa o `-log.jez` de cada urna para `logs_urnas/{uf}/{município}/{zona}/{seção}/`. São cerca de 430 mil arquivos.

Algumas opções úteis:

```sh
python3 baixar_logs_urnas.py --ufs ac rr            # só alguns estados (zz = exterior)
python3 baixar_logs_urnas.py --ufs ac --limite 20   # teste rápido com 20 seções
python3 baixar_logs_urnas.py --workers 8            # menos conexões simultâneas (o padrão é 16)
python3 baixar_logs_urnas.py --tipos log bu rdv     # baixa também o boletim de urna e o RDV
```

Pode interromper com Ctrl+C quando quiser. Na próxima vez ele pula o que já baixou e continua. Cada arquivo é gravado primeiro como `.part` e só ganha o nome final quando termina, então um download pela metade não conta como completo.

Para acompanhar o tamanho da pasta em outro terminal:

```sh
python3 observar_logs.py --intervalo 10 --por-uf
```

### 4. Conte os votos

```sh
python3 analisar_votos_pos17.py
```

Ele abre todos os logs em paralelo, usando todos os núcleos da máquina. Dá para limitar com `--processos 4`. Pode rodar antes do download terminar: os estados que faltam aparecem como "aguardando" no site.

Saídas:

| Arquivo | O que tem |
|---|---|
| `site/public/dados/resumo.json` | totais, histograma e ranking usados pelo site |
| `site/public/dados/locais.json` | um registro por local de votação, com as faixas de horário |
| `site/public/dados/urnas_pos17.csv` | uma linha por urna com voto depois das 17h (é o CSV que o site oferece para download) |
| `resultados/urnas.csv` | todas as urnas, inclusive as sem voto depois das 17h |
| `resultados/mapa_votos_pos17.html` | uma versão antiga do mapa, num arquivo HTML só |

### 5. Veja o site

```sh
cd site
npm install
npm run dev     # http://localhost:5173
```

## Como a contagem funciona

O `-log.jez` é um arquivo ZIP com o `logd.dat` dentro. É um texto em Latin-1, separado por tabulação, com uma linha para cada coisa que a urna faz. Cada voto concluído gera esta linha:

```
25/10/2026 14:57:32	INFO	02273115	VOTA	O voto do eleitor foi computado	<hash>
```

Daí em diante são três cuidados:

1. **Só o dia da eleição.** O log também traz os testes e o 1º turno. O script filtra pela data `25/10/2026`.
2. **Fuso horário.** O log grava a hora local da urna e não diz qual é o fuso. Como a votação abre às 8h de Brasília no país todo, o script pega a hora mais comum de abertura ("Urna pronta para receber votos") em cada município: 8h é Brasília, 7h é UTC-4, 6h é UTC-5 e 9h é Fernando de Noronha. No exterior (UF `zz`) vale o horário local, então o corte é 17h locais e esses votos ficam fora do mapa.
3. **Urnas de contingência.** Quando uma urna é trocada, o log da original vem como outro `.jez` dentro do arquivo da nova. O script abre os arquivos aninhados e descarta linhas repetidas, para não contar o mesmo voto duas vezes.

Seções que votaram em cédula de papel não têm log de voto e não entram na conta.

Para conferir à mão uma urna qualquer:

```sh
unzip -p logs_urnas/al/28215/0050/0079/*-log.jez logd.dat | iconv -f latin1 -t utf-8 | grep "25/10/2026" | grep -c "O voto do eleitor foi computado"
```

Esse comando não lê os `.jez` aninhados, então numa urna que foi trocada ele conta menos que o script. Essa seção de Ouro Branco (AL) é um exemplo: o comando acha 44 votos, e o script acha 286, somando os da urna original.

## Onde o TSE guarda os arquivos

Não tem API documentada. Os endereços abaixo são os que o próprio site de resultados usa:

- Lista de seções de um estado: `https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3221/config/{uf}/{uf}-p003221-cs.json`
- Arquivos de uma seção: `https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3221/dados/{uf}/{mun}/{zona}/{secao}/p003221-{uf}-m{mun}-z{zona}-s{secao}-aux.json`
- Cada arquivo: `.../dados/{uf}/{mun}/{zona}/{secao}/{hash}/{nome}`

O pleito 3221 é o 2º turno de 2026; o 1º turno é o 3220. Para analisar o 1º turno, passe `--pleito 3220` no download e `--data 04/10/2026 --turno 1` na análise.

## Publicar o site

O site é estático e não precisa de banco de dados. Os JSON em `site/public/dados` ficam no repositório, então quem publica não precisa baixar os logs.

**GitHub Pages:** em *Settings → Pages*, escolha *GitHub Actions* como fonte. O workflow em `.github/workflows/pages.yml` gera e publica o site a cada push em `main` que mexa em `site/`. Depois de rodar a análise de novo, basta fazer commit dos arquivos de `site/public/dados` e dar push.

**Docker:**

```sh
cd site
docker compose up --build   # http://localhost:8080
```

## Estrutura

```
baixar_logs_urnas.py     baixa os logs do TSE (retoma de onde parou)
observar_logs.py         mostra o tamanho da pasta de logs durante o download
analisar_votos_pos17.py  conta os votos e gera os dados do site
mapa_modelo.html         modelo do mapa em HTML único (resultados/mapa_votos_pos17.html)
site/                    site em Vite + React + MapLibre
```

As pastas `logs_urnas/`, `dados_tse/` e `resultados/` ficam fora do git porque são grandes e qualquer um pode gerá-las de novo com os scripts.
