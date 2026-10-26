#!/usr/bin/env python3
"""Observa a pasta de logs e mostra quanto espaço ela ocupa, em GB, enquanto o download roda.

A cada intervalo, mostra o total em disco, o número de arquivos, a velocidade desde a leitura
anterior e o espaço livre no disco. Ctrl+C encerra.

Uso:
  python3 observar_logs.py                    # a cada 30 s
  python3 observar_logs.py --intervalo 10 --por-uf
  python3 observar_logs.py --uma-vez
"""
import argparse
import os
import shutil
import time
from collections import Counter
from datetime import datetime

GB = 1024 ** 3


def medir(pasta):
    """Retorna (bytes em disco por UF, número de arquivos). Usa blocos alocados, como o `du`."""
    por_uf = Counter()
    arquivos = 0
    pilha = [(pasta, None)]
    while pilha:
        caminho, uf = pilha.pop()
        try:
            entradas = os.scandir(caminho)
        except FileNotFoundError:
            continue  # pasta removida/renomeada durante a varredura
        with entradas:
            for e in entradas:
                try:
                    if e.is_dir(follow_symlinks=False):
                        pilha.append((e.path, uf or e.name))
                    elif e.is_file(follow_symlinks=False):
                        st = e.stat(follow_symlinks=False)
                        por_uf[uf or "-"] += getattr(st, "st_blocks", 0) * 512 or st.st_size
                        arquivos += 1
                except FileNotFoundError:
                    continue  # .part renomeado entre o scandir e o stat
    return por_uf, arquivos


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pasta", nargs="?", default="logs_urnas")
    p.add_argument("--intervalo", type=float, default=30, help="segundos entre leituras")
    p.add_argument("--por-uf", action="store_true", help="mostra também o tamanho de cada UF")
    p.add_argument("--uma-vez", action="store_true", help="mede uma vez e sai")
    args = p.parse_args()

    anterior = None
    try:
        while True:
            inicio = time.monotonic()
            por_uf, arquivos = medir(args.pasta)
            total = sum(por_uf.values())
            livre = shutil.disk_usage(args.pasta if os.path.exists(args.pasta) else ".").free

            linha = f"{datetime.now():%H:%M:%S}  {total / GB:8.2f} GB  {arquivos:>9,} arquivos".replace(",", ".")
            if anterior:
                dt = inicio - anterior[0]
                taxa = (total - anterior[1]) / dt
                linha += f"  {taxa / 1024 ** 2:6.2f} MB/s ({taxa * 3600 / GB:5.1f} GB/h)"
            linha += f"  |  livre no disco: {livre / GB:.1f} GB"
            print(linha, flush=True)
            if args.por_uf:
                print("          " + "  ".join(f"{uf.upper()} {b / GB:.2f}" for uf, b in sorted(por_uf.items())), flush=True)

            if args.uma_vez:
                break
            anterior = (inicio, total)
            time.sleep(max(0, args.intervalo - (time.monotonic() - inicio)))
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
