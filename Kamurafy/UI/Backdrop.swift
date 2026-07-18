//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI

/// The window backdrop: a graphite field with two slow-drifting mint/sky glows.
///
/// Performance: the glows are static radial gradients moved by Core Animation
/// `repeatForever` transforms — the render server animates cached layers, the
/// app never redraws a frame. Freezes entirely under Reduce Motion.
struct Backdrop: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        ZStack {
            Color.ink

            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                glow(.mint, size: w * 0.7)
                    .offset(x: (drift ? 0.12 : -0.16) * w, y: (drift ? -0.10 : 0.06) * h)
                glow(.sky, size: w * 0.6)
                    .offset(x: (drift ? -0.14 : 0.16) * w, y: (drift ? 0.12 : -0.08) * h)
            }
            .opacity(0.5)
            .blur(radius: 8)

            // Edge vignette keeps the corners grounded.
            RadialGradient(colors: [.clear, Color.ink.opacity(0.85)],
                           center: .center, startRadius: 220, endRadius: 780)
        }
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 16).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }

    private func glow(_ color: Color, size: CGFloat) -> some View {
        Circle()
            .fill(RadialGradient(colors: [color.opacity(0.4), color.opacity(0)],
                                 center: .center, startRadius: 0, endRadius: size / 2))
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}