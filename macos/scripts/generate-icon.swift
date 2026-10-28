import AppKit
import Foundation

// A native, resolution-independent icon drawing; no remote artwork is used.
let args = CommandLine.arguments
let output = args.count > 1 ? args[1] : "macos/Resources/AppIcon.png"
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
let context = NSGraphicsContext.current!.cgContext
context.setShadow(offset: .zero, blur: 0)
let backdrop = NSBezierPath(roundedRect: NSRect(x: 25, y: 25, width: 974, height: 974), xRadius: 218, yRadius: 218)
let green = NSGradient(colors: [NSColor(calibratedRed: 0.19, green: 0.36, blue: 0.28, alpha: 1), NSColor(calibratedRed: 0.045, green: 0.14, blue: 0.11, alpha: 1)])!
green.draw(in: backdrop, angle: -55)
NSColor(calibratedRed: 0.79, green: 0.71, blue: 0.47, alpha: 0.32).setStroke()
let rim = NSBezierPath(roundedRect: NSRect(x: 50, y: 50, width: 924, height: 924), xRadius: 194, yRadius: 194)
rim.lineWidth = 3
rim.stroke()

func tile(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, isMain: Bool) {
    context.saveGState()
    context.translateBy(x: x + width / 2, y: y + height / 2)
    context.rotate(by: rotation * .pi / 180)
    let rect = NSRect(x: -width / 2, y: -height / 2, width: width, height: height)
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.45)
    shadow.shadowBlurRadius = 29
    shadow.shadowOffset = NSSize(width: 9, height: -19)
    shadow.set()
    let base = NSBezierPath(roundedRect: rect.offsetBy(dx: 0, dy: -24), xRadius: 33, yRadius: 33)
    NSColor(calibratedRed: 0.65, green: 0.56, blue: 0.37, alpha: 1).setFill()
    base.fill()
    context.setShadow(offset: .zero, blur: 0)
    let face = NSBezierPath(roundedRect: rect, xRadius: 33, yRadius: 33)
    let ivory = NSGradient(colors: [NSColor(calibratedRed: 1, green: 0.98, blue: 0.88, alpha: 1), NSColor(calibratedRed: 0.87, green: 0.80, blue: 0.61, alpha: 1)])!
    ivory.draw(in: face, angle: -65)
    NSColor(calibratedRed: 1, green: 0.99, blue: 0.92, alpha: 0.85).setStroke()
    face.lineWidth = 5
    face.stroke()
    if isMain {
        let r = min(width, height) * 0.31
        let center = NSPoint(x: 0, y: 17)
        for (radius, color, weight) in [(r, NSColor(calibratedRed: 0.08, green: 0.33, blue: 0.23, alpha: 1), CGFloat(12)), (r * 0.80, NSColor(calibratedRed: 0.08, green: 0.33, blue: 0.23, alpha: 1), CGFloat(6)), (r * 0.55, NSColor(calibratedRed: 0.67, green: 0.14, blue: 0.10, alpha: 1), CGFloat(10)), (r * 0.19, NSColor(calibratedRed: 0.67, green: 0.14, blue: 0.10, alpha: 1), CGFloat(7))] {
            color.setStroke()
            let circle = NSBezierPath(ovalIn: NSRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
            circle.lineWidth = weight
            circle.stroke()
        }
        let ink = NSColor(calibratedRed: 0.08, green: 0.33, blue: 0.23, alpha: 1)
        ink.setStroke()
        for index in 0..<12 {
            let angle = CGFloat(index) * .pi / 6
            let path = NSBezierPath()
            path.move(to: NSPoint(x: cos(angle) * r * 0.60, y: center.y + sin(angle) * r * 0.60))
            path.line(to: NSPoint(x: cos(angle) * r * 0.73, y: center.y + sin(angle) * r * 0.73))
            path.lineWidth = 5
            path.stroke()
        }
        let character = "疊" as NSString
        let font = NSFont(name: "Kaiti SC", size: 79) ?? NSFont.systemFont(ofSize: 79, weight: .medium)
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        character.draw(in: NSRect(x: -width / 2, y: -height / 2 + 28, width: width, height: 101), withAttributes: [.font: font, .foregroundColor: ink, .paragraphStyle: style])
    } else {
        for point in [NSPoint(x: -46, y: 75), NSPoint(x: 46, y: -75)] {
            NSColor(calibratedRed: 0.12, green: 0.23, blue: 0.45, alpha: 1).setStroke()
            let ring = NSBezierPath(ovalIn: NSRect(x: point.x - 31, y: point.y - 31, width: 62, height: 62))
            ring.lineWidth = 10
            ring.stroke()
        }
    }
    context.restoreGState()
}

tile(x: 215, y: 235, width: 322, height: 498, rotation: 13, isMain: false)
tile(x: 440, y: 210, width: 354, height: 548, rotation: -9, isMain: true)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
let data = bitmap.representation(using: .png, properties: [:])!
try FileManager.default.createDirectory(atPath: (output as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try data.write(to: URL(fileURLWithPath: output))
print(output)
