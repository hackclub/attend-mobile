import ExpoModulesCore
import PassKit

// Presents Apple Wallet's native "Add Pass" sheet (PKAddPassesViewController)
// from a .pkpass URL, so attendees add their ticket without leaving the app.
public class WalletModule: Module {
    // Retain the delegate for the lifetime of the presented sheet.
    private var addPassesDelegate: AddPassesDelegate?

    public func definition() -> ModuleDefinition {
        Name("Wallet")

        // Whether this device can add passes to Wallet (false on Simulator).
        Function("canAddPasses") { () -> Bool in
            return PKAddPassesViewController.canAddPasses()
        }

        // Download the .pkpass at `urlString` and present the native add sheet.
        // Resolves true if the sheet was presented, false otherwise (caller can
        // then fall back to opening the URL in the browser).
        AsyncFunction("addPassFromUrl") { (urlString: String, promise: Promise) in
            guard PKAddPassesViewController.canAddPasses(), let url = URL(string: urlString) else {
                promise.resolve(false)
                return
            }

            let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
                guard let self = self, let data = data, error == nil else {
                    promise.resolve(false)
                    return
                }

                DispatchQueue.main.async {
                    do {
                        let pass = try PKPass(data: data)
                        guard let passVC = PKAddPassesViewController(pass: pass) else {
                            promise.resolve(false)
                            return
                        }
                        guard let presenter = self.appContext?.utilities?.currentViewController() else {
                            promise.resolve(false)
                            return
                        }

                        let delegate = AddPassesDelegate()
                        self.addPassesDelegate = delegate
                        passVC.delegate = delegate

                        presenter.present(passVC, animated: true) {
                            promise.resolve(true)
                        }
                    } catch {
                        promise.resolve(false)
                    }
                }
            }
            task.resume()
        }
    }
}

private class AddPassesDelegate: NSObject, PKAddPassesViewControllerDelegate {
    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
        controller.dismiss(animated: true, completion: nil)
    }
}
