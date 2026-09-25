import Foundation
import Darwin

/// Operações de arquivo à prova de troca no meio do caminho (TOCTOU).
///
/// Conferir um caminho e depois mover pelo mesmo caminho não é seguro: entre uma coisa e
/// outra, qualquer pasta acima pode virar um link simbólico e o kernel resolve o caminho de
/// novo. Aqui tudo é feito a partir de descritores de pasta abertos com O_NOFOLLOW, e a
/// identidade (disco + inode) é conferida no próprio descritor, antes e depois de mexer.
enum SafeFS {
    struct Ident: Hashable, Codable {
        var dev: Int32
        var ino: UInt64
    }

    struct Info {
        var ident: Ident
        var isDir: Bool
        var isLink: Bool
        var size: Int64
        var mtimeNs: Int64
        var links: Int
    }

    private static let renameExcl: UInt32 = 0x0000_0004   // RENAME_EXCL

    static func info(_ st: stat) -> Info {
        let m = st.st_mode & S_IFMT
        return Info(ident: Ident(dev: st.st_dev, ino: UInt64(st.st_ino)), isDir: m == S_IFDIR, isLink: m == S_IFLNK,
                    size: Int64(st.st_size), mtimeNs: Int64(st.st_mtimespec.tv_sec) * 1_000_000_000 + Int64(st.st_mtimespec.tv_nsec),
                    links: Int(st.st_nlink))
    }

    /// lstat fresco (sem nenhum cache do Foundation).
    static func lstatInfo(_ path: String) -> Info? {
        var st = stat()
        guard lstat(path, &st) == 0 else { return nil }
        return info(st)
    }

    static func statAt(_ dfd: Int32, _ name: String) -> Info? {
        var st = stat()
        guard fstatat(dfd, name, &st, AT_SYMLINK_NOFOLLOW) == 0 else { return nil }
        return info(st)
    }

    /// Abre uma pasta absoluta componente por componente, recusando qualquer link simbólico
    /// no caminho. Devolve o descritor (quem chama fecha) ou nil.
    static func openDirNoFollow(_ path: String) -> Int32? {
        let comps = (path as NSString).pathComponents
        guard comps.first == "/" else { return nil }
        var fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        guard fd >= 0 else { return nil }
        for c in comps.dropFirst() {
            if c == "." || c == ".." || c.isEmpty { close(fd); return nil }
            let n = openat(fd, c, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            close(fd)
            guard n >= 0 else { return nil }
            fd = n
        }
        return fd
    }

    /// Caminho real de um descritor aberto (o que o kernel sabe, não o que alguém digitou).
    static func path(of fd: Int32) -> String? {
        var buf = [CChar](repeating: 0, count: Int(MAXPATHLEN))
        guard fcntl(fd, F_GETPATH, &buf) != -1 else { return nil }
        return String(cString: buf)
    }

    enum Failure: Error { case reason(String) }

    private static func errnoText(_ e: Int32) -> String {
        switch e {
        case EPERM, EACCES: return "o macOS não deixou (permissão)"
        case ENOENT: return "não existe mais"
        case EXDEV: return "está em outro disco"
        case EEXIST: return "já existe outro com esse nome"
        case EBUSY: return "está em uso"
        case EROFS: return "disco só de leitura"
        default: return String(cString: strerror(e))
        }
    }

    /// Resultado de mandar pra Lixeira.
    struct Trashed {
        var url: URL?        // onde foi parar (nil = o macOS não disse)
        var ident: Ident?    // identidade conferida no destino
    }

    /// Manda `name`, dentro de `parent`, pra Lixeira, desde que continue sendo exatamente o
    /// item `expected` da varredura.
    ///  1. abre `parent` sem seguir links e confere que o kernel chama ele pelo mesmo caminho;
    ///  2. confere o item pelo descritor (mesmo disco e inode, não é link);
    ///  3. move pra uma pasta de passagem com nome sorteado, ao lado (rename atômico);
    ///  4. confere de novo lá dentro (se trocaram o item no meio, desfaz e recusa);
    ///  5. manda da pasta de passagem pra Lixeira. Como ninguém adivinha o nome sorteado, trocar
    ///     uma pasta acima por um link nesse momento só faz a operação falhar.
    static func moveToTrash(parent: String, name: String, expected: Ident, sandboxTrash: String?) throws -> Trashed {
        guard !name.isEmpty, !name.contains("/"), name != ".", name != ".." else { throw Failure.reason("nome inválido") }
        guard let pfd = openDirNoFollow(parent) else { throw Failure.reason("a pasta mudou (virou atalho ou sumiu)") }
        defer { close(pfd) }
        guard path(of: pfd) == parent else { throw Failure.reason("a pasta mudou de lugar") }
        guard let before = statAt(pfd, name) else { throw Failure.reason("não existe mais") }
        guard !before.isLink else { throw Failure.reason("virou um link simbólico") }
        guard before.ident == expected else { throw Failure.reason("mudou desde a varredura") }

        let stage = ".kamurafy-saindo-" + UUID().uuidString
        guard mkdirat(pfd, stage, 0o700) == 0 else { throw Failure.reason("não deu pra preparar (\(errnoText(errno)))") }
        guard let sfd = Optional(openat(pfd, stage, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)), sfd >= 0 else {
            unlinkat(pfd, stage, AT_REMOVEDIR)
            throw Failure.reason("não deu pra preparar")
        }
        defer { close(sfd) }
        func cleanupStage() { unlinkat(pfd, stage, AT_REMOVEDIR) }
        func putBack() { _ = renameatx_np(sfd, name, pfd, name, renameExcl) }

        guard renameatx_np(pfd, name, sfd, name, renameExcl) == 0 else {
            let e = errno
            cleanupStage()
            throw Failure.reason(errnoText(e))
        }
        guard let staged = statAt(sfd, name), staged.ident == expected, !staged.isLink else {
            putBack(); cleanupStage()
            throw Failure.reason("mudou durante a limpeza")
        }

        if let trash = sandboxTrash {
            // caixa de areia: "Lixeira" de mentira, com rename atômico (falha entre discos)
            guard let tfd = openDirNoFollow(trash) else { putBack(); cleanupStage(); throw Failure.reason("Lixeira de teste sumiu") }
            defer { close(tfd) }
            let dest = String(UUID().uuidString.prefix(8)) + "-" + name
            guard renameatx_np(sfd, name, tfd, dest, renameExcl) == 0 else {
                let e = errno
                putBack(); cleanupStage()
                throw Failure.reason(errnoText(e))
            }
            cleanupStage()
            let got = statAt(tfd, dest)
            return Trashed(url: URL(fileURLWithPath: trash).appendingPathComponent(dest),
                           ident: got?.ident == expected ? expected : nil)
        }

        guard let stagePath = path(of: sfd) else { putBack(); cleanupStage(); throw Failure.reason("não deu pra preparar") }
        var out: NSURL?
        do {
            try FileManager.default.trashItem(at: URL(fileURLWithPath: stagePath).appendingPathComponent(name),
                                              resultingItemURL: &out)
        } catch {
            putBack(); cleanupStage()
            throw error
        }
        cleanupStage()
        guard let dest = out as URL? else { return Trashed(url: nil, ident: nil) }
        let got = lstatInfo(dest.path)
        return Trashed(url: dest, ident: got?.ident == expected ? expected : nil)
    }

    /// Move de volta, de uma pasta pra outra, sem seguir links e sem sobrescrever.
    static func moveBack(fromDir: String, fromName: String, expected: Ident, toDir: String, toName: String) throws {
        guard let ffd = openDirNoFollow(fromDir) else { throw Failure.reason("não achei na Lixeira") }
        defer { close(ffd) }
        guard let tfd = openDirNoFollow(toDir) else { throw Failure.reason("a pasta original não existe mais (ou virou atalho): devolva pelo Finder") }
        defer { close(tfd) }
        guard path(of: tfd) == toDir else { throw Failure.reason("a pasta original mudou de lugar") }
        guard let it = statAt(ffd, fromName), it.ident == expected, !it.isLink else { throw Failure.reason("não é mais o mesmo item") }
        guard renameatx_np(ffd, fromName, tfd, toName, renameExcl) == 0 else { throw Failure.reason(errnoText(errno)) }
    }

    /// Apaga de vez `name` dentro de `dir`, desde que seja o item `expected`. Não segue links:
    /// link dentro da árvore some como link, o destino fica intacto.
    static func removeForever(dir: String, name: String, expected: Ident) throws {
        guard let dfd = openDirNoFollow(dir) else { throw Failure.reason("não consegui abrir a Lixeira (\(errnoText(errno)))") }
        defer { close(dfd) }
        guard path(of: dfd) == dir else { throw Failure.reason("a Lixeira mudou de lugar") }
        guard let it = statAt(dfd, name), it.ident == expected else { throw Failure.reason("não é mais o mesmo item") }
        guard removeTree(dfd, name, device: it.ident.dev) else { throw Failure.reason("não deu pra apagar tudo (\(errnoText(errno)))") }
    }

    /// Apaga uma árvore relativa a um descritor, sem seguir links nem trocar de disco.
    static func removeTree(_ dfd: Int32, _ name: String, device: Int32) -> Bool {
        guard let it = statAt(dfd, name) else { return errno == ENOENT }
        guard it.ident.dev == device else { errno = EXDEV; return false }
        if it.isDir {
            let fd = openat(dfd, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            guard fd >= 0 else { return false }
            guard let d = fdopendir(fd) else { close(fd); return false }
            var names: [String] = []
            while let ent = readdir(d) {
                var nameBuf = ent.pointee.d_name
                let n = withUnsafePointer(to: &nameBuf) { $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXPATHLEN)) { String(cString: $0) } }
                if n != "." && n != ".." { names.append(n) }
            }
            let inner = dirfd(d)
            var ok = true
            for n in names where !removeTree(inner, n, device: device) { ok = false }
            closedir(d)
            guard ok else { return false }
            return unlinkat(dfd, name, AT_REMOVEDIR) == 0
        }
        return unlinkat(dfd, name, 0) == 0
    }

    /// A pasta existe exatamente nesse caminho, sem nenhum link em nenhum componente.
    static func isLiteralDir(_ path: String) -> Bool {
        guard let fd = openDirNoFollow(path) else { return false }
        defer { close(fd) }
        return self.path(of: fd) == path
    }
}
