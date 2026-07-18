//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import SwiftUI
import AppKit
import KamurafyKit

/// Full app uninstaller: pick an app, preview every trace, send it to the Vault.
struct RemoverScreen: View {
    @Environment(AppModel.self) private var model
    @State private var apps: [Application] = []
    @State private var query = ""
    @State private var loading = true
    @State private var chosen: Application?
    @State private var plan: [JunkItem] = []
    @State private var planning = false
    @State private var busy = false
    @State private var note: String?

    private var shown: [Application] {
        query.isEmpty ? apps : apps.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(28)
            if loading {
                ProgressView(NSLocalizedString("Listing apps…", comment: ""))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(shown) { app in row(app) }
                    }.padding(.horizontal, 28).padding(.bottom, 24)
                }
            }
        }
        .onAppear(perform: load)
        .sheet(item: $chosen) { app in sheet(app) }
    }

    private func load() {
        guard apps.isEmpty else { return }
        Task {
            apps = await Task.detached(priority: .userInitiated) { AppRemover.installed() }.value
            loading = false
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Kicker("Tools")
            Text("Uninstaller").font(.system(size: 32, weight: .bold, design: .rounded))
            Text(NSLocalizedString("Removes an app and every trace it left — preferences, caches, containers.", comment: ""))
                .foregroundStyle(Color.ink2)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.ink3)
                TextField(NSLocalizedString("Search apps", comment: ""), text: $query).textFieldStyle(.plain)
            }
            .padding(10).surface(10).frame(maxWidth: 320).padding(.top, 8)
            if let note { Text(note).font(.footnote).foregroundStyle(Color.mint).transition(.opacity) }
        }
    }

    private func row(_ app: Application) -> some View {
        Button { open(app) } label: {
            HStack(spacing: 12) {
                Image(nsImage: NSWorkspace.shared.icon(forFile: app.url.path))
                    .resizable().frame(width: 30, height: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.name).font(.callout.weight(.medium)).foregroundStyle(Color.ink1)
                    Text(app.bundleID).font(.caption2).foregroundStyle(Color.ink3)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.ink3)
            }
            .padding(.vertical, 8).padding(.horizontal, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(RoundedRectangle(cornerRadius: 11).fill(Color.white.opacity(0.03)))
    }

    private func open(_ app: Application) {
        chosen = app; plan = []; planning = true
        Task {
            plan = await Task.detached(priority: .userInitiated) { AppRemover.plan(app) }.value
            planning = false
        }
    }

    private func sheet(_ app: Application) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(nsImage: NSWorkspace.shared.icon(forFile: app.url.path)).resizable().frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(format: NSLocalizedString("Uninstall %@", comment: ""), app.name))
                        .font(.title3.weight(.semibold))
                    Text(app.bundleID).font(.caption).foregroundStyle(Color.ink2)
                }
                Spacer()
            }
            if planning {
                ProgressView(NSLocalizedString("Finding every trace…", comment: "")).frame(maxWidth: .infinity, minHeight: 120)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(plan) { item in
                            HStack {
                                Image(systemName: item.url.pathExtension == "app" ? "app.fill" : "doc.fill")
                                    .font(.caption).foregroundStyle(Color.ink3)
                                Text(item.url.path).font(.caption).lineLimit(1).truncationMode(.middle)
                                Spacer()
                                Text(humanBytes(item.bytes)).font(.caption.monospaced()).foregroundStyle(Color.ink2)
                            }
                        }
                    }
                }.frame(minHeight: 120, maxHeight: 240)
                Text(String(format: NSLocalizedString("%lld items · %@", comment: ""), plan.count, humanBytes(plan.reduce(0){$0+$1.bytes})))
                    .font(.footnote).foregroundStyle(Color.ink2)
            }
            HStack {
                Button(NSLocalizedString("Cancel", comment: "")) { chosen = nil }.buttonStyle(GhostButton()).keyboardShortcut(.cancelAction)
                Spacer()
                Button(busy ? NSLocalizedString("Uninstalling…", comment: "") : NSLocalizedString("Uninstall", comment: "")) { remove(app) }
                    .buttonStyle(SignalButton(tint: .coral))
                    .disabled(planning || busy || plan.isEmpty)
            }
        }
        .padding(24).frame(width: 520).background(Color.ink).preferredColorScheme(.dark)
    }

    private func remove(_ app: Application) {
        busy = true
        let items = plan, zones = AppRemover.zones(app)
        let mode = model.settings.eraseMode(via: "Uninstaller")
        Task {
            let rep = await Task.detached(priority: .userInitiated) {
                Eraser.erase(items, zones: zones, mode: mode)
            }.value
            busy = false; chosen = nil
            apps.removeAll { $0.id == app.id }
            withAnimation {
                note = rep.errored.isEmpty
                    ? String(format: NSLocalizedString("%@ uninstalled — %@ freed.", comment: ""), app.name, humanBytes(rep.reclaimed))
                    : String(format: NSLocalizedString("%@: %lld removed, %lld locked (quit it and retry).", comment: ""), app.name, rep.removed, rep.errored.count)
            }
        }
    }
}