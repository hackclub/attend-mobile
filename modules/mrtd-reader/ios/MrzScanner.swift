import UIKit
import VisionKit

// Live camera text recognition for the machine readable zone. It doesn't parse
// anything: every frame's text lines go to JS, which validates the check
// digits (src/services/idCheck/mrz.ts) and dismisses the scanner once a whole
// MRZ reads correctly. Nothing is captured or saved.
@available(iOS 16.0, *)
final class MrzScanner: NSObject, DataScannerViewControllerDelegate {
    static var isSupported: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    private let onLines: ([String]) -> Void
    private let onClose: (Bool) -> Void
    private var scanner: DataScannerViewController?
    private var container: UINavigationController?
    private var closed = false

    init(onLines: @escaping ([String]) -> Void, onClose: @escaping (Bool) -> Void) {
        self.onLines = onLines
        self.onClose = onClose
    }

    func present(from presenter: UIViewController) {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.text()],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        scanner.title = "Scan the code on the document"
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel,
            target: self,
            action: #selector(cancelTapped)
        )

        let hint = UILabel()
        hint.text = "Fit the lines of <<< characters at the bottom of the photo page (or the back of the card) in view"
        hint.numberOfLines = 0
        hint.textAlignment = .center
        hint.textColor = .white
        hint.font = .preferredFont(forTextStyle: .footnote)
        hint.translatesAutoresizingMaskIntoConstraints = false
        scanner.overlayContainerView.addSubview(hint)
        NSLayoutConstraint.activate([
            hint.leadingAnchor.constraint(equalTo: scanner.overlayContainerView.leadingAnchor, constant: 24),
            hint.trailingAnchor.constraint(equalTo: scanner.overlayContainerView.trailingAnchor, constant: -24),
            hint.bottomAnchor.constraint(equalTo: scanner.overlayContainerView.safeAreaLayoutGuide.bottomAnchor, constant: -24),
        ])

        let container = UINavigationController(rootViewController: scanner)
        container.modalPresentationStyle = .fullScreen
        container.presentationController?.delegate = self
        self.scanner = scanner
        self.container = container

        presenter.present(container, animated: true) {
            do {
                try scanner.startScanning()
            } catch {
                self.dismiss(cancelled: true)
            }
        }
    }

    func dismiss(cancelled: Bool) {
        guard !closed else { return }
        closed = true
        scanner?.stopScanning()
        container?.dismiss(animated: true)
        scanner = nil
        container = nil
        onClose(cancelled)
    }

    @objc private func cancelTapped() {
        dismiss(cancelled: true)
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        emit(allItems)
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        emit(allItems)
    }

    // Top to bottom, one entry per line, so the MRZ lines arrive in order.
    private func emit(_ items: [RecognizedItem]) {
        let lines = items
            .compactMap { item -> (CGFloat, String)? in
                guard case .text(let text) = item else { return nil }
                return (text.bounds.topLeft.y, text.transcript)
            }
            .sorted { $0.0 < $1.0 }
            .flatMap { $0.1.components(separatedBy: .newlines) }
        if !lines.isEmpty {
            onLines(lines)
        }
    }
}

@available(iOS 16.0, *)
extension MrzScanner: UIAdaptivePresentationControllerDelegate {
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        dismiss(cancelled: true)
    }
}
