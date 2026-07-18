//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation

/// Checks GitHub Releases for a newer build. One request, silent on failure.
@MainActor
@Observable
final class UpdateChecker {
    static let repo = "gabrielkamura/kamurafy"
    var newer: (version: String, url: URL)?

    func check() async {
        guard let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
              let api = URL(string: "https://api.github.com/repos/\(Self.repo)/releases/latest")
        else { return }
        var req = URLRequest(url: api)
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 10
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag = json["tag_name"] as? String,
              let link = (json["html_url"] as? String).flatMap(URL.init(string:))
        else { return }
        let latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        if Self.greater(latest, current) { newer = (latest, link) }
    }

    static func greater(_ a: String, _ b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l > r }
        }
        return false
    }
}