require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MrtdReader'
  s.version        = package['version']
  s.summary        = 'Passport and ID card chip reading for ID checks'
  s.description    = 'Reads and verifies ICAO 9303 document chips with NFCPassportReader, and scans the MRZ with VisionKit.'
  s.license        = 'MIT'
  s.author         = 'Hack Club'
  s.homepage       = 'https://attend.hackclub.com'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # MIT; pulls in OpenSSL-Universal for the signature and PACE crypto.
  s.dependency 'NFCPassportReader', '~> 2.3.1'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
  # CSCA trust anchors, written by bin/update-csca.
  s.resource_bundles = { 'MrtdReaderTrust' => ['Resources/masterList.pem'] }
end
