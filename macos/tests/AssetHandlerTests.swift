import Foundation
import WebKit

private enum TestFailure: Error { case failed(String) }

private final class SchemeTaskProbe: NSObject, WKURLSchemeTask {
    let request: URLRequest
    var events: [String] = []
    var response: HTTPURLResponse?
    var bytes = Data()
    var onResponse: (() -> Void)?
    var onFinish: (() -> Void)?

    init(_ request: URLRequest) { self.request = request }
    func didReceive(_ response: URLResponse) {
        events.append("response"); self.response = response as? HTTPURLResponse; onResponse?()
    }
    func didReceive(_ data: Data) { events.append("data"); bytes.append(data) }
    func didFinish() { events.append("finish"); onFinish?() }
    func didFailWithError(_ error: Error) { events.append("error"); onFinish?() }
}

@main
struct AssetHandlerTests {
    @MainActor
    static func main() async throws {
        let fm = FileManager.default
        let temporary = fm.temporaryDirectory.appendingPathComponent("mahjong-handler-tests-\(UUID().uuidString)")
        let root = temporary.appendingPathComponent("Web")
        try fm.createDirectory(at: root.appendingPathComponent("src"), withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: temporary) }
        try Data("0123456789".utf8).write(to: root.appendingPathComponent("sample.glb"))
        try Data("<html>offline</html>".utf8).write(to: root.appendingPathComponent("index.html"))
        try Data("export const answer=42;".utf8).write(to: root.appendingPathComponent("src/app.js"))
        try Data().write(to: root.appendingPathComponent("empty.wav"))
        try Data("private".utf8).write(to: temporary.appendingPathComponent("secret.txt"))
        try fm.createSymbolicLink(at: root.appendingPathComponent("escape.txt"), withDestinationURL: temporary.appendingPathComponent("secret.txt"))
        try fm.createSymbolicLink(at: root.appendingPathComponent("inside.glb"), withDestinationURL: root.appendingPathComponent("sample.glb"))

        let handler = AssetSchemeHandler(root: root)
        var checks = 0
        func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
            guard try condition() else { throw TestFailure.failed(message) }
            checks += 1
        }
        func request(_ path: String, method: String = "GET", range: String? = nil) -> URLRequest {
            var request = URLRequest(url: URL(string: "mahjong://app" + path)!)
            request.httpMethod = method
            if let range { request.setValue(range, forHTTPHeaderField: "Range") }
            return request
        }

        let index = handler.responsePlan(for: request("/"))
        try expect(index.statusCode == 200, "Root must load index.html")
        try expect(index.headers["Content-Type"] == "text/html; charset=utf-8", "HTML MIME")
        try expect(try index.readData() == Data("<html>offline</html>".utf8), "Root body")
        let script = handler.responsePlan(for: request("/src/app.js?art=revision-123"))
        try expect(script.statusCode == 200, "Query does not change resource path")
        try expect(script.headers["Content-Type"] == "application/javascript; charset=utf-8", "Strict module MIME")
        try expect(script.headers["Access-Control-Allow-Origin"] == "*", "CORS header")
        try expect(handler.responsePlan(for: request("/missing.js")).statusCode == 404, "Missing files fail")
        try expect(handler.responsePlan(for: request("/src")).statusCode == 404, "Directories cannot be read")
        let post = handler.responsePlan(for: request("/sample.glb", method: "POST"))
        try expect(post.statusCode == 405 && post.headers["Allow"] == "GET, HEAD", "Only GET/HEAD")

        for url in ["mahjong://other/sample.glb", "https://app/sample.glb", "mahjong://user@app/sample.glb", "mahjong://app:80/sample.glb"] {
            try expect(handler.responsePlan(for: URLRequest(url: URL(string: url)!)).statusCode == 403, "Origin must be app: \(url)")
        }
        for path in ["/%2e%2e/secret.txt", "/src/%2E%2E/%2e%2e/secret.txt", "/%00secret.txt", "/src%5capp.js", "/escape.txt", "/inside.glb"] {
            try expect(handler.responsePlan(for: request(path)).statusCode == 403, "Path traversal and symlinks rejected: \(path)")
        }

        for (header, expected, description) in [
            ("bytes=0-3", "0123", "bytes 0-3/10"),
            ("bytes=6-", "6789", "bytes 6-9/10"),
            ("bytes=-4", "6789", "bytes 6-9/10"),
            ("bytes=-40", "0123456789", "bytes 0-9/10"),
            ("bytes=8-30", "89", "bytes 8-9/10")
        ] {
            let plan = handler.responsePlan(for: request("/sample.glb", range: header))
            try expect(plan.statusCode == 206, "Range status: \(header)")
            try expect(plan.headers["Content-Range"] == description, "Range header: \(header)")
            try expect(plan.headers["Content-Length"] == String(expected.utf8.count), "Range length: \(header)")
            try expect(try plan.readData() == Data(expected.utf8), "Range body: \(header)")
        }
        for range in ["bytes=10-", "bytes=5-3", "bytes=-0", "bytes=0-1,4-5", "items=0-3", "bytes=no-3", "bytes=999999999999999999999-"] {
            let plan = handler.responsePlan(for: request("/sample.glb", range: range))
            try expect(plan.statusCode == 416 && plan.headers["Content-Range"] == "bytes */10", "Invalid ranges receive 416: \(range)")
        }
        try expect(handler.responsePlan(for: request("/empty.wav", range: "bytes=0-")).statusCode == 416, "Empty range")
        let head = handler.responsePlan(for: request("/sample.glb", method: "HEAD", range: "bytes=0-3"))
        try expect(head.statusCode == 200 && head.headers["Content-Length"] == "10", "HEAD reports full representation")
        try expect(try head.readData().isEmpty, "HEAD has no body")
        try expect(handler.responsePlan(for: request("/sample.glb")).headers["Content-Type"] == "model/gltf-binary", "GLB MIME")

        for (name, type) in [("audio.wav", "audio/wav"), ("voice.m4a", "audio/mp4"), ("font.woff2", "font/woff2"), ("icon.svg", "image/svg+xml"), ("tile.png", "image/png"), ("style.css", "text/css; charset=utf-8"), ("data.json", "application/json; charset=utf-8")] {
            try Data("test".utf8).write(to: root.appendingPathComponent(name))
            try expect(handler.responsePlan(for: request("/" + name)).headers["Content-Type"] == type, "MIME: \(name)")
        }

        let normal = SchemeTaskProbe(request("/sample.glb", range: "bytes=2-5"))
        await withCheckedContinuation { continuation in
            normal.onFinish = { continuation.resume() }
            handler.startTask(normal)
        }
        try expect(normal.events == ["response", "data", "finish"], "Task callback order")
        try expect(normal.response?.statusCode == 206 && normal.bytes == Data("2345".utf8), "HTTP response for custom scheme")

        let stopped = SchemeTaskProbe(request("/sample.glb"))
        handler.startTask(stopped)
        handler.stopTask(stopped)
        try await Task.sleep(nanoseconds: 50_000_000)
        try expect(stopped.events.isEmpty, "Stopped tasks never receive callbacks")

        let canceledInResponse = SchemeTaskProbe(request("/sample.glb"))
        await withCheckedContinuation { continuation in
            canceledInResponse.onResponse = { [weak canceledInResponse] in
                if let task = canceledInResponse { handler.stopTask(task) }
                continuation.resume()
            }
            handler.startTask(canceledInResponse)
        }
        try await Task.sleep(nanoseconds: 10_000_000)
        try expect(canceledInResponse.events == ["response"], "Cancellation after response suppresses data and finish")
        print("Asset handler: \(checks) checks passed")
    }
}
