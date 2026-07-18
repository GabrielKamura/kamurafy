//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import KamurafyKit

/// The Vault: recently-cleaned items, restorable in one tap until they expire.
struct VaultScreen: View {
    @Environment(AppModel.self) private var model
    @State private var entries: [VaultEntry] = []
    @State private var busy = false

    private var total: Int64 { entries.reduce(0) { $0 + $1.bytes } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(28)
            if entries.isEmpty {
                Empty(glyph: "shield.checkered", title: NSLocalizedString("Vault is empty", comment: ""),
                      note: NSLocalizedString("Cleaned items rest here first — restore any of them in one tap.", comment: ""))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 7) {
                        ForEach(entries) { entry in row(entry) }
                    }
                    .padding(.horizontal, 28).padding(.bottom, 24)
                }
            }
        }
        .onAppear(perform: reload)
    }

    private func reload() { entries = Vault.shared.entries() }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Kicker("Safety vault")
                Text("Vault").font(.system(size: 32, weight: .bold, design: .rounded))
                Text(subtitle).foregroundStyle(Color.ink2)
            }
            Spacer()
            if !entries.isEmpty {
                HStack(spacing: 10) {
                    Button(NSLocalizedString("Restore all", comment: "")) {
                        act { for e in entries { try? Vault.shared.restore(e) } }
                    }.buttonStyle(SignalButton(tint: .mint))
                    Button(NSLocalizedString("Empty vault", comment: "")) {
                        act { Vault.shared.empty() }
                    }.buttonStyle(GhostButton(tint: .coral))
                }.disabled(busy)
            }
        }
    }

    private var subtitle: String {
        if entries.isEmpty { return NSLocalizedString("Cleaned items rest here before they're truly gone.", comment: "") }
        let base = String(format: NSLocalizedString("%lld items · %@", comment: ""), entries.count, humanBytes(total))
        let r = model.settings.retentionDays
        return r > 0 ? base + String(format: NSLocalizedString(" · auto-removed after %lld days", comment: ""), r) : base
    }

    private func row(_ e: VaultEntry) -> some View {
        HStack(spacing: 13) {
            Image(systemName: "doc.fill").foregroundStyle(Color.ink3)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.name).font(.callout.weight(.medium)).lineLimit(1)
                Text(e.origin).font(.caption2).foregroundStyle(Color.ink3).lineLimit(1).truncationMode(.middle)
            }
            Spacer()
            Text(e.via).font(.caption2).padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(Color.white.opacity(0.06))).foregroundStyle(Color.ink2)
            Text(humanBytes(e.bytes)).font(.system(.callout, design: .monospaced)).foregroundStyle(Color.ink2)
            Button { act { try? Vault.shared.restore(e) } } label: {
                Image(systemName: "arrow.uturn.backward.circle.fill").font(.title3).foregroundStyle(Color.mint)
            }.buttonStyle(.plain).help(NSLocalizedString("Restore", comment: ""))
            Button { act { Vault.shared.drop(e) } } label: {
                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Color.coral.opacity(0.85))
            }.buttonStyle(.plain).help(NSLocalizedString("Delete permanently", comment: ""))
        }
        .padding(.vertical, 11).padding(.horizontal, 14).surface(12)
    }

    private func act(_ work: @escaping @Sendable () -> Void) {
        busy = true
        Task {
            await Task.detached(priority: .userInitiated) { work() }.value
            reload(); busy = false
        }
    }
}