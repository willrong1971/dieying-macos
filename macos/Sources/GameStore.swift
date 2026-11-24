import Foundation

final class GameStore {
    static let allowedKeys: Set<String> = [
        "mahjong-solitaire:v1", "mahjong-solitaire:voice", "mahjong-solitaire:tile-sounds",
        "mahjong-math-workshop:v1", "mahjong-math-workshop:v1:recovery", "mahjong-math-workshop:sounds"
    ]
    private let file: URL
    private(set) var values: [String: String]

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = support.appendingPathComponent("DieYing", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        file = folder.appendingPathComponent("saved-games.json")
        if let data = try? Data(contentsOf: file),
           let saved = try? JSONDecoder().decode([String: String].self, from: data) {
            values = saved.filter { Self.allowedKeys.contains($0.key) }
        } else { values = [:] }
    }

    func set(_ value: String?, for key: String) {
        guard Self.allowedKeys.contains(key), (value?.utf8.count ?? 0) <= 5_000_000 else { return }
        values[key] = value
        flush()
    }

    func replace(with snapshot: [String: String]) {
        values = snapshot.filter { Self.allowedKeys.contains($0.key) && $0.value.utf8.count <= 5_000_000 }
        flush()
    }

    func flush() {
        do { try JSONEncoder().encode(values).write(to: file, options: .atomic) }
        catch { NSLog("DieYing save: %@", error.localizedDescription) }
    }

    var base64Snapshot: String {
        (try? JSONSerialization.data(withJSONObject: values))?.base64EncodedString() ?? "e30="
    }
}
