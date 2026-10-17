// Kamurafy — desenha o ícone do app: a bateria sorridente num quadrado amarelo-ouro,
// com contorno de tinta preta e sombra dura (o visual do resto do app).
// Só CoreGraphics + ImageIO; compila com as Command Line Tools (Swift 5.8, sem Xcode).
//
//   icone <pasta.iconset>                       todos os tamanhos do .iconset (16 a 512 @2x)
//   icone --png <pontos> <saida.png> [escala]   um tamanho só (ex.: --png 32 x.png 2)
//   icone --folha <saida.png>                   folha de conferência (tamanhos reais e ampliados)
//
// De 64 px pra cima o desenho é vetorial, na grade de 1024 do macOS Big Sur+ (quadrado de 824
// com cantos contínuos de raio ~185 e margem pra sombra). Em 16 e 32 px ele é refeito alinhado
// ao pixel, com traço mais grosso e só o essencial (rosto, líquido, pino), pra não virar borrão
// no Finder e nas listas.

import Foundation
import CoreGraphics
import ImageIO

// MARK: - cores (as mesmas de ui/css/base.css)

func cor(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: a)
}

let TINTA = cor(0x000000)
let BRANCO = cor(0xffffff)
let OURO = cor(0xffd23f)
let OURO_CLARO = cor(0xffe072)
let VERDE = cor(0x0ca30c)
let VERDE_CLARO = cor(0x5fd35f)
let ROSA = cor(0xff9eb5)
let LINGUA = cor(0xff6f8e)
let SOMBRA_BRANCO = cor(0xe9edf2)

// MARK: - formas

/// Retângulo de cantos contínuos (o "squircle" dos ícones da Apple).
func cantosContinuos(_ r: CGRect, _ raio: CGFloat) -> CGPath {
    let k = min(raio, min(r.width, r.height) / 2 / 1.52866483)
    // um canto, da borda de cima pra borda direita, em múltiplos do raio (a = distância da
    // borda direita, b = distância da borda de cima); os outros três saem por simetria
    typealias P = (CGFloat, CGFloat)
    let inicio: P = (1.52866483, 0)
    let curvas: [(P, P, P)] = [
        ((1.08849323, 0), (0.86840689, 0), (0.66993427, 0.06549600)),
        ((0.37282392, 0.16905899), (0.16906013, 0.37282401), (0.07491100, 0.63149399)),
        ((0, 0.86840689), (0, 1.08849323), (0, 1.52866483)),
    ]
    let retas: [P] = [(0.63149399, 0.07491100), (0.06549600, 0.66993427)]
    let cantos: [(P) -> CGPoint] = [
        { CGPoint(x: r.maxX - $0.0 * k, y: r.minY + $0.1 * k) },   // cima-direita
        { CGPoint(x: r.maxX - $0.1 * k, y: r.maxY - $0.0 * k) },   // baixo-direita
        { CGPoint(x: r.minX + $0.0 * k, y: r.maxY - $0.1 * k) },   // baixo-esquerda
        { CGPoint(x: r.minX + $0.1 * k, y: r.minY + $0.0 * k) },   // cima-esquerda
    ]
    let p = CGMutablePath()
    for (i, m) in cantos.enumerated() {
        if i == 0 { p.move(to: m(inicio)) } else { p.addLine(to: m(inicio)) }
        for (j, (c1, c2, fim)) in curvas.enumerated() {
            p.addCurve(to: m(fim), control1: m(c1), control2: m(c2))
            if j < retas.count { p.addLine(to: m(retas[j])) }
        }
    }
    p.closeSubpath()
    return p
}

/// Brilho de quatro pontas (o mesmo do logo da barra lateral).
func brilho(_ c: CGPoint, _ R: CGFloat, fino: CGFloat = 0.2) -> CGPath {
    let r = R * fino
    let p = CGMutablePath()
    p.move(to: CGPoint(x: c.x, y: c.y - R))
    p.addQuadCurve(to: CGPoint(x: c.x + R, y: c.y), control: CGPoint(x: c.x + r, y: c.y - r))
    p.addQuadCurve(to: CGPoint(x: c.x, y: c.y + R), control: CGPoint(x: c.x + r, y: c.y + r))
    p.addQuadCurve(to: CGPoint(x: c.x - R, y: c.y), control: CGPoint(x: c.x - r, y: c.y + r))
    p.addQuadCurve(to: CGPoint(x: c.x, y: c.y - R), control: CGPoint(x: c.x - r, y: c.y - r))
    p.closeSubpath()
    return p
}

/// Linha ondulada de x0 a x1 (senoide amostrada).
func onda(_ p: CGMutablePath, de x0: CGFloat, ate x1: CGFloat, y: CGFloat, amp: CGFloat,
          comprimento: CGFloat, fase: CGFloat) {
    let passos = 90
    for i in 0...passos {
        let x = x0 + (x1 - x0) * CGFloat(i) / CGFloat(passos)
        let pt = CGPoint(x: x, y: y + amp * sin((x / comprimento) * 2 * .pi + fase))
        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
}

func elipse(_ c: CGContext, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) {
    c.addEllipse(in: CGRect(x: x - w / 2, y: y - h / 2, width: w, height: h))
}

func preencher(_ c: CGContext, _ p: CGPath, _ cor: CGColor) {
    c.addPath(p); c.setFillColor(cor); c.fillPath()
}

func contornar(_ c: CGContext, _ p: CGPath, _ largura: CGFloat, _ cor: CGColor = TINTA) {
    c.addPath(p); c.setStrokeColor(cor); c.setLineWidth(largura); c.strokePath()
}

// MARK: - tamanhos grandes (64 px ou mais), grade de 1024

struct Estilo {
    var cheio: Bool           // 128 px ou mais: raios de sol, rabiscos, bolhas
    var contorno: CGFloat     // borda do quadrado
    var sombra: CGFloat       // deslocamento da sombra dura do quadrado
    var traco: CGFloat        // contorno da bateria
    var sombraBat: CGFloat    // sombra dura da bateria
    var largura: CGFloat      // corpo da bateria
    var altura: CGFloat
    var raio: CGFloat
    var inclinacao: CGFloat   // graus (negativo = sobe à direita)
    var centro: CGPoint
    var nivel: CGFloat        // topo do líquido, relativo ao centro da bateria
    var onda: CGFloat         // amplitude da onda do líquido
}

func estilo(px: Int) -> Estilo {
    if px < 128 {
        return Estilo(cheio: false, contorno: 40, sombra: 32, traco: 36, sombraBat: 28,
                      largura: 612, altura: 420, raio: 116, inclinacao: -5,
                      centro: CGPoint(x: 480, y: 528), nivel: 58, onda: 16)
    }
    return Estilo(cheio: true, contorno: 30, sombra: 24, traco: 26, sombraBat: 22,
                  largura: 580, altura: 392, raio: 108, inclinacao: -6,
                  centro: CGPoint(x: 486, y: 532), nivel: 54, onda: 17)
}

func desenharGrande(_ c: CGContext, px: Int) {
    let e = estilo(px: px)
    c.setLineCap(.round)
    c.setLineJoin(.round)

    // macOS 26 (Tahoe) põe numa caixa cinza o ícone que foge do molde: o desenho inteiro fica
    // dentro do quadrado de 824 com cantos contínuos. A tinta preta enche o molde e a cara dourada
    // fica dentro dele, encostada no alto à esquerda: a borda grossa embaixo e à direita é a
    // sombra dura do cartum, sem sair do formato.
    let molde = cantosContinuos(CGRect(x: 100, y: 100, width: 824, height: 824), 185.4)
    let lado = 824 - 2 * e.contorno - e.sombra
    let quadrado = cantosContinuos(CGRect(x: 100 + e.contorno, y: 100 + e.contorno, width: lado, height: lado),
                                   185.4 - e.contorno)
    preencher(c, molde, TINTA)
    preencher(c, quadrado, OURO)

    if e.cheio {
        // raios de sol atrás do mascote
        c.saveGState()
        c.addPath(quadrado); c.clip()
        let n = 14
        let raios = CGMutablePath()
        for i in 0..<n {
            let a0 = CGFloat(i) * 2 * .pi / CGFloat(n) - .pi / 2 + 0.12
            let a1 = a0 + .pi / CGFloat(n)
            raios.move(to: e.centro)
            raios.addLine(to: CGPoint(x: e.centro.x + 1300 * cos(a0), y: e.centro.y + 1300 * sin(a0)))
            raios.addLine(to: CGPoint(x: e.centro.x + 1300 * cos(a1), y: e.centro.y + 1300 * sin(a1)))
            raios.closeSubpath()
        }
        preencher(c, raios, OURO_CLARO)
        c.restoreGState()
    }

    desenharBateria(c, e)

    // estrelinhas
    let grande = brilho(CGPoint(x: 768, y: 226), e.cheio ? 74 : 84)
    preencher(c, grande, BRANCO)
    contornar(c, grande, e.traco * 0.8)
    if e.cheio {
        let pequena = brilho(CGPoint(x: 852, y: 352), 32)
        preencher(c, pequena, BRANCO)
        contornar(c, pequena, e.traco * 0.62)

        // rabiscos de caderno: um "+", duas bolinhas e três risquinhos de "tcharam"
        c.setStrokeColor(TINTA); c.setLineWidth(15)
        let mais = CGPoint(x: 214, y: 226)
        c.move(to: CGPoint(x: mais.x - 26, y: mais.y)); c.addLine(to: CGPoint(x: mais.x + 26, y: mais.y))
        c.move(to: CGPoint(x: mais.x, y: mais.y - 26)); c.addLine(to: CGPoint(x: mais.x, y: mais.y + 26))
        c.strokePath()
        elipse(c, 790, 842, 34, 34); c.strokePath()
        elipse(c, 186, 812, 22, 22); c.strokePath()
        c.setLineWidth(18)
        let origem = CGPoint(x: 218, y: 372)
        let risquinhos: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (-1.0, -0.12, 30, 82), (-0.72, -0.7, 26, 74), (-0.12, -1.0, 30, 78)]
        for (dx, dy, a, b) in risquinhos {
            let len = sqrt(dx * dx + dy * dy)
            let ux = dx / len, uy = dy / len
            c.move(to: CGPoint(x: origem.x + ux * a, y: origem.y + uy * a))
            c.addLine(to: CGPoint(x: origem.x + ux * b, y: origem.y + uy * b))
        }
        c.strokePath()
    }

    // por cima de tudo, a borda de tinta de novo (o que passou da cara dourada fica coberto)
    c.saveGState()
    c.addPath(molde); c.addPath(quadrado); c.clip(using: .evenOdd)
    preencher(c, molde, TINTA)
    c.restoreGState()
}

func desenharBateria(_ c: CGContext, _ e: Estilo) {
    let W = e.largura, H = e.altura
    let corpo = cantosContinuos(CGRect(x: -W / 2, y: -H / 2, width: W, height: H), e.raio)
    let pinoW: CGFloat = 56
    let pinoH: CGFloat = H * 0.38
    let pino = CGPath(roundedRect: CGRect(x: W / 2 - 30, y: -pinoH / 2, width: pinoW + 30, height: pinoH),
                      cornerWidth: 26, cornerHeight: 26, transform: nil)
    let giro = e.inclinacao * .pi / 180

    // sombra dura (deslocada na tela, não no giro)
    c.saveGState()
    c.translateBy(x: e.centro.x + e.sombraBat, y: e.centro.y + e.sombraBat)
    c.rotate(by: giro)
    c.addPath(corpo); c.addPath(pino); c.setFillColor(TINTA); c.fillPath()
    c.restoreGState()

    c.saveGState()
    c.translateBy(x: e.centro.x, y: e.centro.y)
    c.rotate(by: giro)

    // pino (polo positivo) e corpo branco
    preencher(c, pino, BRANCO)
    contornar(c, pino, e.traco)
    preencher(c, corpo, BRANCO)

    // líquido com onda (e uma sombrinha do lado direito pra dar volume)
    c.saveGState()
    c.addPath(corpo); c.clip()
    preencher(c, corpo, SOMBRA_BRANCO)
    c.saveGState()
    c.translateBy(x: -44, y: -6)
    preencher(c, corpo, BRANCO)
    c.restoreGState()
    let x0 = -W / 2 - 40, x1 = W / 2 + 40
    let comp = W * 0.55
    let liq = CGMutablePath()
    onda(liq, de: x0, ate: x1, y: e.nivel, amp: e.onda, comprimento: comp, fase: 0.6)
    liq.addLine(to: CGPoint(x: x1, y: H)); liq.addLine(to: CGPoint(x: x0, y: H)); liq.closeSubpath()
    preencher(c, liq, VERDE)
    // reflexo mais claro logo abaixo da superfície
    let reflexo = CGMutablePath()
    onda(reflexo, de: -W * 0.36, ate: -W * 0.08, y: e.nivel + 34, amp: e.onda, comprimento: comp, fase: 0.6)
    contornar(c, reflexo, e.cheio ? 16 : 20, VERDE_CLARO)
    if e.cheio {
        c.setFillColor(BRANCO)
        elipse(c, W * 0.30, H * 0.30, 26, 26); elipse(c, W * 0.37, H * 0.20, 15, 15)
        elipse(c, -W * 0.33, H * 0.34, 16, 16)
        c.fillPath()
    }
    // superfície com traço de tinta
    let sup = CGMutablePath()
    onda(sup, de: x0, ate: x1, y: e.nivel, amp: e.onda, comprimento: comp, fase: 0.6)
    contornar(c, sup, e.traco * 0.62)
    c.restoreGState()

    // rosto
    let olhoY = -H * 0.15
    c.setFillColor(ROSA)
    elipse(c, -190, 8, 76, 40); elipse(c, 190, 8, 76, 40); c.fillPath()
    c.setFillColor(TINTA)
    elipse(c, -102, olhoY, 56, 74); elipse(c, 102, olhoY, 56, 74); c.fillPath()
    c.setFillColor(BRANCO)
    elipse(c, -93, olhoY - 16, 20, 20); elipse(c, 111, olhoY - 16, 20, 20); c.fillPath()
    if e.cheio {
        elipse(c, -109, olhoY + 16, 9, 9); elipse(c, 95, olhoY + 16, 9, 9); c.fillPath()
    }
    boca(c, largura: 140, topo: 2, fundo: 98, traco: e.cheio ? 20 : 26)

    // contorno do corpo por cima
    contornar(c, corpo, e.traco)
    c.restoreGState()
}

/// Sorriso aberto: um "D" deitado, preto, com língua rosa.
func boca(_ c: CGContext, largura: CGFloat, topo: CGFloat, fundo: CGFloat, traco: CGFloat) {
    let m = largura / 2
    let p = CGMutablePath()
    p.move(to: CGPoint(x: -m, y: topo))
    p.addQuadCurve(to: CGPoint(x: m, y: topo), control: CGPoint(x: 0, y: topo + 14))
    p.addCurve(to: CGPoint(x: -m, y: topo), control1: CGPoint(x: m * 0.96, y: fundo * 1.3),
               control2: CGPoint(x: -m * 0.96, y: fundo * 1.3))
    p.closeSubpath()
    preencher(c, p, TINTA)
    c.saveGState()
    c.addPath(p); c.clip()
    c.setFillColor(LINGUA)
    elipse(c, 0, topo + (fundo - topo) * 1.02, largura * 0.62, (fundo - topo) * 0.8); c.fillPath()
    c.restoreGState()
    contornar(c, p, traco)
}

// MARK: - 32 px, alinhado ao pixel (grade de 32)

func desenhar32(_ c: CGContext) {
    func q(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ cor: CGColor) {
        c.setFillColor(cor); c.fill(CGRect(x: x, y: y, width: w, height: h))
    }
    // quadrado: contorno de 2 px e sombra dura de 2 px
    preencher(c, cantosContinuos(CGRect(x: 4, y: 4, width: 26, height: 26), 6.2), TINTA)
    preencher(c, cantosContinuos(CGRect(x: 2, y: 2, width: 26, height: 26), 6.2), TINTA)
    preencher(c, cantosContinuos(CGRect(x: 4, y: 4, width: 22, height: 22), 4.4), OURO)

    // bateria: corpo com contorno de 2 px e pino à direita
    preencher(c, CGPath(roundedRect: CGRect(x: 21, y: 12, width: 3, height: 6), cornerWidth: 1,
                        cornerHeight: 1, transform: nil), TINTA)
    preencher(c, CGPath(roundedRect: CGRect(x: 6, y: 8, width: 16, height: 14), cornerWidth: 4,
                        cornerHeight: 4, transform: nil), TINTA)
    let miolo = CGPath(roundedRect: CGRect(x: 8, y: 10, width: 12, height: 10), cornerWidth: 2,
                       cornerHeight: 2, transform: nil)
    preencher(c, miolo, BRANCO)
    c.saveGState()
    c.addPath(miolo); c.clip()
    q(8, 17, 12, 3, VERDE)          // líquido
    c.restoreGState()

    // rosto
    q(10, 11, 2, 3, TINTA); q(16, 11, 2, 3, TINTA)      // olhos
    q(11, 11, 1, 1, BRANCO); q(17, 11, 1, 1, BRANCO)    // brilho do olho
    q(8, 15, 2, 1, ROSA); q(18, 15, 2, 1, ROSA)         // bochechas
    q(12, 15, 4, 1, TINTA); q(13, 16, 2, 1, TINTA)      // sorriso
}

// MARK: - 16 px, pixel a pixel (grade de 16)

func desenhar16(_ c: CGContext) {
    func q(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ cor: CGColor) {
        c.setFillColor(cor); c.fill(CGRect(x: x, y: y, width: w, height: h))
    }
    preencher(c, cantosContinuos(CGRect(x: 2, y: 2, width: 13, height: 13), 3.1), TINTA)
    preencher(c, cantosContinuos(CGRect(x: 1, y: 1, width: 13, height: 13), 3.1), TINTA)
    preencher(c, cantosContinuos(CGRect(x: 2, y: 2, width: 11, height: 11), 2.2), OURO)

    // bateria 8×7 com cantos cortados, pino de 1 px
    q(4, 4, 6, 7, TINTA); q(3, 5, 8, 5, TINTA)
    q(11, 6, 1, 3, TINTA)
    q(4, 5, 6, 5, BRANCO)
    q(4, 9, 6, 1, VERDE)
    // carinha: dois olhos e um sorrisinho
    q(5, 6, 1, 1, TINTA); q(8, 6, 1, 1, TINTA)
    q(6, 8, 2, 1, TINTA)
}

// MARK: - imagem e arquivos

func imagem(px: Int) -> CGImage {
    guard let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        falhar("não consegui criar o contexto de \(px) px")
    }
    ctx.interpolationQuality = .high
    ctx.setShouldAntialias(true)
    // origem em cima à esquerda, y pra baixo, na grade de cada faixa de tamanho
    let grade: CGFloat = px <= 16 ? 16 : (px <= 32 ? 32 : 1024)
    let s = CGFloat(px) / grade
    ctx.translateBy(x: 0, y: CGFloat(px))
    ctx.scaleBy(x: s, y: -s)
    switch grade {
    case 16: desenhar16(ctx)
    case 32: desenhar32(ctx)
    default: desenharGrande(ctx, px: px)
    }
    guard let img = ctx.makeImage() else { falhar("não consegui gerar a imagem de \(px) px") }
    return img
}

func salvarPNG(_ img: CGImage, _ caminho: String, dpi: Int = 72) {
    let url = URL(fileURLWithPath: caminho) as CFURL
    guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else {
        falhar("não consegui abrir \(caminho) pra escrita")
    }
    let props: [CFString: Any] = [kCGImagePropertyDPIWidth: dpi, kCGImagePropertyDPIHeight: dpi]
    CGImageDestinationAddImage(dest, img, props as CFDictionary)
    if !CGImageDestinationFinalize(dest) { falhar("não consegui gravar \(caminho)") }
}

func falhar(_ msg: String) -> Never {
    FileHandle.standardError.write(("icone: " + msg + "\n").data(using: .utf8)!)
    exit(1)
}

/// Folha de conferência: tamanhos reais (1 px = 1 px) e 16/32/64 ampliados sem suavizar,
/// num fundo claro e num escuro (Finder e Dock nos dois temas).
func folha(_ caminho: String) {
    let W = 1640, H = 700
    guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { falhar("folha") }
    func pos(_ x: Int, _ topo: Int, _ w: Int, _ h: Int) -> CGRect {
        CGRect(x: x, y: H - topo - h, width: w, height: h)
    }
    ctx.interpolationQuality = .none
    for (i, fundo) in [UInt32(0xececec), 0x1e1e1e].enumerated() {
        let t0 = i * 350
        ctx.setFillColor(cor(fundo)); ctx.fill(pos(0, t0, W, 350))
        var x = 24
        for p in [16, 32, 64, 128, 256] {
            ctx.draw(imagem(px: p), in: pos(x, t0 + 175 - p / 2, p, p))
            x += p + 24
        }
        x += 16
        for (p, z) in [(16, 12), (32, 6), (64, 3)] {
            let l = p * z
            ctx.draw(imagem(px: p), in: pos(x, t0 + 175 - l / 2, l, l))
            x += l + 24
        }
    }
    guard let img = ctx.makeImage() else { falhar("folha") }
    salvarPNG(img, caminho)
}

// MARK: - main

let args = CommandLine.arguments
if args.count >= 4 && args[1] == "--png" {
    guard let p = Int(args[2]), p > 0 else { falhar("uso: icone --png <pontos> <saida.png> [escala]") }
    let esc = args.count >= 5 ? max(1, Int(args[4]) ?? 1) : 1
    salvarPNG(imagem(px: p * esc), args[3], dpi: 72 * esc)
} else if args.count >= 3 && args[1] == "--folha" {
    folha(args[2])
} else if args.count == 2 && !args[1].hasPrefix("-") {
    let pasta = args[1]
    do {
        try FileManager.default.createDirectory(atPath: pasta, withIntermediateDirectories: true)
    } catch { falhar("não consegui criar \(pasta): \(error.localizedDescription)") }
    for p in [16, 32, 128, 256, 512] {
        salvarPNG(imagem(px: p), "\(pasta)/icon_\(p)x\(p).png", dpi: 72)
        salvarPNG(imagem(px: p * 2), "\(pasta)/icon_\(p)x\(p)@2x.png", dpi: 144)
    }
} else {
    falhar("uso: icone <pasta.iconset> | --png <pontos> <saida.png> [escala] | --folha <saida.png>")
}
