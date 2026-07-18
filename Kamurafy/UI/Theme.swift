//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI

// MARK: - Palette
//
// "Signal" — graphite surfaces lit by a single mint accent, with a cool blue
// support tone and a coral for danger. Deliberately not a rainbow mesh:
// one confident accent reads as a tool, not a toy.

extension Color {
    init(_ hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    static let ink       = Color(0x0B0E11)   // window base
    static let panel     = Color(0x141A20)   // raised surface
    static let mint      = Color(0x36E3A6)   // primary accent / signal
    static let sky       = Color(0x4FB8FF)   // support accent
    static let coral     = Color(0xFF6B6B)   // danger
    static let amber     = Color(0xFFC24B)   // warning

    static let ink1      = Color(0xEAF2EE)   // primary text
    static let ink2      = Color(0x9AA6A0)   // secondary text
    static let ink3      = Color(0x5E6B65)   // tertiary text
}

// MARK: - Surfaces

extension View {
    /// A raised graphite panel: subtle fill, hairline border, top-edge highlight.
    func surface(_ radius: CGFloat = 18) -> some View {
        self.background(
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color.panel.opacity(0.72))
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.10), .white.opacity(0.02)],
                            startPoint: .top, endPoint: .bottom
                        ),
                        lineWidth: 1
                    )
            }
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        )
    }

    /// A soft colored halo behind an element (cheap: a blurred rounded rect).
    func halo(_ color: Color, radius: CGFloat = 18, strength: Double = 0.5) -> some View {
        background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(color)
                .blur(radius: radius)
                .opacity(strength)
        )
    }
}

// MARK: - Small building blocks

/// An uppercase mono label used above headings.
struct Kicker: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(NSLocalizedString(text, comment: "").uppercased())
            .font(.system(.caption2, design: .monospaced))
            .tracking(2.4)
            .foregroundStyle(Color.ink3)
    }
}

/// A slim progress meter.
struct Meter: View {
    var value: Double            // 0...1
    var tint: Color = .mint
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.07))
                Capsule()
                    .fill(LinearGradient(colors: [tint.opacity(0.85), tint], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 7)
    }
}

/// Primary filled action.
struct SignalButton: ButtonStyle {
    var tint: Color = .mint
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(
                Capsule().fill(
                    LinearGradient(colors: [tint, tint.opacity(0.8)], startPoint: .top, endPoint: .bottom)
                )
            )
            .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 0.5))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.65), value: configuration.isPressed)
    }
}

/// Quiet secondary action.
struct GhostButton: ButtonStyle {
    var tint: Color = .ink2
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .foregroundStyle(tint)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(Capsule().fill(Color.white.opacity(configuration.isPressed ? 0.10 : 0.06)))
    }
}

// MARK: - Flow layout (wraps items onto new lines)

struct FlowRow: Layout {
    var spacing: CGFloat = 10

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > maxW, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: maxW == .infinity ? x : maxW, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

// MARK: - Formatting

func humanBytes(_ bytes: Int64) -> String {
    let f = ByteCountFormatter()
    f.countStyle = .file
    return f.string(fromByteCount: bytes)
}
func humanBytes(_ bytes: UInt64) -> String { humanBytes(Int64(clamping: bytes)) }