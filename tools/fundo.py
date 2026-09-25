#!/usr/bin/env python3
# Gera ui/img/fundo.svg: azulejo 420x420 de rabiscos de caderno que se repete sem emenda.
# Distribuição: Poisson-disk num toro; o que passa da borda ganha cópia do outro lado.
import math, random, sys

T = 420
rnd = random.Random(20260925)

def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s

# ---- formas: lista de comandos (letra, [pontos]) em coordenadas locais ~ +-16 ----
def poly(pts, close=False):
    cmds = [("M", [pts[0]])] + [("L", [p]) for p in pts[1:]]
    if close: cmds.append(("Z", []))
    return cmds

def star5():
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 13 if i % 2 == 0 else 5.8
        pts.append((r * math.cos(a), r * math.sin(a)))
    return poly(pts, True), 14

def sparkle():
    R, r = 15, 1.6
    return [("M", [(0, -R)]), ("Q", [(r, -r), (R * 0.72, 0)]), ("Q", [(r, r), (0, R)]),
            ("Q", [(-r, r), (-R * 0.72, 0)]), ("Q", [(-r, -r), (0, -R)]), ("Z", [])], 15

def spiral():
    pts = []
    voltas = 1.75
    n = 48
    for i in range(n + 1):
        t = i / n * voltas * 2 * math.pi
        r = 1.5 + 12.5 * (t / (voltas * 2 * math.pi))
        pts.append((r * math.cos(t), r * math.sin(t)))
    return poly(pts), 14

def bolt():
    return poly([(-1, -15), (7, -15), (2, -3.5), (8.5, -3.5), (-5, 15), (-1, 1.5), (-7.5, 1.5)], True), 16

def plus():
    return [("M", [(-8, 0)]), ("L", [(8, 0)]), ("M", [(0, -8)]), ("L", [(0, 8)])], 9

def xis():
    return [("M", [(-6, -6)]), ("L", [(6, 6)]), ("M", [(6, -6)]), ("L", [(-6, 6)])], 9

def bolinha():
    # círculo feito à mão: passa um pouquinho do ponto de partida
    pts = []
    n = 30
    for i in range(n + 1):
        t = -0.6 + i / n * (2 * math.pi + 0.9)
        r = 6.2 + 0.5 * math.sin(t * 1.5)
        pts.append((r * math.cos(t), r * math.sin(t)))
    return poly(pts), 8

def pontinhos():
    cmds = []
    for (x, y) in [(-6, 3), (1, -5), (7, 4)]:
        # bolinha minúscula (círculo de raio 1.3 com traço 3 vira um pingo)
        cmds += [("M", [(x + 1.3, y)]), ("A", [(1.3, 1.3), (x - 1.3, y)]), ("A", [(1.3, 1.3), (x + 1.3, y)])]
    return cmds, 10

def ondinha():
    pts = []
    n = 40
    for i in range(n + 1):
        x = -18 + 36 * i / n
        pts.append((x, 4.5 * math.sin(x / 17 * 2 * math.pi)))
    return poly(pts), 19

def coracao():
    return [("M", [(0, 9)]), ("C", [(-6, 4.5), (-13, -0.5), (-12, -6)]),
            ("C", [(-11, -11.5), (-3.5, -12.5), (0, -6)]), ("C", [(3.5, -12.5), (11, -11.5), (12, -6)]),
            ("C", [(13, -0.5), (6, 4.5), (0, 9)]), ("Z", [])], 13

def bateria():
    x0, y0, w, h, r = -15, -8, 26, 16, 4
    x1, y1 = x0 + w, y0 + h
    c = [("M", [(x0 + r, y0)]), ("L", [(x1 - r, y0)]), ("Q", [(x1, y0), (x1, y0 + r)]),
         ("L", [(x1, y1 - r)]), ("Q", [(x1, y1), (x1 - r, y1)]), ("L", [(x0 + r, y1)]),
         ("Q", [(x0, y1), (x0, y1 - r)]), ("L", [(x0, y0 + r)]), ("Q", [(x0, y0), (x0 + r, y0)]), ("Z", []),
         ("M", [(15, -3)]), ("L", [(15, 3)]),
         ("M", [(-9, -2.5)]), ("L", [(-9, 2.5)]), ("M", [(-3.5, -2.5)]), ("L", [(-3.5, 2.5)])]
    return c, 17

def setinha():
    p0, p1, p2 = (-14, 8), (-4, -12), (12, -4)
    dx, dy = 2 * (p2[0] - p1[0]), 2 * (p2[1] - p1[1])
    L = math.hypot(dx, dy)
    bx, by = -dx / L, -dy / L
    cabeca = []
    for ang in (0.55, -0.55):
        ca, sa = math.cos(ang), math.sin(ang)
        cabeca.append((p2[0] + 8 * (bx * ca - by * sa), p2[1] + 8 * (bx * sa + by * ca)))
    return [("M", [p0]), ("Q", [p1, p2]), ("M", [cabeca[0]]), ("L", [p2]), ("L", [cabeca[1]])], 15

def sol():
    cmds = [("M", [(4.5, 0)]), ("A", [(4.5, 4.5), (-4.5, 0)]), ("A", [(4.5, 4.5), (4.5, 0)])]
    for i in range(8):
        a = i * math.pi / 4 + 0.2
        cmds += [("M", [(8.5 * math.cos(a), 8.5 * math.sin(a))]), ("L", [(12.5 * math.cos(a), 12.5 * math.sin(a))])]
    return cmds, 14

def tcharam():
    # três risquinhos de "tcharam"
    cmds = []
    for a, r0, r1 in [(-2.75, 7, 16), (-2.02, 6, 15), (-1.3, 7, 16)]:
        cmds += [("M", [(r0 * math.cos(a) + 1, r0 * math.sin(a) + 8)]),
                 ("L", [(r1 * math.cos(a) + 1, r1 * math.sin(a) + 8)])]
    return cmds, 12

FORMAS = {
    "estrela": star5, "brilho": sparkle, "espiral": spiral, "raio": bolt, "mais": plus,
    "xis": xis, "bolinha": bolinha, "pontinhos": pontinhos, "ondinha": ondinha,
    "coracao": coracao, "bateria": bateria, "setinha": setinha, "sol": sol, "tcharam": tcharam,
}
# quantas vezes cada uma aparece no azulejo
QUANTAS = {"estrela": 2, "brilho": 2, "espiral": 2, "raio": 2, "mais": 2, "xis": 1, "bolinha": 1,
           "pontinhos": 1, "ondinha": 2, "coracao": 2, "bateria": 2, "setinha": 1, "sol": 1, "tcharam": 1}

# ---- pontos: Poisson-disk no toro ----
def dist_toro(a, b):
    dx = abs(a[0] - b[0]); dy = abs(a[1] - b[1])
    dx = min(dx, T - dx); dy = min(dy, T - dy)
    return math.hypot(dx, dy)

def poisson(minimo, alvo, tentativas=4000):
    pts = []
    for _ in range(tentativas):
        p = (rnd.uniform(0, T), rnd.uniform(0, T))
        if all(dist_toro(p, q) >= minimo for q in pts):
            pts.append(p)
            if len(pts) == alvo: break
    return pts

alvo = sum(QUANTAS.values())
pts = poisson(40, alvo, 100000)
if len(pts) < alvo:
    sys.exit(f"só couberam {len(pts)} de {alvo}")
# relaxa: cada ponto empurra os vizinhos (no toro) até o espaçamento ficar parelho
ALCANCE = 120
for it in range(300):
    novos = []
    for i, p in enumerate(pts):
        fx = fy = 0.0
        for j, q in enumerate(pts):
            if i == j: continue
            dx = p[0] - q[0]; dy = p[1] - q[1]
            dx -= T * round(dx / T); dy -= T * round(dy / T)
            d = math.hypot(dx, dy)
            if 0 < d < ALCANCE:
                k = (ALCANCE - d) / ALCANCE
                fx += dx / d * k; fy += dy / d * k
        passo = 6 * (1 - it / 300) + 0.5
        novos.append(((p[0] + fx * passo) % T, (p[1] + fy * passo) % T))
    pts = novos
# um tiquinho de desordem pra não parecer grade
pts = [((x + rnd.uniform(-5, 5)) % T, (y + rnd.uniform(-5, 5)) % T) for x, y in pts]
menor = min(dist_toro(a, b) for i, a in enumerate(pts) for b in pts[i + 1:])
print(f"menor distância entre rabiscos: {menor:.0f} px", file=sys.stderr)

# ---- tipos: nenhum vizinho próximo repete o mesmo desenho ----
saco = [k for k, n in QUANTAS.items() for _ in range(n)]
rnd.shuffle(saco)
tipos = [None] * len(pts)
for i, p in enumerate(pts):
    viz = {tipos[j] for j, q in enumerate(pts) if tipos[j] and dist_toro(p, q) < 170}
    escolha = next((k for k in saco if k not in viz), saco[0])
    saco.remove(escolha)
    tipos[i] = escolha

# ---- saída ----
def transformar(cmds, cx, cy, ang, esc):
    ca, sa = math.cos(ang), math.sin(ang)
    def tp(p):
        x, y = p[0] * esc, p[1] * esc
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)
    out = []
    for letra, ps in cmds:
        if letra == "Z":
            out.append("Z")
        elif letra == "A":
            (rx, ry), fim = ps
            x, y = tp(fim)
            out.append(f"A{f(rx * esc)} {f(ry * esc)} 0 0 1 {f(x)} {f(y)}")
        else:
            out.append(letra + " ".join(f"{f(x)} {f(y)}" for x, y in map(tp, ps)))
    return "".join(out)

caminhos = []
for (x, y), tipo in zip(pts, tipos):
    cmds, raio = FORMAS[tipo]()
    giro = {"bateria": 22, "setinha": 35, "ondinha": 25, "brilho": 18, "tcharam": 30}.get(tipo, 40)
    ang = math.radians(rnd.uniform(-giro, giro))
    esc = rnd.uniform(0.92, 1.12)
    raio = raio * esc + 2
    # cópias do outro lado quando encosta na borda
    xs = [x] + ([x + T] if x - raio < 0 else []) + ([x - T] if x + raio > T else [])
    ys = [y] + ([y + T] if y - raio < 0 else []) + ([y - T] if y + raio > T else [])
    for cx in xs:
        for cy in ys:
            caminhos.append(f'  <path d="{transformar(cmds, cx, cy, ang, esc)}"/>')

svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">\n'
       '  <!-- Kamurafy: rabiscos de caderno pro fundo (azulejo que se repete; usado com opacidade baixa).\n'
       '       O que passa da borda continua do outro lado, pra não ter emenda. -->\n'
       '  <g fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">\n'
       + "\n".join(caminhos) + "\n  </g>\n</svg>\n")
open(sys.argv[1], "w").write(svg)
print(f"{len(pts)} rabiscos, {len(caminhos)} caminhos, {len(svg)} bytes", file=sys.stderr)
