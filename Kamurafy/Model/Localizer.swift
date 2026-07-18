//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import Foundation
import Observation
import AppKit

/// In-app language override. macOS resolves `Localizable.strings` from the app's
/// language, which is fixed at launch — so a change is written to `AppleLanguages`
/// and applied with a quick relaunch (one tap).
@MainActor
@Observable
final class Localizer {

    /// A shippable language: BCP-47 code + its own native name.
    struct Language: Identifiable, Hashable {
        let code: String
        let native: String
        var id: String { code }
    }

    /// Every language Kamurafy ships strings for, grouped by region for the picker.
    static let all: [Language] = [
        // Americas
        .init(code: "en", native: "English"),
        .init(code: "pt-BR", native: "Português (Brasil)"),
        // Europe
        .init(code: "pt-PT", native: "Português (Portugal)"),
        .init(code: "es", native: "Español"),
        .init(code: "fr", native: "Français"),
        .init(code: "de", native: "Deutsch"),
        .init(code: "it", native: "Italiano"),
        .init(code: "nl", native: "Nederlands"),
        .init(code: "pl", native: "Polski"),
        .init(code: "sv", native: "Svenska"),
        .init(code: "cs", native: "Čeština"),
        .init(code: "ro", native: "Română"),
        .init(code: "el", native: "Ελληνικά"),
        .init(code: "uk", native: "Українська"),
        .init(code: "ru", native: "Русский"),
        .init(code: "tr", native: "Türkçe"),
        // Middle East (RTL)
        .init(code: "ar", native: "العربية"),
        .init(code: "he", native: "עברית"),
        .init(code: "fa", native: "فارسی"),
        // Asia
        .init(code: "hi", native: "हिन्दी"),
        .init(code: "th", native: "ไทย"),
        .init(code: "vi", native: "Tiếng Việt"),
        .init(code: "id", native: "Bahasa Indonesia"),
        .init(code: "ms", native: "Bahasa Melayu"),
        .init(code: "ja", native: "日本語"),
        .init(code: "ko", native: "한국어"),
        .init(code: "zh-Hans", native: "简体中文"),
        .init(code: "zh-Hant", native: "繁體中文"),
    ]

    /// The chosen override code, or nil to follow the system language.
    var code: String? {
        didSet {
            let d = UserDefaults.standard
            if let code { d.set([code], forKey: "AppleLanguages") }
            else { d.removeObject(forKey: "AppleLanguages") }
        }
    }

    /// True once the user changed the language this session (so we can offer relaunch).
    var changed = false

    init() {
        code = (UserDefaults.standard.array(forKey: "AppleLanguages") as? [String])?.first
    }

    func choose(_ newCode: String?) {
        guard newCode != code else { return }
        code = newCode
        changed = true
    }

    /// Relaunches the app so the new language takes effect everywhere.
    func relaunch() {
        let url = Bundle.main.bundleURL
        let config = NSWorkspace.OpenConfiguration()
        config.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in
            Task { @MainActor in NSApp.terminate(nil) }
        }
    }
}