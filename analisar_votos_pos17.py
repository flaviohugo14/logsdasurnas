#!/usr/bin/env python3
"""Conta, por urna, os votos registrados depois das 17h (horário de Brasília) no dia da eleição.

Como os votos aparecem no log da urna (logd.dat dentro do -log.jez):
  25/10/2026 14:57:32  INFO  02273115  VOTA  O voto do eleitor foi computado  <hash>
Cada linha "O voto do eleitor foi computado" é um voto concluído.

O log é gravado no horário LOCAL da urna, sem indicação de fuso. Como a votação abre às 8h
de Brasília no país inteiro, o fuso de cada município é deduzido pela hora mais comum de
"Urna pronta para receber votos": 8h -> Brasília, 7h -> UTC-4, 6h -> UTC-5, 9h -> Noronha.
No exterior (UF zz) a votação segue o horário local, então lá o corte é 17h locais.

Saídas em --saida:
  urnas.csv        uma linha por urna, com a contagem e a localização
  mapa_dados.json        agregado por local de votação
  mapa_votos_pos17.html  mapa interativo (mapa_modelo.html com os dados embutidos)

Uso:
  python3 analisar_votos_pos17.py
  python3 analisar_votos_pos17.py --logs logs_urnas --locais dados_tse/locais/eleitorado_local_votacao_2026_BRASIL.csv
"""
import argparse
import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from multiprocessing import Pool
from pathlib import Path

VOTO = b"O voto do eleitor foi computado"
PRONTA = b"Urna pronta para receber votos"
CORTE = 17 * 3600
BALDES = 36  # faixas de 5 min entre 17h e 20h
# Fuso padrão por UF (horas a somar ao horário local para obter Brasília), usado só se o
# município não tiver urnas suficientes para deduzir o fuso.
FUSO_UF = {"ac": 2, "am": 1, "rr": 1, "ro": 1, "mt": 1, "ms": 1}


def segundos(linha):
    return int(linha[11:13]) * 3600 + int(linha[14:16]) * 60 + int(linha[17:19])


def logs_do_jez(z, profundidade=0):
    """Gera o conteúdo de cada log. Quando a urna foi substituída (contingência) ou o log foi
    rotacionado, o -log.jez traz os logs anteriores como .jez aninhados ao lado do logd.dat."""
    for nome in z.namelist():
        if nome.endswith(".dat"):
            yield z.read(nome)
        elif nome.endswith(".jez") and profundidade < 2:
            with zipfile.ZipFile(io.BytesIO(z.read(nome))) as interno:
                yield from logs_do_jez(interno, profundidade + 1)


def ler_log(args):
    caminho, data = args
    uf, mun, zona, secao = caminho.parts[-5:-1]
    linhas_voto = set()  # logs copiados entre MI/ME podem repetir linhas
    aberturas = []
    try:
        with zipfile.ZipFile(caminho) as z:
            for conteudo in logs_do_jez(z):
                for linha in conteudo.split(b"\n"):
                    if not linha.startswith(data):
                        continue
                    if VOTO in linha:
                        linhas_voto.add(linha.rstrip(b"\r"))
                    elif PRONTA in linha:
                        aberturas.append(segundos(linha))
    except Exception as e:
        return {"uf": uf, "mun": mun, "zona": zona, "secao": secao, "erro": str(e)}
    return {"uf": uf, "mun": mun, "zona": zona, "secao": secao,
            "abertura": min(aberturas, default=None),
            "votos": sorted(segundos(l) for l in linhas_voto)}


def hhmmss(s):
    return None if s is None else f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def carregar_locais(caminho, turno):
    locais = {}
    with open(caminho, encoding="latin1", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            r = {k: (v or "").strip() for k, v in r.items()}
            if r["NR_TURNO"] != turno:
                continue
            chave = (r["SG_UF"].lower(), r["CD_MUNICIPIO"], int(r["NR_ZONA"]), int(r["NR_SECAO"]))
            locais[chave] = r
    return locais


def gravar_site(pasta, dados, resumo, faixas, municipios, ultimo_voto, linhas_pos17):
    """JSON compactos lidos pelo site (site/src/dados.ts descreve os formatos)."""
    pasta.mkdir(parents=True, exist_ok=True)
    ufs = {uf: r for uf, r in resumo.items() if uf != "ZZ"}
    total = {k: sum(r[k] for r in ufs.values()) for k in ("urnas", "urnas_pos17", "votos", "votos_pos17")}
    hist = [sum(f[i] for f in faixas.values()) for i in range(BALDES + 1)]
    with open(pasta / "resumo.json", "w", encoding="utf-8") as f:
        json.dump({"data": dados["data"], "turno": dados["turno"], "gerado_em": dados["gerado_em"],
                   "total": total, "ufs": ufs, "exterior": resumo.get("ZZ"),
                   "histograma": hist, "histograma_uf": faixas,
                   "ultimo_voto": dict(zip(("hora", "uf", "municipio", "local", "secao"),
                                           (hhmmss(ultimo_voto[0]), *ultimo_voto[1:]))) if ultimo_voto else None,
                   "municipios": sorted((m for m in municipios.values() if m[5]), key=lambda m: -m[5])},
                  f, ensure_ascii=False, separators=(",", ":"))
    campos = ("lat", "lon", "uf", "municipio", "local", "bairro", "zona", "urnas", "urnas_pos17",
              "votos", "votos_pos17", "ultimo", "secoes", "faixas")
    with open(pasta / "locais.json", "w", encoding="utf-8") as f:
        json.dump({"campos": campos, "linhas": [[p[c] for c in campos] for p in dados["pontos"]]},
                  f, ensure_ascii=False, separators=(",", ":"))
    with open(pasta / "urnas_pos17.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["uf", "cd_municipio", "municipio", "zona", "secao", "fuso_vs_brasilia_h",
                    "abertura_local", "primeiro_voto_brasilia", "ultimo_voto_brasilia",
                    "votos_total", "votos_apos_17h", "local_votacao", "endereco", "latitude", "longitude"])
        w.writerows(linhas_pos17)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--logs", default="logs_urnas")
    p.add_argument("--locais", default="dados_tse/locais/eleitorado_local_votacao_2026_BRASIL.csv")
    p.add_argument("--data", default="25/10/2026", help="dia da eleição, como aparece no log")
    p.add_argument("--turno", default="2")
    p.add_argument("--saida", default="resultados")
    p.add_argument("--processos", type=int)
    p.add_argument("--site", default="site/public/dados", help="pasta dos JSON consumidos pelo site")
    args = p.parse_args()

    arquivos = sorted(Path(args.logs).glob("*/*/*/*/*-log.jez"))
    print(f"{len(arquivos)} logs encontrados", flush=True)
    data = args.data.encode()
    with Pool(args.processos) as pool:
        urnas = [u for u in pool.imap_unordered(ler_log, ((a, data) for a in arquivos), chunksize=64)]
    erros = [u for u in urnas if "erro" in u]
    urnas = [u for u in urnas if "erro" not in u]

    # Fuso por município: hora de abertura mais comum entre suas urnas.
    aberturas = defaultdict(Counter)
    for u in urnas:
        if u["abertura"] is not None:
            aberturas[(u["uf"], u["mun"])][u["abertura"] // 3600] += 1
    fuso_mun = {k: 8 - c.most_common(1)[0][0] for k, c in aberturas.items()}

    print("carregando locais de votação...", flush=True)
    locais = carregar_locais(args.locais, args.turno)

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    pontos = {}
    sem_local = 0
    total_pos17 = Counter()
    resumo = defaultdict(lambda: {"urnas": 0, "urnas_pos17": 0, "votos": 0, "votos_pos17": 0})
    municipios = {}
    # Votos após 17h em faixas de 5 minutos (17:00–17:05, ...); a última faixa junta tudo após 20h.
    faixas = defaultdict(lambda: [0] * (BALDES + 1))
    ultimo_voto = None
    linhas_pos17 = []
    with open(saida / "urnas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["uf", "cd_municipio", "municipio", "zona", "secao", "fuso_vs_brasilia_h",
                    "abertura_local", "primeiro_voto_brasilia", "ultimo_voto_brasilia",
                    "votos_total", "votos_apos_17h", "local_votacao", "endereco", "latitude", "longitude"])
        for u in sorted(urnas, key=lambda u: (u["uf"], u["mun"], u["zona"], u["secao"])):
            exterior = u["uf"] == "zz"
            fuso = 0 if exterior else fuso_mun.get((u["uf"], u["mun"]), FUSO_UF.get(u["uf"], 0))
            votos = [v + fuso * 3600 for v in u["votos"]]
            pos17 = sum(v > CORTE for v in votos)
            baldes = Counter(min((v - CORTE - 1) // 300, BALDES) for v in votos if v > CORTE)
            total_pos17[u["uf"]] += pos17
            r = resumo[u["uf"].upper()]
            r["urnas"] += 1
            r["urnas_pos17"] += pos17 > 0
            r["votos"] += len(votos)
            r["votos_pos17"] += pos17
            if not exterior:
                for b, q in baldes.items():
                    faixas[u["uf"].upper()][b] += q
            loc = locais.get((u["uf"], u["mun"], int(u["zona"]), int(u["secao"])))
            lat = lon = None
            if loc and loc["NR_LATITUDE"] not in ("", "-1"):
                lat = float(loc["NR_LATITUDE"].replace(",", "."))
                lon = float(loc["NR_LONGITUDE"].replace(",", "."))
            elif not loc:
                sem_local += 1
            linha = [u["uf"], u["mun"], loc["NM_MUNICIPIO"] if loc else "", u["zona"], u["secao"],
                     "local" if exterior else fuso, hhmmss(u["abertura"]),
                     hhmmss(min(votos, default=None)), hhmmss(max(votos, default=None)),
                     len(votos), pos17, loc["NM_LOCAL_VOTACAO"] if loc else "",
                     loc["DS_ENDERECO"] if loc else "", lat, lon]
            w.writerow(linha)
            if pos17:
                linhas_pos17.append(linha)
            if exterior:
                continue
            m = municipios.setdefault((u["uf"], u["mun"]), [u["uf"].upper(), loc["NM_MUNICIPIO"] if loc else u["mun"], 0, 0, 0, 0])
            m[2] += 1
            m[3] += pos17 > 0
            m[4] += len(votos)
            m[5] += pos17
            if votos and (ultimo_voto is None or max(votos) > ultimo_voto[0]):
                ultimo_voto = (max(votos), u["uf"].upper(), m[1], loc["NM_LOCAL_VOTACAO"] if loc else "", int(u["secao"]))
            if exterior or lat is None:
                continue
            chave = (u["uf"], u["mun"], loc["NR_ZONA"], loc["NR_LOCAL_VOTACAO"])
            pt = pontos.setdefault(chave, {
                "lat": round(lat, 5), "lon": round(lon, 5), "uf": u["uf"].upper(),
                "municipio": loc["NM_MUNICIPIO"], "local": loc["NM_LOCAL_VOTACAO"],
                "bairro": loc["NM_BAIRRO"], "zona": int(loc["NR_ZONA"]),
                "urnas": 0, "urnas_pos17": 0, "votos": 0, "votos_pos17": 0, "ultimo": None, "secoes": [], "faixas": Counter()})
            pt["urnas"] += 1
            pt["votos"] += len(votos)
            if pos17:
                pt["urnas_pos17"] += 1
                pt["votos_pos17"] += pos17
                # faixas esparsas [[faixa de 5 min, votos], ...] para o filtro de horário do site
                pt["secoes"].append([int(u["secao"]), pos17, sorted(baldes.items())])
                pt["faixas"].update(baldes)
                ult = hhmmss(max(votos))
                pt["ultimo"] = max(pt["ultimo"] or ult, ult)

    for p in pontos.values():
        p["faixas"] = sorted(p["faixas"].items())
    # O mapa só desenha locais com ao menos um voto após 17h; o resumo cobre todas as urnas.
    dados = {"data": args.data, "turno": args.turno,
             "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
             "resumo": resumo, "pontos": [p for p in pontos.values() if p["votos_pos17"]]}
    with open(saida / "mapa_dados.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    modelo = (Path(__file__).parent / "mapa_modelo.html").read_text(encoding="utf-8")
    js = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    (saida / "mapa_votos_pos17.html").write_text(modelo.replace("/*__DADOS__*/null", js), encoding="utf-8")

    gravar_site(Path(args.site), dados, resumo, faixas, municipios, ultimo_voto, linhas_pos17)

    print(f"{len(urnas)} urnas analisadas, {len(erros)} logs com erro, {sem_local} sem local de votação")
    print(f"fusos deduzidos: {dict(Counter(fuso_mun.values()))}")
    for uf, n in sorted(total_pos17.items()):
        print(f"  {uf.upper()}: {n} votos após 17h")
    print(f"TOTAL: {sum(total_pos17.values())} votos após 17h  ->  {saida}/urnas.csv, {saida}/mapa_votos_pos17.html")


if __name__ == "__main__":
    main()
