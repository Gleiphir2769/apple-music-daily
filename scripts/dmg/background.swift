import AppKit

// Render a Retina background using only the macOS SDK.
let width = 720, height = 440, scale = 2
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width * scale,
    pixelsHigh: height * scale, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
bitmap.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
// bitmap.size already maps the 720×440 point canvas to Retina pixels.
// Scaling the CGContext again doubles positions and clips the title/arrow.
NSColor(calibratedRed: 0.98, green: 0.97, blue: 0.95, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
func text(_ value: String, y: CGFloat, size: CGFloat, weight: NSFont.Weight, color: NSColor) {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    (value as NSString).draw(in: NSRect(x: 30, y: y, width: 660, height: size + 14),
        withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight),
                         .foregroundColor: color, .paragraphStyle: style])
}
text("Apple Music Daily", y: 354, size: 30, weight: .semibold, color: .init(white: 0.16, alpha: 1))
text("安装每日音乐发现", y: 318, size: 16, weight: .regular, color: .init(white: 0.4, alpha: 1))
let orange = NSColor(calibratedRed: 0.88, green: 0.38, blue: 0.14, alpha: 1)
orange.setStroke()
let arrow = NSBezierPath()
arrow.lineWidth = 5
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
arrow.move(to: NSPoint(x: 290, y: 225))
arrow.line(to: NSPoint(x: 430, y: 225))
arrow.move(to: NSPoint(x: 412, y: 242))
arrow.line(to: NSPoint(x: 430, y: 225))
arrow.line(to: NSPoint(x: 412, y: 208))
arrow.stroke()
text("将左侧应用拖拽到右侧 Applications", y: 116, size: 20, weight: .medium, color: .init(white: 0.2, alpha: 1))
text("复制完成后，从“应用程序”打开，即可开始使用", y: 66, size: 14, weight: .regular, color: .init(white: 0.45, alpha: 1))
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
