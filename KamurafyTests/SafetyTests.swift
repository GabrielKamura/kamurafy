//  Kamurafy — Copyright (c) 2026 Gabriel Kamura. All Rights Reserved.
//  Unauthorized copying, modification, or distribution is prohibited.

import XCTest
@testable import KamurafyKit

/// The safety perimeter is the app's most important invariant. These tests pin
/// it down so a future change can't quietly widen what's deletable.
final class SafetyTests: XCTestCase {

    private var sandbox: URL!

    override func setUpWithError() throws {
        sandbox = FileManager.default.temporaryDirectory
            .appending(path: "kamurafy-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: sandbox, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: sandbox)
    }

    // MARK: SafeZone

    func test_zoneRootItself_isNeverDeletable() {
        // A zone root is a boundary, never a target.
        XCTAssertFalse(SafeZone.allows(sandbox, within: [sandbox]))
    }

    func test_childInsideZone_isAllowed() {
        let child = sandbox.appending(path: "cache.db")
        XCTAssertTrue(SafeZone.allows(child, within: [sandbox]))
    }

    func test_pathOutsideEveryZone_isRefused() {
        let outside = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Documents/keep.txt")
        XCTAssertFalse(SafeZone.allows(outside, within: [sandbox]))
    }

    func test_forbiddenPaths_areRefusedEvenInsideAZone() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        // Pretend a buggy target declared all of home as its zone.
        XCTAssertFalse(SafeZone.allows(home.appending(path: ".ssh"), within: [home]))
        XCTAssertFalse(SafeZone.allows(home.appending(path: "Library/Keychains"), within: [home]))
        XCTAssertFalse(SafeZone.allows(URL(fileURLWithPath: "/System/Library"), within: [URL(fileURLWithPath: "/")]))
    }

    // MARK: Eraser honors the perimeter

    func test_eraser_removesOnlySelected_andRefusesOutOfZone() throws {
        let a = sandbox.appending(path: "a"); let b = sandbox.appending(path: "b")
        try "x".write(to: a, atomically: true, encoding: .utf8)
        try "y".write(to: b, atomically: true, encoding: .utf8)

        let items = [
            JunkItem(url: a, bytes: 1, selected: true),
            JunkItem(url: b, bytes: 1, selected: false),                      // not selected → skipped
            JunkItem(url: URL(fileURLWithPath: "/etc/hosts"), bytes: 1, selected: true), // out of zone → refused
        ]
        let report = Eraser.erase(items, zones: [sandbox], mode: .shred)

        XCTAssertEqual(report.removed, 1)
        XCTAssertEqual(report.refused.count, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: a.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: b.path))       // deselected survived
        XCTAssertTrue(FileManager.default.fileExists(atPath: "/etc/hosts")) // refused, untouched
    }

    // MARK: Vault round-trip

    func test_vault_storeThenRestore_bringsFileBack() throws {
        let vault = Vault(base: sandbox.appending(path: "vault"))
        let f = sandbox.appending(path: "doc.txt")
        try "hello".write(to: f, atomically: true, encoding: .utf8)

        _ = Eraser.erase([JunkItem(url: f, bytes: 5)], zones: [sandbox], mode: .vault(vault, via: "test"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: f.path))
        XCTAssertEqual(vault.entries().count, 1)

        try vault.restore(vault.entries()[0])
        XCTAssertTrue(FileManager.default.fileExists(atPath: f.path))
        XCTAssertEqual(vault.entries().count, 0)
    }

    // MARK: Targets stay inside home

    func test_everyTargetZone_isInsideHome() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        for target in Catalog.targets {
            for zone in target.zones {
                XCTAssertTrue(isInside(zone, home) || zone == home,
                              "\(zone.path) should be within home")
                XCTAssertFalse(SafeZone.isForbidden(zone), "\(zone.path) must not be forbidden")
            }
        }
    }

    func test_targetKeys_areUnique() {
        let keys = Catalog.targets.map(\.key)
        XCTAssertEqual(Set(keys).count, keys.count)
    }

    // MARK: Orphan heuristic

    func test_orphanHeuristic() {
        let live: Set<String> = ["com.foo.Bar"]
        XCTAssertTrue(OrphansTarget.isOrphan("com.ghost.App", live: live))
        XCTAssertFalse(OrphansTarget.isOrphan("com.foo.Bar", live: live))   // installed
        XCTAssertFalse(OrphansTarget.isOrphan("com.apple.Safari", live: live)) // Apple
        XCTAssertFalse(OrphansTarget.isOrphan("Finder", live: live))        // not a bundle id
    }
}