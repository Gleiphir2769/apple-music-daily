import SwiftUI
import MusicKit

struct SongRecord: Codable {
    let id: String
    let title: String
    let artist: String
    let album: String?
    let addedAt: Date?
    let genres: [String]
    let isrc: String?
}

@MainActor
final class Probe: ObservableObject {
    @Published var status = "准备验证 MusicKit"
    @Published var count = 50
    @Published var busy = false
    @Published var result = ""
    @Published var selected: SongRecord?
    @Published var catalogID: String?
    @Published var writeAttempted = UserDefaults.standard.bool(forKey: "playlistWriteAttempted")
    @Published var playlistID = UserDefaults.standard.string(forKey: "testPlaylistID")
    @Published var reportName = "recent-songs.json"

    private func api(_ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        let url = URL(string: "https://api.music.apple.com" + path)!
        var request = URLRequest(url: url)
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let response = try await MusicDataRequest(urlRequest: request).response()
        guard (200...299).contains(response.urlResponse.statusCode) else {
            throw NSError(domain: "AppleMusicHTTP", code: response.urlResponse.statusCode)
        }
        return (try JSONSerialization.jsonObject(with: response.data)) as? [String: Any] ?? [:]
    }

    private func report(_ values: [String: Any]) {
        reportName = "playlist-probe-result.json"
        if let data = try? JSONSerialization.data(withJSONObject: values, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]) {
            result = String(decoding: data, as: UTF8.self)
        }
    }

    private func failed(_ error: Error, stage: String) {
        let e = error as NSError
        status = "\(stage)失败：\(e.domain) / \(e.code)"
        var chain: [[String: Any]] = []
        var current: NSError? = e
        for _ in 0..<5 {
            guard let item = current else { break }
            chain.append(["domain": item.domain, "code": item.code, "description": item.localizedDescription])
            current = item.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        report(["stage": stage, "success": false, "errors": chain,
                "playlistID": playlistID as Any? ?? NSNull(),
                "note": "网络接口可能需要已注册且启用 MusicKit 的 App ID 和相应签名。此程序不会输出认证令牌。"])
    }

    func matchCatalog() async {
        guard !busy, let song = selected else { return }
        busy = true
        defer { busy = false }
        status = "验证网络授权并映射曲库 ID…"
        catalogID = nil
        do {
            // Resolve the library relationship, rather than guessing a catalog ID by title.
            let id = song.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!
            let response = try await api("/v1/me/library/songs/\(id)/catalog")
            guard let resources = response["data"] as? [[String: Any]],
                  let resource = resources.first, resource["type"] as? String == "songs",
                  let resolved = resource["id"] as? String else {
                throw NSError(domain: "AppleMusicDaily.NoCatalogMatch", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "该资料库歌曲没有返回可用的曲库歌曲 ID。"])
            }
            catalogID = resolved
            status = "曲库映射成功，可以创建单曲测试歌单"
            report(["stage": "catalog_mapping", "success": true, "libraryID": song.id,
                    "catalogID": resolved, "title": song.title, "artist": song.artist,
                    "catalogAttributes": resource["attributes"] as Any? ?? NSNull()])
        } catch { failed(error, stage: "catalog_mapping") }
    }

    func createTestPlaylist() async {
        guard !busy, !writeAttempted, let id = catalogID, let song = selected else { return }
        busy = true
        defer { busy = false }
        // Persist before sending. An uncertain write must never be blindly repeated.
        writeAttempted = true
        UserDefaults.standard.set(true, forKey: "playlistWriteAttempted")
        status = "创建一首歌的测试播放列表…"
        let name = "Codex MusicKit 验证 · " + Date().formatted(date: .numeric, time: .shortened)
        do {
            let created = try await api("/v1/me/library/playlists", body: [
                "attributes": ["name": name, "description": "MusicKit 写入验证：仅包含一首已收藏歌曲。"],
                "relationships": ["tracks": ["data": [["id": id, "type": "songs"]]]]
            ])
            guard let entries = created["data"] as? [[String: Any]],
                  let createdID = entries.first?["id"] as? String else {
                throw NSError(domain: "AppleMusicDaily.MissingPlaylistID", code: 2,
                              userInfo: [NSLocalizedDescriptionKey: "写入响应未包含歌单 ID；请检查音乐 App，不要重复创建。"])
            }
            playlistID = createdID
            UserDefaults.standard.set(createdID, forKey: "testPlaylistID")
            UserDefaults.standard.set(id, forKey: "testCatalogID")
            UserDefaults.standard.set(song.id, forKey: "testLibraryID")
            UserDefaults.standard.set(name, forKey: "testPlaylistName")
            await verifyInternal()
        } catch { failed(error, stage: "create_playlist") }
    }

    func verifyPlaylist() async {
        guard !busy, playlistID != nil else { return }
        busy = true
        defer { busy = false }
        await verifyInternal()
    }

    private func verifyInternal() async {
        guard let id = playlistID else { return }
        status = "歌单已创建，读取歌曲验证…"
        do {
            let pathID = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!
            let response = try await api("/v1/me/library/playlists/\(pathID)/tracks")
            let tracks = response["data"] as? [[String: Any]] ?? []
            let expected = UserDefaults.standard.string(forKey: "testCatalogID")
            let library = UserDefaults.standard.string(forKey: "testLibraryID")
            let verified = tracks.count == 1 && tracks.contains { item in
                let attrs = item["attributes"] as? [String: Any]
                let params = attrs?["playParams"] as? [String: Any]
                return item["id"] as? String == expected || item["id"] as? String == library ||
                    params?["catalogId"] as? String == expected
            }
            status = verified ? "成功：歌单已创建，且读回了目标歌曲" : "歌单已创建，歌曲尚未核对成功；可稍后点击重新验证"
            report(["stage": "verify_playlist", "success": verified, "playlistCreated": true,
                    "playlistID": id, "trackCount": tracks.count, "tracks": tracks,
                    "expectedCatalogID": expected as Any? ?? NSNull(),
                    "playlistName": UserDefaults.standard.string(forKey: "testPlaylistName") ?? ""])
        } catch { failed(error, stage: "verify_playlist") }
    }

    func run() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        status = "请求音乐资料库授权…"
        let permission = await MusicAuthorization.request()
        guard permission == .authorized else {
            status = "尚未获得授权：\(permission)"
            return
        }
        status = "已授权，读取最近 \(count) 首歌曲…"
        do {
            var request = MusicLibraryRequest<Song>()
            request.sort(by: \.libraryAddedDate, ascending: false)
            request.limit = count
            request.offset = 0
            request.includeOnlyDownloadedContent = false
            let response = try await request.response()
            let rows = response.items.map {
                SongRecord(id: $0.id.rawValue, title: $0.title, artist: $0.artistName,
                           album: $0.albumTitle, addedAt: $0.libraryAddedDate,
                           genres: $0.genreNames, isrc: $0.isrc)
            }
            selected = rows.first
            catalogID = nil
            reportName = "recent-songs.json"
            let dates = rows.compactMap(\.addedAt)
            let descending = zip(dates, dates.dropFirst()).allSatisfy { $0 >= $1 }
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            encoder.dateEncodingStrategy = .iso8601
            result = String(decoding: try encoder.encode(rows), as: UTF8.self)
            status = "读取 \(rows.count) 首；\(dates.count) 首含添加时间；时间倒序：\(descending ? "是" : "否")"
        } catch {
            let e = error as NSError
            status = "读取失败：\(e.domain) / \(e.code)"
            result = e.localizedDescription
        }
    }

    func save() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = reportName
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try result.write(to: url, atomically: true, encoding: .utf8) }
        catch { status = "保存失败：\(error.localizedDescription)" }
    }
}

@main
struct AppleMusicDailyApp: App {
    var body: some Scene {
        WindowGroup("每日音乐发现") { DailyRecommendationView() }
    }
}
