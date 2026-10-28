import Foundation
import WebKit

/// Serves the app's immutable Web bundle without a browser or loopback server.
/// The same scheme and host are registered before every WKWebView is created,
/// so resources and the persistent website data store retain a stable origin.
@MainActor
final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    struct ResponsePlan {
        let url: URL
        let statusCode: Int
        let headers: [String: String]
        let headOnly: Bool
        let fileURL: URL?
        let byteRange: Range<Int>?
        let inlineBody: Data

        /// All file IO happens on the detached reader, not AppKit's main actor.
        nonisolated func readData() throws -> Data {
            if headOnly { return Data() }
            guard let fileURL else { return inlineBody }
            let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
            guard let byteRange else { return data }
            guard byteRange.lowerBound >= 0, byteRange.upperBound <= data.count else {
                throw CocoaError(.fileReadCorruptFile)
            }
            return data.subdata(in: byteRange)
        }
    }

    private struct PendingTask {
        let token: UUID
        let reader: Task<Data, Error>
    }

    let root: URL
    private var pending: [ObjectIdentifier: PendingTask] = [:]

    init(root: URL) {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        startTask(urlSchemeTask)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        stopTask(urlSchemeTask)
    }

    // Internal entry points also permit lifecycle tests without creating a UI.
    func startTask(_ task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task as AnyObject)
        pending.removeValue(forKey: id)?.reader.cancel()
        let token = UUID()
        let plan = responsePlan(for: task.request)
        let reader = Task.detached(priority: .userInitiated) { () throws -> Data in
            try Task.checkCancellation()
            let data = try plan.readData()
            try Task.checkCancellation()
            return data
        }
        pending[id] = PendingTask(token: token, reader: reader)

        Task { [weak self] in
            let result = await reader.result
            guard let self, self.pending[id]?.token == token else { return }
            switch result {
            case .success(let data):
                guard let response = HTTPURLResponse(url: plan.url, statusCode: plan.statusCode,
                    httpVersion: "HTTP/1.1", headerFields: plan.headers) else {
                    self.pending.removeValue(forKey: id)
                    task.didFailWithError(URLError(.badServerResponse))
                    return
                }
                task.didReceive(response)
                guard self.pending[id]?.token == token else { return }
                if !data.isEmpty { task.didReceive(data) }
                guard self.pending[id]?.token == token else { return }
                task.didFinish()
                self.pending.removeValue(forKey: id)
            case .failure(let error):
                self.pending.removeValue(forKey: id)
                task.didFailWithError(error)
            }
        }
    }

    func stopTask(_ task: WKURLSchemeTask) {
        // A stopped task is deliberately silent: WKURLSchemeTask raises an
        // exception if it receives any subsequent response/data/finish callback.
        pending.removeValue(forKey: ObjectIdentifier(task as AnyObject))?.reader.cancel()
    }

    func responsePlan(for request: URLRequest) -> ResponsePlan {
        let url = request.url ?? URL(string: "mahjong://app/")!
        let method = (request.httpMethod ?? "GET").uppercased()
        let headOnly = method == "HEAD"

        func error(_ status: Int, _ message: String, extra: [String: String] = [:]) -> ResponsePlan {
            let data = Data(message.utf8)
            var headers = Self.baseHeaders
            headers["Content-Type"] = "text/plain; charset=utf-8"
            headers["Content-Length"] = String(data.count)
            headers.merge(extra) { _, new in new }
            return ResponsePlan(url: url, statusCode: status, headers: headers, headOnly: headOnly,
                fileURL: nil, byteRange: nil, inlineBody: data)
        }

        guard method == "GET" || headOnly else {
            return error(405, "Method not allowed", extra: ["Allow": "GET, HEAD"])
        }
        guard url.scheme?.lowercased() == "mahjong", url.host?.lowercased() == "app",
              url.user == nil, url.password == nil, url.port == nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let decodedPath = components.percentEncodedPath.removingPercentEncoding else {
            return error(403, "Resource unavailable")
        }
        let pathComponents = decodedPath.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !decodedPath.contains("\0"), !decodedPath.contains("\\"),
              !pathComponents.contains(".."), !pathComponents.contains(".") else {
            return error(403, "Resource unavailable")
        }

        let relativePath = pathComponents.isEmpty ? "index.html" : pathComponents.joined(separator: "/")
        let file = root.appendingPathComponent(relativePath).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return error(403, "Resource unavailable") }

        // Reject every symlink, including links whose destination is inside the
        // bundle. This keeps the public scheme from becoming a general file API.
        var componentURL = root
        for component in pathComponents.isEmpty ? ["index.html"] : pathComponents {
            componentURL.appendPathComponent(component)
            if let attributes = try? FileManager.default.attributesOfItem(atPath: componentURL.path),
               attributes[.type] as? FileAttributeType == .typeSymbolicLink {
                return error(403, "Resource unavailable")
            }
        }
        guard file.resolvingSymlinksInPath().standardizedFileURL.path == file.path else {
            return error(403, "Resource unavailable")
        }
        guard let values = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              values.isRegularFile == true, let size = values.fileSize, size >= 0 else {
            return error(404, "Resource not found")
        }

        var headers = Self.baseHeaders
        headers["Content-Type"] = Self.mimeType(for: file.pathExtension)
        headers["Content-Length"] = String(size)
        var selectedRange: Range<Int>?
        // HTTP Range applies to GET; HEAD reports the whole representation.
        if method == "GET", let header = request.value(forHTTPHeaderField: "Range") {
            guard let range = Self.parseRange(header, length: size) else {
                return error(416, "Range not satisfiable", extra: ["Content-Range": "bytes */\(size)"])
            }
            selectedRange = range
            headers["Content-Length"] = String(range.count)
            headers["Content-Range"] = "bytes \(range.lowerBound)-\(range.upperBound - 1)/\(size)"
        }
        return ResponsePlan(url: url, statusCode: selectedRange == nil ? 200 : 206,
            headers: headers, headOnly: headOnly, fileURL: file, byteRange: selectedRange, inlineBody: Data())
    }

    private static let baseHeaders = [
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
    ]

    private static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json; charset=utf-8"
        case "glb": return "model/gltf-binary"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "wav": return "audio/wav"
        case "m4a", "mp4": return "audio/mp4"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "wasm": return "application/wasm"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    /// Supports one closed, open-ended, or suffix byte range. Invalid and
    /// multipart ranges return nil and receive a 416 response from the handler.
    private static func parseRange(_ value: String, length: Int) -> Range<Int>? {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard length > 0, value.lowercased().hasPrefix("bytes="), !value.contains(",") else { return nil }
        let parts = String(value.dropFirst(6)).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        func number(_ part: Substring) -> Int? {
            guard !part.isEmpty, part.allSatisfy({ $0 >= "0" && $0 <= "9" }) else { return nil }
            return Int(part)
        }
        if parts[0].isEmpty {
            guard let suffix = number(parts[1]), suffix > 0 else { return nil }
            return max(0, length - min(suffix, length))..<length
        }
        guard let start = number(parts[0]), start < length else { return nil }
        if parts[1].isEmpty { return start..<length }
        guard let end = number(parts[1]), end >= start else { return nil }
        return start..<(min(end, length - 1) + 1)
    }
}
