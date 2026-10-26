# Site

Vite + React + MapLibre. Lê os dados de `public/dados`, gerados por `../analisar_votos_pos17.py`.

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # gera dist/
```

No GitHub Pages o site fica em `/logsdasurnas/`. O workflow passa esse caminho em `BASE_PATH`; para testar localmente:

```sh
BASE_PATH=/logsdasurnas/ npm run build
npx vite preview --base /logsdasurnas/
```

Como baixar os logs e refazer a contagem está no [README principal](../README.md).
