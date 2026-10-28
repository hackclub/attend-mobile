import ExpoModulesCore
import NFCPassportReader
import CoreNFC
import Security
import UIKit

// Reads an ICAO 9303 document chip (passport, chipped ID card, residence
// permit) for the on-device ID check and returns the parsed outcome. Raw data
// groups never leave this module: JS gets DG1 fields, the face photo as a
// JPEG, and the result of each cryptographic check. Nothing is written to disk.
public class MrtdReaderModule: Module {
    private var activeReadId = 0
    private var mrzScanner: AnyObject?

    public func definition() -> ModuleDefinition {
        Name("MrtdReader")

        Events("onMrzText")

        Function("isSupported") { () -> Bool in
            return NFCTagReaderSession.readingAvailable
        }

        // VisionKit's scanner is main actor isolated, and sync functions run
        // on the JS thread.
        Function("isMrzScannerSupported") { () -> Bool in
            guard #available(iOS 16.0, *) else { return false }
            if Thread.isMainThread {
                return MainActor.assumeIsolated { MrzScanner.isSupported }
            }
            return DispatchQueue.main.sync {
                MainActor.assumeIsolated { MrzScanner.isSupported }
            }
        }

        // Whether this build bundles any CSCA certificates. Without them every
        // document's issuer is unknown, so the check can't go green.
        Function("hasTrustAnchors") { () -> Bool in
            guard let url = Self.masterListURL(), let pem = try? String(contentsOf: url, encoding: .utf8) else { return false }
            return pem.contains("-----BEGIN CERTIFICATE-----")
        }

        // Shows the camera and streams the recognised text lines as onMrzText
        // events. JS picks the MRZ out of them and calls dismissMrzScanner.
        // Resolves when the scanner closes; true if the user cancelled it.
        // runOnQueue(.main) puts these on the main thread, but the compiler
        // can't see that, hence assumeIsolated.
        AsyncFunction("presentMrzScanner") { (promise: Promise) in
            MainActor.assumeIsolated {
                guard #available(iOS 16.0, *), MrzScanner.isSupported else {
                    promise.reject("ERR_MRZ_SCANNER_UNAVAILABLE", "The camera MRZ scanner needs iOS 16 or later")
                    return
                }
                guard let presenter = self.appContext?.utilities?.currentViewController() else {
                    promise.reject("ERR_NO_VIEW_CONTROLLER", "Nothing to present the scanner from")
                    return
                }
                let scanner = MrzScanner(
                    onLines: { [weak self] lines in
                        self?.sendEvent("onMrzText", ["lines": lines])
                    },
                    onClose: { [weak self] cancelled in
                        self?.mrzScanner = nil
                        promise.resolve(cancelled)
                    }
                )
                self.mrzScanner = scanner
                scanner.present(from: presenter)
            }
        }.runOnQueue(.main)

        AsyncFunction("dismissMrzScanner") { () in
            MainActor.assumeIsolated {
                if #available(iOS 16.0, *), let scanner = self.mrzScanner as? MrzScanner {
                    scanner.dismiss(cancelled: false)
                }
            }
        }.runOnQueue(.main)

        // `mrzKey` is the BAC/PACE key seed built in JS (buildMrzKey).
        AsyncFunction("readDocument") { (mrzKey: String, promise: Promise) in
            self.activeReadId += 1
            let readId = self.activeReadId
            let reader = PassportReader(masterListURL: Self.masterListURL())

            Task {
                do {
                    let passport = try await reader.readPassport(
                        mrzKey: mrzKey,
                        tags: [.COM, .SOD, .DG1, .DG2, .DG14, .DG15],
                        aaChallenge: Self.randomChallenge(),
                        // DG3/DG4 (fingerprints, iris) sit behind Extended
                        // Access Control; never try to read them.
                        skipSecureElements: true
                    )
                    let stillWanted = await MainActor.run { readId == self.activeReadId }
                    guard stillWanted else {
                        promise.reject("ERR_CANCELLED", "Cancelled")
                        return
                    }
                    promise.resolve(try Self.result(from: passport))
                } catch let error as NFCPassportReaderError {
                    switch error {
                    case .UserCanceled:
                        promise.reject("ERR_CANCELLED", "Cancelled")
                    case .InvalidMRZKey:
                        promise.reject("ERR_ACCESS_DENIED", "The chip rejected the document details. Check them and try again.")
                    case .TimeOutError:
                        promise.reject("ERR_TIMEOUT", "The read timed out. Hold the phone still against the document and try again.")
                    case .NFCNotSupported:
                        promise.reject("ERR_NFC_UNSUPPORTED", "This device can't read document chips")
                    default:
                        promise.reject("ERR_READ_FAILED", "Couldn't read the chip (\(String(describing: error))). Try again.")
                    }
                } catch {
                    promise.reject("ERR_READ_FAILED", "Couldn't read the chip. Try again.")
                }
            }
        }.runOnQueue(.main)

        // The reader's NFC session isn't exposed, so an in-flight read can't be
        // stopped from here: the system sheet's own Cancel does that, and iOS
        // ends the session when the app leaves the foreground. This makes sure
        // a read that finishes afterwards is discarded rather than delivered.
        AsyncFunction("cancel") { () in
            self.activeReadId += 1
            MainActor.assumeIsolated {
                if #available(iOS 16.0, *), let scanner = self.mrzScanner as? MrzScanner {
                    scanner.dismiss(cancelled: true)
                }
            }
        }.runOnQueue(.main)
    }

    private static func masterListURL() -> URL? {
        let candidates = [Bundle.main, Bundle(for: MrtdReaderModule.self)]
        for bundle in candidates {
            if let trustURL = bundle.url(forResource: "MrtdReaderTrust", withExtension: "bundle"),
               let trust = Bundle(url: trustURL),
               let url = trust.url(forResource: "masterList", withExtension: "pem") {
                return url
            }
        }
        return nil
    }

    // Active authentication proves the chip holds its private key, so a copied
    // chip fails. The admin holding the phone is the trust root, so a local
    // random challenge is enough; no server nonce is needed.
    private static func randomChallenge() -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 8)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<8).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes
    }

    private static func result(from passport: NFCPassportModel) throws -> [String: Any] {
        guard let dg1 = passport.getDataGroup(.DG1) as? DataGroup1 else {
            throw NFCPassportReaderError.DataGroupNotRead
        }
        let elements = dg1.elements

        var photo = ""
        if let image = passport.passportImage, let jpeg = image.jpegData(compressionQuality: 0.8) {
            photo = jpeg.base64EncodedString()
        }

        return [
            "documentCode": (elements["5F03"] ?? "").replacingOccurrences(of: "<", with: ""),
            "issuingState": (elements["5F28"] ?? "").replacingOccurrences(of: "<", with: ""),
            "nationality": (elements["5F2C"] ?? "").replacingOccurrences(of: "<", with: ""),
            "nameField": elements["5B"] ?? "",
            "dateOfBirth": elements["5F57"] ?? "",
            "dateOfExpiry": elements["59"] ?? "",
            "photoJpegBase64": photo,
            "checks": [
                "dataIntegrity": passport.passportDataNotTampered && passport.documentSigningCertificateVerified ? "valid" : "invalid",
                "issuer": issuerStatus(passport),
                "activeAuth": !passport.activeAuthenticationSupported ? "unsupported" : (passport.activeAuthenticationPassed ? "passed" : "failed"),
                "chipAuth": chipAuthStatus(passport),
                "accessProtocol": passport.PACEStatus == .success ? "PACE" : "BAC",
            ],
        ]
    }

    private static func issuerStatus(_ passport: NFCPassportModel) -> String {
        if passport.passportCorrectlySigned { return "valid" }
        // OpenSSL error 20 / 2: no CSCA in the master list for this signer,
        // which is the issuing country missing from the list, not a forgery.
        let unknownIssuer = passport.verificationErrors.contains { error in
            guard case OpenSSLError.UnableToVerifyX509CertificateForSOD(let reason) = error else { return false }
            return reason.hasSuffix("errorCode 20")
                || reason.hasSuffix("errorCode 2")
                || reason.hasSuffix("not found")
        }
        return unknownIssuer || masterListURL() == nil ? "unknown_issuer" : "invalid"
    }

    private static func chipAuthStatus(_ passport: NFCPassportModel) -> String {
        switch passport.chipAuthenticationStatus {
        case .success: return "passed"
        case .failed: return "failed"
        case .notDone: return "unsupported"
        }
    }
}
