//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import AppKit

/// The native Settings window (Cmd-,).
struct SettingsScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var s = model.settings
        Form {
            Section(NSLocalizedString("Language", comment: "")) {
                Picker(NSLocalizedString("Interface language", comment: ""),
                       selection: Binding(
                        get: { model.localizer.code ?? "system" },
                        set: { model.localizer.choose($0 == "system" ? nil : $0) }
                       )) {
                    Text(NSLocalizedString("System default", comment: "")).tag("system")
                    Divider()
                    ForEach(Localizer.all) { lang in
                        Text(lang.native).tag(lang.code)
                    }
                }
                if model.localizer.changed {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.clockwise.circle.fill").foregroundStyle(.orange)
                        Text(NSLocalizedString("Relaunch to apply the new language.", comment: ""))
                            .font(.footnote)
                        Spacer()
                        Button(NSLocalizedString("Relaunch now", comment: "")) { model.localizer.relaunch() }
                            .controlSize(.small)
                    }
                }
            }

            Section(NSLocalizedString("Vault", comment: "")) {
                Picker(NSLocalizedString("Keep cleaned items for", comment: ""), selection: $s.retentionDays) {
                    Text(NSLocalizedString("Delete immediately (no vault)", comment: "")).tag(0)
                    Text(NSLocalizedString("3 days", comment: "")).tag(3)
                    Text(NSLocalizedString("7 days", comment: "")).tag(7)
                    Text(NSLocalizedString("30 days", comment: "")).tag(30)
                }
                Text(NSLocalizedString("Cleaned items go to a restorable vault until the window closes — space is truly freed when they leave it.", comment: ""))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section(NSLocalizedString("Auto sweep", comment: "")) {
                Toggle(NSLocalizedString("Sweep safe items automatically", comment: ""), isOn: $s.autoSweep)
                Picker(NSLocalizedString("Frequency", comment: ""), selection: $s.sweepEveryDays) {
                    Text(NSLocalizedString("Daily", comment: "")).tag(1)
                    Text(NSLocalizedString("Weekly", comment: "")).tag(7)
                }.pickerStyle(.segmented).disabled(!s.autoSweep)
                Toggle(NSLocalizedString("Launch Kamurafy at login", comment: ""), isOn: $s.launchAtLogin)
                Text(NSLocalizedString("Only pre-selected safe items are swept. You get a notification with the amount freed. Purge never runs automatically.", comment: ""))
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section(NSLocalizedString("Protected items", comment: "")) {
                Text(NSLocalizedString("Paths here are never touched by any clean.", comment: ""))
                    .font(.footnote).foregroundStyle(.secondary)
                ForEach(model.exclusions.paths, id: \.self) { path in
                    HStack {
                        Image(systemName: "lock.fill").foregroundStyle(Color.mint).font(.caption)
                        Text(path).font(.caption).lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Button {
                            model.exclusions.remove(path)
                        } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                            .buttonStyle(.plain)
                    }
                }
                Button(NSLocalizedString("Add folder or file…", comment: "")) { addExclusion() }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func addExclusion() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        if panel.runModal() == .OK {
            for url in panel.urls { model.exclusions.add(url) }
        }
    }
}