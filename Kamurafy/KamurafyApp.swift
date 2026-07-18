//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import AppKit

@main
struct KamurafyApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootShell()
                .environment(model)
                .frame(minWidth: 980, minHeight: 660)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)

        SwiftUI.Settings {
            SettingsScreen().environment(model).preferredColorScheme(.dark)
        }

        MenuBarExtra {
            MenuBar().environment(model)
        } label: {
            // Live RAM pressure right in the menu bar.
            let ram = Int(model.vitals.vitals.ramPressure)
            Image(systemName: "wind")
            Text(" \(ram)%")
        }
        .menuBarExtraStyle(.window)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu(NSLocalizedString("Clean", comment: "")) {
                Button(NSLocalizedString("Scan everything", comment: "")) {
                    Task { await model.sweep.inspectAll(model.targets) }
                }
                .keyboardShortcut("k", modifiers: .command)

                Button(NSLocalizedString("Sweep", comment: "")) {
                    Task {
                        let swept = await model.sweep.sweepAll(model.targets, mode: model.settings.eraseMode(via: "Sweep"))
                        model.stats.record(freed: model.sweep.reclaimed)
                        for p in model.panes.values where p.inspected {
                            p.items.removeAll { swept.contains($0.path) }
                        }
                    }
                }
                .keyboardShortcut(.deleteForward, modifiers: .command)
                .disabled(model.sweep.stage != .primed || model.sweep.safeCount == 0)

                Divider()

                Button(NSLocalizedString("Open Kamurafy", comment: "")) {
                    NSApp.activate(ignoringOtherApps: true)
                    NSApp.windows.first(where: { $0.canBecomeMain })?.makeKeyAndOrderFront(nil)
                }
                .keyboardShortcut("0", modifiers: .command)
            }
        }
    }
}

/// The menu-bar companion: vitals and a one-tap sweep without opening the window.
struct MenuBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let e = model.sweep
        let v = model.vitals.vitals
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "wind").foregroundStyle(Color.mint)
                Text("Kamurafy").font(.headline)
                Spacer()
            }
            HStack(spacing: 16) {
                stat("memorychip", NSLocalizedString("RAM", comment: ""), "\(Int(v.ramPressure))%")
                stat("internaldrive", NSLocalizedString("Free", comment: ""), humanBytes(v.diskFree))
            }
            Divider()
            switch e.stage {
            case .rest:
                action("sparkle.magnifyingglass", NSLocalizedString("Scan everything", comment: "")) {
                    Task { await e.inspectAll(model.targets) }
                }
            case .inspecting:
                ProgressView(String(format: NSLocalizedString("Scanning… %lld/%lld", comment: ""), e.inspected, e.targetCount))
                    .controlSize(.small)
            case .primed:
                if e.safeCount > 0 {
                    action("wind", String(format: NSLocalizedString("Sweep %@", comment: ""), humanBytes(e.safeBytes))) {
                        Task { await e.sweepAll(model.targets, mode: model.settings.eraseMode(via: "Sweep"), purge: false) }
                    }
                } else {
                    Text(NSLocalizedString("All clean ✨", comment: "")).font(.callout)
                }
            case .sweeping:
                ProgressView(value: e.progress) { Text(NSLocalizedString("Sweeping…", comment: "")) }.controlSize(.small)
            case .settled:
                Text(String(format: NSLocalizedString("Freed %@ ✨", comment: ""), humanBytes(e.reclaimed)))
                    .font(.callout.weight(.medium)).foregroundStyle(Color.mint)
                if e.canUndo { action("arrow.uturn.backward", NSLocalizedString("Undo", comment: "")) { Task { await e.undo() } } }
            }
            Divider()
            action("macwindow", NSLocalizedString("Open Kamurafy", comment: "")) {
                NSApp.activate(ignoringOtherApps: true)
                NSApp.windows.first(where: { $0.canBecomeMain })?.makeKeyAndOrderFront(nil)
            }
            action("power", NSLocalizedString("Quit", comment: "")) { NSApp.terminate(nil) }
        }
        .padding(14).frame(width: 258)
        .onAppear { model.vitals.begin() }
    }

    private func stat(_ glyph: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: glyph).font(.caption).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.caption2).foregroundStyle(.secondary)
                Text(value).font(.callout.weight(.semibold)).monospacedDigit()
            }
        }
    }

    private func action(_ glyph: String, _ title: String, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack { Image(systemName: glyph).frame(width: 16); Text(title); Spacer() }.contentShape(Rectangle())
        }
        .buttonStyle(.plain).font(.callout)
    }
}