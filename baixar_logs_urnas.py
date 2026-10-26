#!/usr/bin/env python3
"""Baixa em massa os arquivos de urna (log, BU, RDV, assinatura) publicados pelo TSE.

Fluxo da API pública (resultados.tse.jus.br):
  1. config/<uf>/<uf>-p<pleito>-cs.json  -> municípios, zonas e seções da UF
  2. dados/<uf>/<mun>/<zona>/<secao>/p<pleito>-<uf>-m<mun>-z<zona>-s<secao>-aux.json
                                         -> hashes e nomes dos arquivos da seção
  3. dados/<uf>/<mun>/<zona>/<secao>/<hash>/<arquivo>

Exemplos:
  python3 baixar_logs_urnas.py                       # logs do 2º turno 2026, todas as UFs
  python3 baixar_logs_urnas.py --ufs sp rj --tipos log bu
  python3 baixar_logs_urnas.py --ufs ac --limite 20  # teste rápido
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE = "https://resultados.tse.jus.br/oficial"
UFS = ("ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz").split()


def get(url, tentativas=5):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            erro = e
        except Exception as e:
            erro = e
        time.sleep(2 ** i)
    raise RuntimeError(f"falhou após {tentativas} tentativas: {url} ({erro})")


def secoes_da_uf(ciclo, pleito, uf):
    url = f"{BASE}/{ciclo}/arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito:06d}-cs.json"
    dados = get(url)
    if dados is None:
        return
    for abr in json.loads(dados)["abr"]:
        for mu in abr["mu"]:
            for zon in mu["zon"]:
                for sec in zon["sec"]:
                    yield uf, mu["cd"], zon["cd"], sec["ns"]


def baixar_secao(args, uf, mun, zona, secao):
    pasta_url = f"{BASE}/{args.ciclo}/arquivo-urna/{args.pleito}/dados/{uf}/{mun}/{zona}/{secao}"
    aux = get(f"{pasta_url}/p{args.pleito:06d}-{uf}-m{mun}-z{zona}-s{secao}-aux.json")
    if aux is None:
        return 0
    destino = Path(args.saida) / uf / mun / zona / secao
    baixados = 0
    for h in json.loads(aux)["hashes"]:
        # Uma seção pode ter mais de um hash (ex.: reenvio); por padrão só o totalizado.
        if not args.todos_hashes and h.get("st") != "Totalizado":
            continue
        for arq in h["arq"]:
            if arq["tp"] not in args.tipos:
                continue
            alvo = destino / arq["nm"]
            if alvo.exists():
                continue
            conteudo = get(f"{pasta_url}/{h['hash']}/{arq['nm']}")
            if conteudo is None:
                continue
            alvo.parent.mkdir(parents=True, exist_ok=True)
            tmp = alvo.with_suffix(alvo.suffix + ".part")
            tmp.write_bytes(conteudo)
            tmp.rename(alvo)
            baixados += 1
    return baixados


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--ciclo", default="ele2026")
    p.add_argument("--pleito", type=int, default=3221, help="3220 = 1º turno 2026, 3221 = 2º turno 2026")
    p.add_argument("--ufs", nargs="+", default=UFS, help="zz = exterior")
    p.add_argument("--tipos", nargs="+", default=["log"], help="log, bu, rdv, vota (assinatura), imgbu...")
    p.add_argument("--saida", default="logs_urnas")
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--limite", type=int, help="máximo de seções por UF (para testes)")
    p.add_argument("--todos-hashes", action="store_true", help="baixa também hashes não totalizados")
    args = p.parse_args()

    for uf in args.ufs:
        secoes = list(secoes_da_uf(args.ciclo, args.pleito, uf.lower()))
        if args.limite:
            secoes = secoes[: args.limite]
        print(f"[{uf}] {len(secoes)} seções", flush=True)
        total = feitos = 0
        with ThreadPoolExecutor(args.workers) as ex:
            futuros = [ex.submit(baixar_secao, args, *s) for s in secoes]
            for f in as_completed(futuros):
                feitos += 1
                try:
                    total += f.result()
                except Exception as e:
                    print(f"  erro: {e}", file=sys.stderr)
                if feitos % 500 == 0:
                    print(f"  {feitos}/{len(secoes)} seções, {total} arquivos", flush=True)
        print(f"[{uf}] concluído: {total} arquivos novos", flush=True)


if __name__ == "__main__":
    main()
