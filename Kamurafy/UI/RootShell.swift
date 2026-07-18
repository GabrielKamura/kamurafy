//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI

/// Top-level layout: backdrop, sidebar rail, detail pane.
struct RootShell: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            Backdrop()
            HStack(spacing: 0) {
                Sidebar().frame(width: 236)
                VStack(spacing: 0) {
                    if let n = model.updates.newer {
                        UpdateStrip(version: n.version, url: n.url)
                    }
                    detail
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .id(paneKey)
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.25), value: paneKey)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.ink)
        .foregroundStyle(Color.ink1)
        .tint(.mint)
        .onAppear { Task { await model.updates.check() } }
    }

    private var paneKey: String {
        switch model.pane {
        case .target(let k): return "t-\(k)"
        case .remover: return "remover"
        case .vault: return "vault"
        default: return "home"
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch model.pane {
        case .target(let key):
            if let pane = model.targetPane(key) { TargetScreen(pane: pane) } else { HomeScreen() }
        case .remover: RemoverScreen()
        case .vault: VaultScreen()
        default: HomeScreen()
        }
    }
}

/// Thin banner when a newer release exists.
private struct UpdateStrip: View {
    let version: String
    let url: URL
    @Environment(\.openURL) private var open
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.down.circle.fill").foregroundStyle(Color.mint)
            Text(String(format: NSLocalizedString("Kamurafy %@ is available.", comment: ""), version))
                .font(.callout)
            Button(NSLocalizedString("Get it", comment: "")) { open(url) }
                .buttonStyle(.plain).foregroundStyle(Color.mint).underline()
            Spacer()
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .background(Color.mint.opacity(0.08))
    }
}