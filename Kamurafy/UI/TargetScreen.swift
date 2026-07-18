//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import KamurafyKit

/// The per-target screen: inspect → glass list → erase.
struct TargetScreen: View {
    @Bindable var pane: TargetPane
    @Environment(AppModel.self) private var model
    @State private var confirming = false
    @State private var query = ""

    private var visible: [JunkItem] {
        guard !query.isEmpty else { return pane.items }
        return pane.items.filter {
            $0.label.localizedCaseInsensitiveContains(query)
            || $0.url.path.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
            if pane.inspected && !pane.items.isEmpty { footer }
        }
        .sheet(isPresented: $confirming) {
            ConfirmSheet(count: pane.chosenCount, bytes: pane.chosenBytes,
                         retentionDays: model.settings.retentionDays) {
                Task {
                    await pane.erase(mode: model.settings.eraseMode(via: pane.target.name))
                    model.stats.record(freed: pane.lastReclaimed ?? 0)
                }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            Image(systemName: pane.target.glyph)
                .font(.title2).foregroundStyle(Color.mint)
                .frame(width: 50, height: 50).surface(14)
            VStack(alignment: .leading, spacing: 3) {
                Text(LocalizedStringKey(pane.target.name))
                    .font(.system(size: 25, weight: .bold, design: .rounded))
                Text(LocalizedStringKey(pane.target.blurb))
                    .font(.callout).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Button(pane.inspected ? NSLocalizedString("Rescan", comment: "") : NSLocalizedString("Scan", comment: "")) {
                Task { await pane.inspect() }
            }
            .buttonStyle(SignalButton(tint: .sky))
            .disabled(pane.inspecting || pane.erasing)
        }
        .padding(.horizontal, 28).padding(.top, 32).padding(.bottom, 16)
    }

    @ViewBuilder
    private var content: some View {
        if pane.inspecting {
            fill { ProgressView().controlSize(.large).tint(.mint) }
        } else if !pane.inspected {
            fill {
                Empty(glyph: "sparkles", title: NSLocalizedString("Ready when you are", comment: ""),
                      note: NSLocalizedString("Scan to see what can be freed.", comment: ""))
            }
        } else if pane.items.isEmpty {
            fill {
                Empty(glyph: "checkmark.seal.fill",
                      title: pane.lastReclaimed.map { String(format: NSLocalizedString("Freed %@", comment: ""), humanBytes($0)) }
                             ?? NSLocalizedString("All clean", comment: ""),
                      note: NSLocalizedString("Nothing to clean here right now.", comment: ""))
            }
        } else {
            VStack(spacing: 0) {
                if pane.items.count > 8 {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Color.ink3).font(.caption)
                        TextField(NSLocalizedString("Filter by name or path", comment: ""), text: $query)
                            .textFieldStyle(.plain)
                    }
                    .padding(9).surface(10)
                    .padding(.horizontal, 28).padding(.bottom, 8)
                }
                ScrollView {
                    LazyVStack(spacing: 7) {
                        ForEach(visible) { item in
                            Row(item: item) { pane.toggle(item) }
                        }
                    }
                    .padding(.horizontal, 28).padding(.bottom, 12)
                }
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 16) {
            Button(pane.allChosen ? NSLocalizedString("Deselect all", comment: "") : NSLocalizedString("Select all", comment: "")) {
                withAnimation { pane.setAll(!pane.allChosen) }
            }
            .buttonStyle(.plain).foregroundStyle(Color.mint)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(humanBytes(pane.chosenBytes))
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .contentTransition(.numericText())
                Text(String(format: NSLocalizedString("%lld selected", comment: ""), pane.chosenCount))
                    .font(.caption).foregroundStyle(Color.ink3)
            }
            Button {
                confirming = true
            } label: {
                if pane.erasing {
                    Text(NSLocalizedString("Cleaning…", comment: "")).frame(width: 90)
                } else {
                    Text(NSLocalizedString("Clean", comment: "")).frame(width: 90)
                }
            }
            .buttonStyle(SignalButton(tint: .coral))
            .disabled(pane.chosenCount == 0 || pane.erasing)
        }
        .padding(.horizontal, 28).padding(.vertical, 16)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Rectangle().fill(.white.opacity(0.06)).frame(height: 1) }
    }

    private func fill<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        VStack { Spacer(); c(); Spacer() }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Row

private struct Row: View {
    let item: JunkItem
    let toggle: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 13) {
                Image(systemName: item.selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.selected ? Color.mint : Color.ink3)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label).font(.callout).lineLimit(1).truncationMode(.middle)
                    Text(item.url.deletingLastPathComponent().path)
                        .font(.caption2).foregroundStyle(Color.ink3).lineLimit(1).truncationMode(.middle)
                }
                Spacer()
                Text(humanBytes(item.bytes))
                    .font(.system(.callout, design: .monospaced)).foregroundStyle(Color.ink2)
            }
            .padding(.vertical, 10).padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(hover ? 0.06 : 0.03)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

// MARK: - Empty state

struct Empty: View {
    let glyph: String
    let title: String
    let note: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: glyph).font(.system(size: 42))
                .foregroundStyle(LinearGradient(colors: [.mint, .sky], startPoint: .top, endPoint: .bottom))
            Text(title).font(.system(.title3, design: .rounded).weight(.semibold))
            Text(note).font(.footnote).foregroundStyle(Color.ink2).multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

// MARK: - Confirm

struct ConfirmSheet: View {
    let count: Int
    let bytes: Int64
    var retentionDays: Int = 0
    let onConfirm: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: retentionDays > 0 ? "clock.arrow.circlepath" : "exclamationmark.triangle.fill")
                .font(.system(size: 38))
                .foregroundStyle(retentionDays > 0 ? Color.mint : Color.coral)
            Text(String(format: NSLocalizedString("Clean %lld items?", comment: ""), count))
                .font(.system(.title2, design: .rounded).weight(.bold))
            Text(retentionDays > 0
                 ? String(format: NSLocalizedString("Moves %@ to the Vault — restorable for %lld days.", comment: ""), humanBytes(bytes), retentionDays)
                 : String(format: NSLocalizedString("Permanently deletes %@. This can't be undone.", comment: ""), humanBytes(bytes)))
                .multilineTextAlignment(.center).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Button(NSLocalizedString("Cancel", comment: "")) { dismiss() }
                    .buttonStyle(GhostButton()).keyboardShortcut(.cancelAction)
                Button(retentionDays > 0 ? NSLocalizedString("Clean", comment: "") : NSLocalizedString("Delete", comment: "")) {
                    onConfirm(); dismiss()
                }
                .buttonStyle(SignalButton(tint: retentionDays > 0 ? .mint : .coral))
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(30).frame(width: 420)
        .background(Color.ink)
        .preferredColorScheme(.dark)
    }
}