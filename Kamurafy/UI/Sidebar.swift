//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI

/// The navigation rail.
struct Sidebar: View {
    @Environment(AppModel.self) private var model
    @Namespace private var pill

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            brand.padding(.bottom, 20)

            row(title: "Home", glyph: "square.grid.2x2", pane: .home)

            Kicker("Clean").padding(.leading, 12).padding(.top, 16).padding(.bottom, 6)
            ForEach(model.targets, id: \.key) { t in
                row(title: t.name, glyph: t.glyph, pane: .target(t.key))
            }

            Kicker("Tools").padding(.leading, 12).padding(.top, 16).padding(.bottom, 6)
            row(title: "Uninstaller", glyph: "xmark.bin", pane: .remover)
            row(title: "Vault", glyph: "clock.arrow.circlepath", pane: .vault)

            Spacer()

            SettingsLink {
                HStack(spacing: 11) {
                    Image(systemName: "gearshape")
                        .frame(width: 20)
                        .foregroundStyle(Color.ink2)
                    Text(LocalizedStringKey("Settings & Language"))
                        .font(.callout)
                        .foregroundStyle(Color.ink2)
                    Spacer()
                }
                .padding(.vertical, 8).padding(.horizontal, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Text("v\(appVersion) · Signal")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(Color.ink3)
                .padding(.leading, 12)
                .padding(.top, 4)
        }
        .padding(14)
        .padding(.top, 30)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(.ultraThinMaterial)
        .overlay(alignment: .trailing) { Rectangle().fill(.white.opacity(0.06)).frame(width: 1) }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    private func isSelected(_ pane: Pane) -> Bool { model.pane == pane }

    private func row(title: String, glyph: String, pane: Pane) -> some View {
        NavItem(
            title: title, glyph: glyph,
            selected: isSelected(pane), namespace: pill
        ) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.pane = pane }
        }
    }

    private var brand: some View {
        HStack(spacing: 10) {
            Image(systemName: "wind")
                .font(.title2.weight(.semibold))
                .foregroundStyle(LinearGradient(colors: [.mint, .sky], startPoint: .topLeading, endPoint: .bottomTrailing))
            Text("Kamurafy")
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(Color.ink1)
        }
        .padding(.leading, 6)
    }
}

private struct NavItem: View {
    let title: String
    let glyph: String
    let selected: Bool
    var namespace: Namespace.ID
    let tap: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 11) {
                Image(systemName: glyph)
                    .frame(width: 20)
                    .foregroundStyle(selected ? Color.mint : Color.ink2)
                Text(LocalizedStringKey(title))
                    .font(.callout.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Color.ink1 : Color.ink2)
                Spacer()
            }
            .padding(.vertical, 8).padding(.horizontal, 11)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(Color.mint.opacity(0.14))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(Color.mint.opacity(0.35), lineWidth: 1))
                        .matchedGeometryEffect(id: "pill", in: namespace)
                } else if hover {
                    RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white.opacity(0.05))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}