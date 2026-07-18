//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import KamurafyKit

/// The home pane: the one-tap sweep hero, plus live RAM and disk gauges.
struct HomeScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let v = model.vitals.vitals
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                sweepCard
                if !model.sweep.perTarget.isEmpty {
                    breakdownCard
                }
                HStack(spacing: 16) {
                    ramCard(v)
                    diskCard(v)
                }
                purgeCard
                if model.stats.cleanCount > 0 {
                    lifetimeFooter
                }
            }
            .padding(28)
        }
        .scrollContentBackground(.hidden)
    }

    // MARK: Breakdown bar (where the space is)

    private var breakdownCard: some View {
        let entries = model.sweep.perTarget
            .compactMap { key, bytes -> (target: any CleanTarget, bytes: Int64)? in
                guard let t = model.target(key) else { return nil }
                return (t, bytes)
            }
            .sorted { $0.bytes > $1.bytes }
        let total = max(entries.reduce(Int64(0)) { $0 + $1.bytes }, 1)
        let palette: [Color] = [.mint, .sky, .amber, .coral, Color(0x9B8CFF), Color(0x36C9E3)]

        return VStack(alignment: .leading, spacing: 12) {
            Kicker("Where the space is")
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(Array(entries.enumerated()), id: \.offset) { i, e in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(palette[i % palette.count])
                            .frame(width: max(3, CGFloat(e.bytes) / CGFloat(total) * (geo.size.width - CGFloat(entries.count) * 2)))
                    }
                }
            }
            .frame(height: 14)

            // Legend
            FlowRow(spacing: 14) {
                ForEach(Array(entries.enumerated()), id: \.offset) { i, e in
                    HStack(spacing: 6) {
                        Circle().fill(palette[i % palette.count]).frame(width: 8, height: 8)
                        Text(LocalizedStringKey(e.target.name)).font(.caption).foregroundStyle(Color.ink2)
                        Text(humanBytes(e.bytes)).font(.caption.monospaced()).foregroundStyle(Color.ink3)
                    }
                }
            }
        }
        .padding(20).surface()
    }

    // MARK: Lifetime footer

    private var lifetimeFooter: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles").foregroundStyle(Color.mint)
            Text(String(format: NSLocalizedString("You've freed %@ across %lld cleanups.", comment: ""),
                        humanBytes(model.stats.lifetimeFreed), model.stats.cleanCount))
                .font(.footnote).foregroundStyle(Color.ink2)
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Kicker("Overview")
            Text("Home")
                .font(.system(size: 32, weight: .bold, design: .rounded))
            Text(NSLocalizedString("A clear look at your Mac — and one tap to clean it.", comment: ""))
                .foregroundStyle(Color.ink2)
        }
    }

    // MARK: One-tap sweep

    private var sweepCard: some View {
        let e = model.sweep
        return HStack(spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Kicker("One-tap sweep")
                Group {
                    switch e.stage {
                    case .rest:
                        Text(NSLocalizedString("Scan everything at once.", comment: ""))
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                        Text(NSLocalizedString("Caches, logs, developer junk and Trash — in parallel.", comment: ""))
                            .font(.footnote).foregroundStyle(Color.ink2)
                    case .inspecting:
                        Text(String(format: NSLocalizedString("Scanning… %lld/%lld", comment: ""), e.inspected, e.targetCount))
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                        Meter(value: Double(e.inspected) / Double(max(e.targetCount, 1)), tint: .sky).frame(width: 240)
                    case .primed:
                        Text(e.safeCount > 0
                             ? String(format: NSLocalizedString("%@ ready to free", comment: ""), humanBytes(e.safeBytes))
                             : NSLocalizedString("Nothing to sweep ✨", comment: ""))
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                            .foregroundStyle(e.safeCount > 0 ? Color.mint : Color.ink1)
                        Text(primedSub(e)).font(.footnote).foregroundStyle(Color.ink2)
                    case .sweeping:
                        Text(NSLocalizedString("Sweeping…", comment: ""))
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                        Meter(value: e.progress).frame(width: 240)
                    case .settled:
                        Text(String(format: NSLocalizedString("Freed %@", comment: ""), humanBytes(e.reclaimed)))
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.mint)
                        Text(settledSub(e)).font(.footnote).foregroundStyle(Color.ink2)
                    }
                }
                .animation(.easeOut(duration: 0.25), value: e.stage)
            }
            Spacer()
            sweepAction(e)
        }
        .padding(22)
        .surface(20)
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.mint.opacity(0.18), lineWidth: 1))
    }

    private func primedSub(_ e: SweepEngine) -> String {
        var p: [String] = []
        if e.safeCount > 0 { p.append(String(format: NSLocalizedString("%lld safe items", comment: ""), e.safeCount)) }
        if e.reviewCount > 0 { p.append(String(format: NSLocalizedString("+ %@ to review", comment: ""), humanBytes(e.reviewBytes))) }
        return p.isEmpty ? NSLocalizedString("You're all clean.", comment: "") : p.joined(separator: " · ")
    }

    private func settledSub(_ e: SweepEngine) -> String {
        var p = [String(format: NSLocalizedString("%lld items", comment: ""), e.removed)]
        if let n = e.purgeNote { p.append(n) }
        return p.joined(separator: " · ")
    }

    @ViewBuilder
    private func sweepAction(_ e: SweepEngine) -> some View {
        switch e.stage {
        case .rest:
            Button(NSLocalizedString("Scan", comment: "")) { Task { await e.inspectAll(model.targets) } }
                .buttonStyle(SignalButton(tint: .sky))
        case .inspecting, .sweeping:
            ProgressView().controlSize(.small).padding(.horizontal, 22)
        case .primed:
            if e.safeCount > 0 {
                Button(NSLocalizedString("Sweep", comment: "")) {
                    Task {
                        let swept = await e.sweepAll(model.targets, mode: model.settings.eraseMode(via: "Sweep"))
                        model.stats.record(freed: e.reclaimed)
                        for p in model.panes.values where p.inspected {
                            p.items.removeAll { swept.contains($0.path) }
                        }
                    }
                }
                .buttonStyle(SignalButton(tint: .mint))
            } else {
                Button(NSLocalizedString("Rescan", comment: "")) { Task { await e.inspectAll(model.targets) } }
                    .buttonStyle(GhostButton())
            }
        case .settled:
            HStack(spacing: 10) {
                if e.canUndo {
                    Button(NSLocalizedString("Undo", comment: "")) { Task { await e.undo() } }
                        .buttonStyle(GhostButton())
                }
                Button(NSLocalizedString("Rescan", comment: "")) { Task { await e.inspectAll(model.targets) } }
                    .buttonStyle(SignalButton(tint: .sky))
            }
        }
    }

    // MARK: Gauges

    private func ramCard(_ v: Vitals) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "memorychip").foregroundStyle(Color.mint); Kicker("Memory") }
            Text(humanBytes(v.ramUsed))
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .contentTransition(.numericText())
            Text(String(format: NSLocalizedString("of %@", comment: ""), humanBytes(v.ramTotal)))
                .font(.footnote).foregroundStyle(Color.ink3)
            Meter(value: v.ramPressure / 100, tint: ramTint(v)).padding(.top, 2)
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).surface()
    }

    private func ramTint(_ v: Vitals) -> Color {
        switch v.ramPressure { case ..<60: return .mint; case ..<82: return .amber; default: return .coral }
    }

    private func diskCard(_ v: Vitals) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "internaldrive").foregroundStyle(Color.sky); Kicker("Free disk") }
            Text(humanBytes(v.diskFree))
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .contentTransition(.numericText())
            Text(String(format: NSLocalizedString("of %@", comment: ""), humanBytes(v.diskTotal)))
                .font(.footnote).foregroundStyle(Color.ink3)
            Meter(value: v.diskUsedFraction, tint: .sky).padding(.top, 2)
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).surface()
    }

    // MARK: Purge

    @State private var purgeMsg: String?
    private var purgeCard: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Kicker("Optimize memory")
                Text(NSLocalizedString("Frees inactive disk cache from RAM. A real but short-lived effect — no magic.", comment: ""))
                    .font(.footnote).foregroundStyle(Color.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                if let purgeMsg {
                    Text(purgeMsg).font(.caption).foregroundStyle(Color.mint).transition(.opacity)
                }
            }
            Spacer()
            Button(NSLocalizedString("Run purge", comment: "")) {
                Task {
                    do { try MemoryPurge.run(); withAnimation { purgeMsg = NSLocalizedString("Done.", comment: "") } }
                    catch { withAnimation { purgeMsg = error.localizedDescription } }
                    model.vitals.refresh()
                }
            }
            .buttonStyle(GhostButton(tint: .mint))
        }
        .padding(20).surface()
    }
}